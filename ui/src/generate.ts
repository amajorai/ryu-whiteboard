// In-frame AI diagram generation for the whiteboard app.
//
// This REPLACES the Core `POST /api/whiteboard/generate` endpoint: the app calls
// `window.ryu.model.complete` (Gateway-routed, capability-gated) with the SAME
// system prompt the Core handler used, then reproduces the handler's response
// parsing (strip code fence → JSON parse → bare-Mermaid salvage → resolve format)
// and the desktop's `lib/whiteboard/generate.ts` conversion (Mermaid/skeleton →
// Excalidraw elements) entirely in-frame. Keeping the prompt identical is what
// makes the output shape (`format:"mermaid"|"skeleton"`) match the converters.

import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

/** The Core `whiteboard_generate_handler` system prompt, verbatim, so the model's
 *  output still matches `resultToElements` (mermaid vs skeleton). */
const SYSTEM_PROMPT =
	"You turn a user's request into a diagram for an Excalidraw whiteboard. " +
	"Reply with ONLY a single JSON object and nothing else — no prose, no code fences. " +
	"Choose ONE of two shapes: " +
	"(1) For flowcharts, sequence/ER/class diagrams, mind maps, org charts, or any " +
	'connected-node diagram, return {"format":"mermaid","mermaid":"<a valid Mermaid definition>"}. ' +
	"(2) For freeform layouts (loose boxes, labels, arrows placed by position), return " +
	'{"format":"skeleton","skeleton":[ ... ]} where each item is an Excalidraw element ' +
	'skeleton, e.g. {"type":"rectangle","x":100,"y":100,"width":180,"height":70,"id":"a","label":{"text":"Box"}} ' +
	'and arrows {"type":"arrow","x":0,"y":0,"start":{"id":"a"},"end":{"id":"b"}}. ' +
	"Prefer Mermaid for anything diagram-shaped. Keep it focused and readable.";

/** The Mermaid diagram keywords a bare (unwrapped) reply may start with — used to
 *  salvage a Mermaid definition the model returned without the JSON envelope.
 *  Mirrors Core's `MERMAID_KEYWORDS`. */
const MERMAID_KEYWORDS = [
	"graph",
	"flowchart",
	"sequencediagram",
	"classdiagram",
	"erdiagram",
	"mindmap",
	"gantt",
	"statediagram",
	"journey",
	"gitgraph",
	"pie",
];

interface WhiteboardGeneration {
	format: "mermaid" | "skeleton" | "";
	mermaid?: string;
	skeleton?: unknown[];
}

/** Strip a leading/trailing ``` code fence (```json … ```), mirroring Core's
 *  `strip_code_fence`, so a fenced JSON reply still parses. */
function stripCodeFence(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith("```")) {
		return trimmed;
	}
	// Drop the opening fence line (``` or ```json) and any closing fence.
	const withoutOpen = trimmed.replace(/^```[^\n]*\n?/, "");
	return withoutOpen.replace(/```\s*$/, "").trim();
}

/** Parse the raw model reply into a generation result. Mirrors the Core handler's
 *  parse + bare-Mermaid salvage + format resolution. */
function parseGeneration(raw: string): WhiteboardGeneration {
	const cleaned = stripCodeFence(raw);
	let parsed: Record<string, unknown> | null = null;
	try {
		parsed = JSON.parse(cleaned) as Record<string, unknown>;
	} catch {
		// Salvage a bare Mermaid definition returned without the JSON envelope.
		const lc = cleaned.trimStart().toLowerCase();
		if (MERMAID_KEYWORDS.some((k) => lc.startsWith(k))) {
			return { format: "mermaid", mermaid: cleaned };
		}
		return { format: "" };
	}
	const format = typeof parsed.format === "string" ? parsed.format : "";
	const mermaid =
		typeof parsed.mermaid === "string" ? parsed.mermaid : undefined;
	const skeleton = Array.isArray(parsed.skeleton) ? parsed.skeleton : undefined;
	const resolved =
		format === "mermaid" || (format === "" && mermaid)
			? "mermaid"
			: format === "skeleton" || (format === "" && skeleton)
				? "skeleton"
				: "";
	return {
		format: resolved as WhiteboardGeneration["format"],
		mermaid,
		skeleton,
	};
}

/** Convert a parsed generation into fully-realized Excalidraw elements. Mirrors the
 *  desktop `resultToElements`. Returns `[]` for an empty/malformed payload. */
async function resultToElements(
	result: WhiteboardGeneration
): Promise<ExcalidrawElement[]> {
	if (result.format === "mermaid" && result.mermaid?.trim()) {
		const { elements } = await parseMermaidToExcalidraw(result.mermaid);
		return convertToExcalidrawElements(elements);
	}
	if (result.format === "skeleton" && Array.isArray(result.skeleton)) {
		return convertToExcalidrawElements(
			result.skeleton as Parameters<typeof convertToExcalidrawElements>[0]
		);
	}
	return [];
}

/**
 * Generate a diagram from `prompt` via the capability-gated model completion and
 * return the Excalidraw elements to drop onto the board (empty when the model
 * returned nothing usable). Throws on a missing bridge / model failure so callers
 * can surface it.
 */
export async function generateElements(
	prompt: string,
	existingCount: number
): Promise<ExcalidrawElement[]> {
	const model = window.ryu?.model;
	if (!model) {
		throw new Error("model capability is not available");
	}
	const user = `Request: ${prompt}\n\nThe board currently has ${existingCount} element(s). Generate the requested diagram.`;
	const raw = await model.complete({ system: SYSTEM_PROMPT, prompt: user });
	const result = parseGeneration(raw);
	return resultToElements(result);
}
