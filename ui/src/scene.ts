import { loadFromBlob, restoreAppState } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	AppState,
	ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { storedSceneSchema } from "./schemas.ts";

export type LocalSceneAppState = () => AppState | null;

/** Parse a document's stored `source` into Excalidraw initial data. A blank or
 *  unparseable source opens an empty board rather than erroring. */
export async function restoreStoredScene(
	source: string,
	getLocalAppState: LocalSceneAppState = () => null,
	localElements: readonly ExcalidrawElement[] | null = null
): Promise<ExcalidrawInitialDataState | null> {
	if (!source.trim()) {
		return null;
	}
	try {
		const serialized = storedSceneSchema.parse(JSON.parse(source));
		const restored = await loadFromBlob(
			new Blob([JSON.stringify({ ...serialized, type: "excalidraw" })], {
				type: "application/vnd.excalidraw+json",
			}),
			null,
			localElements
		);
		// Blob restoration is asynchronous; read native local state immediately
		// before merging so pan/tool changes made during import remain current.
		const localAppState = getLocalAppState();
		const appState = restoreAppState(
			{ ...localAppState, ...serialized.appState },
			localAppState
		);
		if (localAppState) {
			// Import normalization resets transient editing state. Peer updates
			// retain the user's current frame and tool unless a tool was supplied.
			appState.editingFrame = localAppState.editingFrame;
			if (!Object.hasOwn(serialized.appState ?? {}, "activeTool")) {
				appState.activeTool = localAppState.activeTool;
			}
		}
		return { ...restored, appState };
	} catch {
		return null;
	}
}
