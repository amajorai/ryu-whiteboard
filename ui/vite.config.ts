import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Build the whiteboard Companion to ONE self-contained HTML (Path B). A single
// input + `inlineDynamicImports` is the locked recipe for `vite-plugin-singlefile`:
// it inlines ALL JS + CSS + fonts into the HTML so the emitted document has ZERO
// external fetches — required under the companion CSP `connect-src 'none'` (a
// multi-chunk build would leave a shared react/excalidraw chunk external, which
// cannot load in the null-origin srcdoc iframe). The output is
// `dist/whiteboard.html`, shipped verbatim as the plugin's `ui_code`.

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: here,
	// The document is a null-origin srcdoc; every asset must resolve inline.
	base: "./",
	plugins: [react(), viteSingleFile()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "esnext",
		cssCodeSplit: false,
		assetsInlineLimit: Number.POSITIVE_INFINITY,
		modulePreload: { polyfill: false },
		rollupOptions: {
			input: { whiteboard: resolve(here, "index.html") },
			output: { inlineDynamicImports: true },
		},
	},
});
