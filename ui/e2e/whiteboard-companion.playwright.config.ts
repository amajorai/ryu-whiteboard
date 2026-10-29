import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eDirectory = import.meta.dirname;
const appRoot = path.resolve(e2eDirectory, "..");
const baseURL = "http://127.0.0.1:4531";

export default defineConfig({
	testDir: e2eDirectory,
	testMatch: "whiteboard-companion.spec.ts",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	outputDir: "test-results/whiteboard-companion",
	use: {
		...devices["Desktop Chrome"],
		baseURL,
		viewport: { width: 1440, height: 960 },
	},
	webServer: {
		command:
			"bun run build && bun run vite --config e2e/vite.config.ts --host 127.0.0.1 --port 4531 --strictPort",
		cwd: appRoot,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
