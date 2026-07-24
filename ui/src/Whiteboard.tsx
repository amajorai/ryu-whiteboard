// The Whiteboard app — an Excalidraw board that IS a Space document.
//
// Mirrors the persistence + AI-generate behaviour of the built-in
// `SpaceWhiteboardEditorPage` it replaces, but reaches the platform through the
// capability-gated `window.ryu` bridge instead of the desktop's node client:
//   - Load:  window.ryu.spaces.getDoc({ doc_id })  → parse Excalidraw JSON.
//   - Save:  window.ryu.spaces.updateDoc({ doc_id, title, source })  (debounced;
//            Core re-embeds for search + re-resolves [[backlinks]] on every save).
//   - AI:    generateElements(...) → window.ryu.model.complete (Gateway-routed).
// The `{ spaceId, docId }` it operates on is baked into `window.ryu.context` by the
// host when the app is opened as a Space document.

import {
	Excalidraw,
	hashElementsVersion,
	serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	AppState,
	ExcalidrawImperativeAPI,
	ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateElements } from "./generate";

const SAVE_DEBOUNCE_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
	idle: "",
	saving: "Saving…",
	saved: "Saved",
	error: "Saved on this device",
};

/** Parse a document's stored `source` into Excalidraw initial data. A blank or
 *  unparseable source opens an empty board rather than erroring. */
function parseScene(source: string): ExcalidrawInitialDataState | null {
	if (!source.trim()) {
		return null;
	}
	try {
		const scene = JSON.parse(source) as ExcalidrawInitialDataState;
		return {
			elements: scene.elements ?? [],
			appState: scene.appState ?? {},
			files: scene.files ?? {},
		};
	} catch {
		return null;
	}
}

export function Whiteboard() {
	const ctx = typeof window === "undefined" ? null : window.ryu?.context;
	const docId = ctx?.docId ?? "";

	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [initialData, setInitialData] =
		useState<ExcalidrawInitialDataState | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [aiOpen, setAiOpen] = useState(false);
	const [aiPrompt, setAiPrompt] = useState("");
	const [aiBusy, setAiBusy] = useState(false);
	const [aiError, setAiError] = useState<string | null>(null);
	const [reloadNonce, setReloadNonce] = useState(0);

	const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
	const titleRef = useRef("");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// The scene version at the last successful save — skips no-op PUTs on pure
	// selection/scroll changes (which still fire Excalidraw's onChange).
	const savedVersionRef = useRef<number>(-1);

	useEffect(() => {
		if (!docId) {
			setError(
				"This whiteboard has no document context. Open it from a Space."
			);
			return;
		}
		const spaces = window.ryu?.spaces;
		if (!spaces) {
			setError("The Spaces capability is not available for this app.");
			return;
		}
		let cancelled = false;
		setLoaded(false);
		setError(null);
		spaces
			.getDoc({ doc_id: docId })
			.then((doc) => {
				if (cancelled) {
					return;
				}
				if (!doc) {
					setError("This whiteboard could not be found.");
					return;
				}
				setTitle(doc.title);
				titleRef.current = doc.title;
				setInitialData(parseScene(doc.source));
				setLoaded(true);
			})
			.catch(() => {
				if (!cancelled) {
					setError(
						"We couldn't open this whiteboard. Check your connection and try again."
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [docId, reloadNonce]);

	const flush = useCallback(async () => {
		const api = apiRef.current;
		const spaces = window.ryu?.spaces;
		if (!(api && spaces && docId)) {
			return;
		}
		setSaveState("saving");
		const elements = api.getSceneElements();
		const appState = api.getAppState();
		const files = api.getFiles();
		const source = serializeAsJSON(elements, appState, files, "local");
		savedVersionRef.current = hashElementsVersion(elements);
		try {
			await spaces.updateDoc({
				doc_id: docId,
				title: titleRef.current,
				source,
			});
			setSaveState("saved");
		} catch {
			setSaveState("error");
		}
	}, [docId]);

	const scheduleSave = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
		setSaveState("saving");
		timerRef.current = setTimeout(() => {
			flush().catch(() => {
				// `flush` reflects failures via saveState; nothing to add here.
			});
		}, SAVE_DEBOUNCE_MS);
	}, [flush]);

	// Excalidraw fires onChange for selection/scroll too; only schedule a save when
	// the actual scene version advances past the last saved one.
	const onChange = useCallback(
		(elements: readonly ExcalidrawElement[], _appState: AppState) => {
			if (hashElementsVersion(elements) !== savedVersionRef.current) {
				scheduleSave();
			}
		},
		[scheduleSave]
	);

	// Drop generated elements onto the board and scroll them into view.
	const addElements = useCallback((incoming: readonly ExcalidrawElement[]) => {
		const api = apiRef.current;
		if (!api || incoming.length === 0) {
			return;
		}
		const existing = api.getSceneElements();
		const next = [...existing, ...incoming];
		api.updateScene({ elements: next });
		api.scrollToContent(incoming as ExcalidrawElement[], {
			fitToContent: true,
			animate: true,
		});
	}, []);

	// Flush a pending save on unmount so in-flight edits are not lost.
	useEffect(
		() => () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				flush().catch(() => {
					// Surfaced via saveState above.
				});
			}
		},
		[flush]
	);

	const handleTitleChange = useCallback(
		(next: string) => {
			setTitle(next);
			titleRef.current = next;
			scheduleSave();
		},
		[scheduleSave]
	);

	const runGenerate = useCallback(async () => {
		const prompt = aiPrompt.trim();
		if (!prompt) {
			return;
		}
		setAiBusy(true);
		setAiError(null);
		try {
			const scene = apiRef.current?.getSceneElements() ?? [];
			const elements = await generateElements(prompt, scene.length);
			if (elements.length === 0) {
				setAiError("The model didn't return anything to draw. Try rephrasing.");
				return;
			}
			addElements(elements);
			setAiOpen(false);
			setAiPrompt("");
		} catch {
			setAiError("Generation failed. Please try again.");
		} finally {
			setAiBusy(false);
		}
	}, [aiPrompt, addElements]);

	const initialForCanvas = useMemo(
		() => initialData ?? { appState: { viewBackgroundColor: "#ffffff" } },
		[initialData]
	);

	if (error) {
		return (
			<div className="wb-center">
				<div className="wb-empty">
					<div className="wb-empty-title">Could not open whiteboard</div>
					<div className="wb-empty-desc">{error}</div>
					{docId ? (
						<button
							className="wb-btn"
							onClick={() => {
								setError(null);
								setReloadNonce((n) => n + 1);
							}}
							type="button"
						>
							Try again
						</button>
					) : null}
				</div>
			</div>
		);
	}

	if (!loaded) {
		return (
			<div className="wb-center">
				<div className="wb-spinner" />
			</div>
		);
	}

	return (
		<div className="wb-root">
			<div className="wb-toolbar">
				<input
					aria-label="Whiteboard title"
					className="wb-title"
					onChange={(e) => handleTitleChange(e.target.value)}
					placeholder="Untitled"
					value={title}
				/>
				<span className="wb-save">{SAVE_LABEL[saveState]}</span>
				<button
					className="wb-btn"
					onClick={() => {
						setAiError(null);
						setAiOpen(true);
					}}
					type="button"
				>
					Generate
				</button>
			</div>
			<div className="wb-canvas">
				<Excalidraw
					excalidrawAPI={(api) => {
						apiRef.current = api;
					}}
					initialData={initialForCanvas}
					onChange={onChange}
				/>
			</div>
			{aiOpen ? (
				<div className="wb-modal-scrim">
					<div className="wb-modal">
						<div className="wb-modal-title">Generate with AI</div>
						<form
							className="wb-modal-form"
							onSubmit={(e) => {
								e.preventDefault();
								runGenerate().catch(() => undefined);
							}}
						>
							<input
								autoFocus
								className="wb-input"
								onChange={(e) => setAiPrompt(e.target.value)}
								placeholder="e.g. a flowchart for user signup with email verification"
								value={aiPrompt}
							/>
							{aiError ? <div className="wb-modal-error">{aiError}</div> : null}
							<div className="wb-modal-actions">
								<button
									className="wb-btn wb-btn-ghost"
									onClick={() => setAiOpen(false)}
									type="button"
								>
									Cancel
								</button>
								<button
									className="wb-btn wb-btn-primary"
									disabled={aiBusy || !aiPrompt.trim()}
									type="submit"
								>
									{aiBusy ? "Generating…" : "Generate"}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</div>
	);
}
