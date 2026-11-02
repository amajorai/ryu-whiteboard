// Co-located tests for the whiteboard's in-frame AI diagram generation.
//
// `generate.ts` statically imports @excalidraw/excalidraw + the mermaid converter,
// whose module-load side effects touch `window` and a real canvas 2D context — so
// the module cannot be imported under `bun test` as-is (it throws at load). The two
// pure-logic seams we care about (`parseGeneration`: fence-strip → JSON parse →
// bare-Mermaid salvage → format resolution, and `resultToElements`: the mermaid vs
// skeleton dispatch) are NOT exported, so they're only reachable through the public
// `generateElements`. We therefore `mock.module` the two excalidraw imports with
// lightweight stubs BEFORE a dynamic import of the module — this loads zero real
// excalidraw (no DOM needed) and lets us assert the real parse + dispatch behaviour,
// including that the correct derived input reaches each converter.

import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";
import type { RyuModel } from "./ryu.d.ts";
import type { WhiteboardElementSkeleton } from "./schemas.ts";

// ── Converter stubs + call recorders ─────────────────────────────────────────
// convertToExcalidrawElements tags each input skeleton so we can prove the array
// that reached it, and preserves original fields so dispatch order is observable.
let convertCalls: WhiteboardElementSkeleton[][];
let mermaidCalls: string[];

mock.module("@excalidraw/excalidraw", () => ({
	convertToExcalidrawElements: (skeleton: WhiteboardElementSkeleton[]) => {
		convertCalls.push(skeleton);
		return skeleton.map((s, i) => ({
			...s,
			__converted: true,
			seq: i,
		}));
	},
}));

mock.module("@excalidraw/mermaid-to-excalidraw", () => ({
	parseMermaidToExcalidraw: (def: string) => {
		mermaidCalls.push(def);
		return Promise.resolve({
			elements: [{ type: "rectangle", x: 0, y: 0, customData: { from: def } }],
		});
	},
}));

let generateElements: typeof import("./generate.ts").generateElements;
const convertedFixtureSchema = z.object({
	__converted: z.boolean(),
	seq: z.number(),
	id: z.string().optional(),
});

beforeAll(async () => {
	({ generateElements } = await import("./generate.ts"));
});

// ── Host bridge harness ──────────────────────────────────────────────────────
// generateElements reads window.ryu.model.complete at call time. Each test gets a
// fresh window whose model returns a canned raw reply; `lastCall` captures the args.
let lastCall: { system?: string; prompt: string } | null;

function installCompletion(complete: RyuModel["complete"]): void {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: {
			ryu: {
				model: {
					complete(input: Parameters<RyuModel["complete"]>[0]) {
						lastCall = input;
						return complete(input);
					},
				},
			},
		},
	});
}
function installModel(reply: string): void {
	installCompletion(() => Promise.resolve(reply));
}

beforeEach(() => {
	convertCalls = [];
	mermaidCalls = [];
	lastCall = null;
	// Known-good default so no test inherits a prior test's window mutation.
	installModel(JSON.stringify({ format: "skeleton", skeleton: [] }));
});

// ── Bridge contract ──────────────────────────────────────────────────────────
describe("generateElements — bridge contract", () => {
	it("rejects when the model capability is absent", async () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			writable: true,
			value: {},
		}); // no ryu
		await expect(generateElements("anything", 0)).rejects.toThrow(
			"model capability is not available"
		);
	});

	it("sends the verbatim system prompt and a user message carrying the request + element count", async () => {
		installModel("not-a-diagram");
		await generateElements("a signup flow", 3);
		expect(lastCall).not.toBeNull();
		expect(lastCall?.system).toContain(
			"You turn a user's request into a diagram"
		);
		expect(lastCall?.prompt).toContain("Request: a signup flow");
		expect(lastCall?.prompt).toContain("has 3 element(s)");
	});

	it("propagates a model refusal and allows an explicit retry", async () => {
		installCompletion(() => Promise.reject(new Error("model unavailable")));
		await expect(generateElements("retry me", 2)).rejects.toThrow(
			"model unavailable"
		);
		expect(convertCalls).toHaveLength(0);

		installModel(
			JSON.stringify({
				format: "skeleton",
				skeleton: [{ id: "recovered", type: "rectangle", x: 0, y: 0 }],
			})
		);
		const recovered = await generateElements("retry me", 2);
		expect(recovered).toHaveLength(1);
		expect(recovered[0]?.id).toBe("recovered");
	});
});

// ── Empty / malformed replies never reach a converter ────────────────────────
describe("generateElements — nothing-to-draw paths (mock-free)", () => {
	it("returns [] for a non-JSON, non-Mermaid reply", async () => {
		installModel("Sorry, I can't do that.");
		const els = await generateElements("x", 0);
		expect(els).toEqual([]);
		expect(convertCalls.length).toBe(0);
		expect(mermaidCalls.length).toBe(0);
	});

	it("returns [] for an empty JSON object", async () => {
		installModel("{}");
		expect(await generateElements("x", 0)).toEqual([]);
		expect(convertCalls.length).toBe(0);
	});

	it('returns [] for {"format":"mermaid"} with no mermaid string', async () => {
		installModel(JSON.stringify({ format: "mermaid" }));
		expect(await generateElements("x", 0)).toEqual([]);
		expect(mermaidCalls.length).toBe(0);
	});

	it("returns [] for a mermaid payload that is only whitespace", async () => {
		installModel(JSON.stringify({ format: "mermaid", mermaid: "   \n  " }));
		expect(await generateElements("x", 0)).toEqual([]);
		expect(mermaidCalls.length).toBe(0);
	});

	it('returns [] for {"format":"skeleton"} whose skeleton is not an array', async () => {
		installModel(JSON.stringify({ format: "skeleton", skeleton: "nope" }));
		expect(await generateElements("x", 0)).toEqual([]);
		expect(convertCalls.length).toBe(0);
	});
});

// ── Skeleton dispatch ────────────────────────────────────────────────────────
describe("generateElements — skeleton dispatch", () => {
	it("forwards the skeleton array to convertToExcalidrawElements and returns its output", async () => {
		const skeleton: WhiteboardElementSkeleton[] = [
			{ type: "rectangle", id: "a", x: 0, y: 0, label: { text: "Box" } },
			{ type: "arrow", x: 0, y: 0, start: { id: "a" }, end: { id: "b" } },
		];
		installModel(JSON.stringify({ format: "skeleton", skeleton }));
		const els = await generateElements("two boxes", 0);
		// The exact skeleton array reached the converter.
		expect(convertCalls.length).toBe(1);
		expect(convertCalls[0]).toEqual(skeleton);
		expect(mermaidCalls.length).toBe(0);
		// And the converter's output is what generateElements returns.
		expect(els.length).toBe(2);
		expect(convertedFixtureSchema.parse(els[0]).__converted).toBe(true);
		expect(convertedFixtureSchema.parse(els[0]).id).toBe("a");
	});

	it('infers skeleton when the "format" field is omitted but a skeleton array is present', async () => {
		const skeleton: WhiteboardElementSkeleton[] = [
			{ type: "ellipse", id: "e", x: 0, y: 0 },
		];
		installModel(JSON.stringify({ skeleton }));
		const els = await generateElements("a circle", 0);
		expect(convertCalls[0]).toEqual(skeleton);
		expect(els.length).toBe(1);
	});
});

// ── Mermaid dispatch, fence stripping, and bare-Mermaid salvage ───────────────
describe("generateElements — mermaid dispatch", () => {
	it("forwards the mermaid definition through parseMermaidToExcalidraw then convertToExcalidrawElements", async () => {
		const mermaid = "graph TD; A-->B; B-->C";
		installModel(JSON.stringify({ format: "mermaid", mermaid }));
		const els = await generateElements("a flow", 0);
		// The mermaid string reached the mermaid parser...
		expect(mermaidCalls).toEqual([mermaid]);
		// ...and the parser's elements were handed to the excalidraw converter.
		expect(convertCalls.length).toBe(1);
		expect(convertCalls[0]).toEqual([
			{ type: "rectangle", x: 0, y: 0, customData: { from: mermaid } },
		]);
		expect(els.length).toBe(1);
		expect(convertedFixtureSchema.parse(els[0]).__converted).toBe(true);
	});

	it("strips a ```json code fence before parsing", async () => {
		const mermaid = "flowchart LR; X-->Y";
		installModel(
			`\`\`\`json\n${JSON.stringify({ format: "mermaid", mermaid })}\n\`\`\``
		);
		await generateElements("fenced", 0);
		expect(mermaidCalls).toEqual([mermaid]);
	});

	it("salvages a bare Mermaid definition returned without the JSON envelope", async () => {
		installModel("sequenceDiagram\n  Alice->>Bob: Hi");
		await generateElements("salvage", 0);
		expect(mermaidCalls).toEqual(["sequenceDiagram\n  Alice->>Bob: Hi"]);
	});

	it("does NOT salvage prose that merely mentions a Mermaid keyword mid-sentence", async () => {
		installModel("here is a graph for you");
		const els = await generateElements("prose", 0);
		expect(els).toEqual([]);
		expect(mermaidCalls.length).toBe(0);
	});

	it('infers mermaid when the "format" field is omitted but a mermaid string is present', async () => {
		const mermaid = "mindmap\n  root((idea))";
		installModel(JSON.stringify({ mermaid }));
		await generateElements("mind map", 0);
		expect(mermaidCalls).toEqual([mermaid]);
	});
});
