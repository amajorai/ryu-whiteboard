# ryu-whiteboard

Whiteboard for Ryu — an Excalidraw whiteboard shipped as a Ryu app; draw freely, each board persists as a Space document, with Mermaid-to-Excalidraw diagram import.

> **Read-only mirror.** Developed in https://github.com/amajorai/ryu —
> please open issues and pull requests there, not on this repository.

## Source & build

This is the **source of record** for the app UI. It imports Ryu's private
`@ryu/ui` design system, so it does **not** build standalone outside the
monorepo — it **builds inside the amajorai/ryu monorepo workspace**.
The **shipped bundle below is the built artifact**: a prebuilt single-file
companion bundle is included at [`dist/whiteboard.ui.html`](./dist/whiteboard.ui.html) —
the runnable UI Ryu loads for this app.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

# com.ryu.whiteboard — Whiteboard

An Excalidraw whiteboard shipped as a Ryu app. Draw freely; each board persists as
a Space document. Mermaid-to-Excalidraw is bundled for diagram import.

## Parts

- **`ui/` — companion (`@ryu/whiteboard-app`).** A sandboxed full-page Companion
  (Path B, `ui_format: "html"`), wrapping `@excalidraw/excalidraw` (+
  `@excalidraw/mermaid-to-excalidraw`), built to one self-contained
  `dist/index.html` via `vite-plugin-singlefile`. No backend crate of its own — it
  persists via `spaces:docs` over the `window.ryu` bridge.

## Manifest (`ui/plugin.json`)

- **id** `com.ryu.whiteboard` · one `companion` runnable (`Whiteboard`, icon
  `shapes`).
- **Requires:** app `com.ryu.spaces` + grant `spaces:docs` (a hard dependency —
  boards are stored as Space documents).
- **Grants:** `spaces:docs` (persistence), `hook:side-model` (side-model assist).
- No sidecar: persistence rides Core's Spaces module.

## Surface

Registers as the **Whiteboard** companion in the desktop app store / launcher.

## Swap seam

The board binds to `spaces:docs` for persistence, not to a specific store — any
Spaces backend behind that grant backs it unchanged.
