import { restoreAppState } from "@excalidraw/excalidraw";
import type { AppState } from "@excalidraw/excalidraw/types";
import { z } from "zod";
import { restoreStoredScene } from "../src/scene.ts";
import { storedSceneSchema } from "../src/schemas.ts";

const sceneRestoreProbeResultSchema = z.object({
	background: z.string(),
	editingFrame: z.string(),
	elements: z.number(),
	gridSize: z.number(),
	gridStep: z.number(),
	legacyScrollX: z.number(),
	legacyZoom: z.number(),
	latestScrollX: z.number(),
	previousTool: z.string(),
	sameActiveTool: z.boolean(),
	scrollX: z.number(),
	scrollY: z.number(),
	tool: z.string(),
	zoom: z.number(),
});
export type SceneRestoreProbeResult = z.output<
	typeof sceneRestoreProbeResultSchema
>;

/** Exercise the real public SDK normalizer in Chromium, including the legacy
 * numeric zoom representation and native state that belongs to this editor. */
export async function runStoredSceneRestoreProbe(): Promise<SceneRestoreProbeResult> {
	const serializedLocal = storedSceneSchema.parse({
		appState: {
			activeTool: {
				customType: null,
				lastActiveTool: null,
				locked: false,
				type: "rectangle",
			},
			gridSize: 17,
			gridStep: 11,
			scrollX: 431,
			scrollY: 112,
			zoom: { value: 1.5 },
		},
		elements: [],
		files: {},
	});
	const base = restoreAppState(serializedLocal.appState ?? {}, null);
	const local: AppState = {
		...base,
		activeTool: {
			...base.activeTool,
			lastActiveTool: { customType: null, type: "ellipse" },
		},
		editingFrame: "local-frame",
		height: 926,
		offsetLeft: 0,
		offsetTop: 34,
		width: 1440,
	};
	const restored = await restoreStoredScene(
		JSON.stringify({
			appState: { viewBackgroundColor: "#abc123" },
			elements: [],
			files: {},
		}),
		() => local,
		[]
	);
	const legacy = await restoreStoredScene(
		JSON.stringify({
			appState: { scrollX: 999, zoom: 2 },
			elements: [],
			files: {},
		}),
		() => local,
		[]
	);

	let latestLocal = local;
	const pending = restoreStoredScene(
		JSON.stringify({
			elements: [],
			files: {},
			appState: { viewBackgroundColor: "#abc123" },
		}),
		() => latestLocal,
		[]
	);
	latestLocal = { ...local, scrollX: 812 };
	const latest = await pending;
	return sceneRestoreProbeResultSchema.parse({
		background: restored?.appState?.viewBackgroundColor,
		editingFrame: restored?.appState?.editingFrame,
		elements: restored?.elements?.length,
		gridSize: restored?.appState?.gridSize,
		gridStep: restored?.appState?.gridStep,
		legacyScrollX: legacy?.appState?.scrollX,
		legacyZoom: legacy?.appState?.zoom?.value,
		latestScrollX: latest?.appState?.scrollX,
		previousTool: restored?.appState?.activeTool?.lastActiveTool?.type,
		sameActiveTool: restored?.appState?.activeTool === local.activeTool,
		scrollX: restored?.appState?.scrollX,
		scrollY: restored?.appState?.scrollY,
		tool: restored?.appState?.activeTool?.type,
		zoom: restored?.appState?.zoom?.value,
	});
}
