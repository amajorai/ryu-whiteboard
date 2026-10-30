import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	namedAssertionIsPresent,
	reconcileLocalInteractionMap,
} from "../../../../apps-store/companion-suite.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "../../..");
const inventoryPath = path.join(
	repositoryRoot,
	"docs/proof/test-coverage-sweep-20260924/companion-interaction-inventory.tsv"
);
const mapPath = path.join(import.meta.dirname, "companion-interactions.json");
const specPath = path.join(import.meta.dirname, "whiteboard-companion.spec.ts");

function parseTsv(source) {
	const [headerLine, ...lines] = source.trimEnd().split(/\r?\n/u);
	const headers = headerLine?.split("\t") ?? [];
	return lines.map((line) => {
		const values = line.split("\t");
		return Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""])
		);
	});
}

function identity(row) {
	return JSON.stringify(
		["package", "source_file", "line", "component", "tag", "events"].map(
			(field) => row[field]
		)
	);
}

const censusRows = parseTsv(readFileSync(inventoryPath, "utf8"));
const whiteboardRows = censusRows.filter((row) => row.package === "whiteboard");
const map = JSON.parse(readFileSync(mapPath, "utf8"));
const specSource = readFileSync(specPath, "utf8");

describe("Whiteboard package-owned Companion interaction map", () => {
	test("joins all 16 interactions to named rendered assertions", () => {
		const reconciled = reconcileLocalInteractionMap(
			"whiteboard",
			censusRows,
			map
		);
		const missing = reconciled.filter(
			({ assertion }) =>
				!namedAssertionIsPresent(
					specSource,
					assertion.testTitle,
					assertion.assertionMarker
				)
		);

		expect(whiteboardRows).toHaveLength(16);
		expect(map.scope).toBe("complete");
		expect(map.expectedRows).toBe(16);
		expect(reconciled).toHaveLength(16);
		expect(new Set(reconciled.map(({ row }) => identity(row))).size).toBe(16);
		expect(missing).toEqual([]);
	});

	test("keeps the proof limited to the Whiteboard manifest's grants", () => {
		const manifest = JSON.parse(
			readFileSync(path.join(packageRoot, "../manifest.json"), "utf8")
		);
		expect(manifest.permission_grants).toEqual([
			"spaces:docs",
			"hook:side-model",
			"core:list_agents",
			"app:realtime",
			"ui:toast",
			"ui:declarative-http",
		]);
	});
});
