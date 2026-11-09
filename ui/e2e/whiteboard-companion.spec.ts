import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { FrameLocator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
	documentWriteSchema,
	fileIdentifierSchema,
	savedSceneSchema,
} from "../src/schemas.ts";
import type { WhiteboardHostState } from "./fixture-types.ts";

const EVIDENCE_DIRECTORY = path.resolve(import.meta.dirname, "evidence");

function appFrame(page: Page): FrameLocator {
	return page.frameLocator('iframe[title="Whiteboard"]');
}

async function fixtureState(page: Page): Promise<WhiteboardHostState> {
	return page.evaluate(() => {
		const fixture = window.__whiteboardFixture;
		if (!fixture) {
			throw new Error("The local Whiteboard ExtensionHost fixture is missing.");
		}
		return {
			calls: structuredClone(fixture.calls),
			doc: structuredClone(fixture.doc),
		};
	});
}

async function saveScreenshot(page: Page, name: string): Promise<void> {
	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.locator('iframe[title="Whiteboard"]').screenshot({
		animations: "disabled",
		path: path.join(EVIDENCE_DIRECTORY, name),
	});
}

async function waitForSaved(app: FrameLocator): Promise<void> {
	await expect(app.getByText("Saved", { exact: true })).toBeVisible();
}

function sceneFrom(
	state: WhiteboardHostState
): ReturnType<typeof savedSceneSchema.parse> {
	return savedSceneSchema.parse(JSON.parse(state.doc.source));
}

test("retries the Space read after a transient failure", async ({ page }) => {
	await page.goto("/?failDoc=1");
	const app = appFrame(page);
	await expect(
		app.getByText("Could not open whiteboard", { exact: true })
	).toBeVisible();
	await expect(
		app.getByText(/check your connection and try again/i)
	).toBeVisible();
	await app.getByRole("button", { name: "Try again" }).click();
	await expect(app.getByLabel("Whiteboard title")).toHaveValue(
		"Fixture whiteboard"
	);

	const state = await fixtureState(page);
	const reads = state.calls.filter((call) => call.method === "spaces.getDoc");
	expect(reads).toEqual([
		{
			input: { doc_id: "whiteboard-local-fixture-doc" },
			method: "spaces.getDoc",
		},
		{
			input: { doc_id: "whiteboard-local-fixture-doc" },
			method: "spaces.getDoc",
		},
	]);
	await saveScreenshot(page, "whiteboard-retry-opened-board.png");
});

test("draws a rectangle and persists the edited title and scene through Spaces", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	const title = app.getByRole("textbox", { name: "Whiteboard title" });
	await expect(title).toHaveValue("Fixture whiteboard");
	await title.fill("Release system map");

	const canvas = app.locator(".wb-canvas");
	await expect(canvas).toBeVisible();
	const bounds = await canvas.boundingBox();
	if (!bounds) {
		throw new Error("Excalidraw's interactive drawing canvas has no bounds.");
	}
	await canvas.click({
		position: { x: bounds.width * 0.3, y: bounds.height * 0.3 },
	});
	await page.keyboard.press("r");
	const rectangleTool = app.getByRole("radio", { name: "Rectangle" });
	await expect(rectangleTool).toBeChecked();
	const start = {
		x: bounds.x + bounds.width * 0.35,
		y: bounds.y + bounds.height * 0.35,
	};
	const end = { x: start.x + 130, y: start.y + 78 };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 5 });
	await page.mouse.up();
	await expect
		.poll(async () => {
			const state = await fixtureState(page);
			return (
				state.doc.title === "Release system map" &&
				sceneFrom(state).elements.some(
					(element) => element.type === "rectangle"
				)
			);
		})
		.toBe(true);
	await waitForSaved(app);

	const state = await fixtureState(page);
	const scene = sceneFrom(state);
	expect(state.doc.title).toBe("Release system map");
	expect(scene.elements.some((element) => element.type === "rectangle")).toBe(
		true
	);
	expect(
		state.calls.some(
			(call) =>
				call.method === "spaces.updateDoc" &&
				documentWriteSchema.safeParse(call.input).data?.title ===
					"Release system map"
		)
	).toBe(true);
	await saveScreenshot(page, "whiteboard-drawn-and-saved-rectangle.png");
});

test("opens and cancels AI generation without calling a model", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	await app.getByRole("button", { name: "Generate", exact: true }).click();
	const dialog = app.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Generate with AI" })
	).toBeVisible();
	await expect(
		dialog.getByRole("button", { name: "Generate", exact: true })
	).toBeDisabled();
	await dialog.getByLabel("Diagram description").fill("unused request");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeHidden();

	const state = await fixtureState(page);
	expect(state.calls.some((call) => call.method === "model.complete")).toBe(
		false
	);
	await saveScreenshot(page, "whiteboard-ai-generation-cancelled.png");
});

test("generates with the selected Ryu model and saves the returned diagram", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	await app.getByRole("button", { name: "Generate", exact: true }).click();
	const dialog = app.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Generate with AI" })
	).toBeVisible();
	const modelPicker = dialog.getByRole("combobox", {
		name: "Choose the Whiteboard model",
	});
	await modelPicker.click();
	await app.getByRole("option", { name: /whiteboard-fixture-model/i }).click();
	await expect(modelPicker).toContainText("whiteboard-fixture-model");

	const prompt = dialog.getByLabel("Diagram description");
	await prompt.fill("show a review approval path");
	const submit = dialog.getByRole("button", {
		name: "Generate",
		exact: true,
	});
	await expect(submit).toBeEnabled();
	await submit.click();
	await expect
		.poll(async () => {
			const state = await fixtureState(page);
			return state.calls.filter((call) => call.method === "model.complete")
				.length;
		})
		.toBe(1);
	await expect(dialog.locator(".wb-modal-error")).toBeHidden();
	await expect(dialog).toBeHidden();
	await waitForSaved(app);

	const state = await fixtureState(page);
	const modelCall = state.calls.find(
		(call) => call.method === "model.complete"
	);
	expect(modelCall?.input).toMatchObject({
		model: "whiteboard-fixture-model",
		provider: "whiteboard-fixture-provider",
		prompt: expect.stringContaining("Request: show a review approval path"),
	});
	expect(modelCall?.input).toMatchObject({
		prompt: expect.stringContaining("board currently has 0 element(s)"),
		system: expect.stringContaining("You turn a user's request into a diagram"),
	});
	const scene = sceneFrom(state);
	expect(scene.elements.length).toBeGreaterThan(0);
	expect(JSON.stringify(scene.elements)).toContain("Approval path");
	await saveScreenshot(page, "whiteboard-generated-diagram-saved.png");
});

test("searches attributed images by provider and persists the selected image file", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	await app.getByRole("button", { name: "Insert image", exact: true }).click();
	const dialog = app.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Insert image" })
	).toBeVisible();
	const source = dialog.getByLabel("Image source");
	const query = dialog.getByLabel("Search images");
	await query.fill("board sketch");
	await source.selectOption("unsplash");
	await expect(
		dialog.getByText(/Unsplash is unavailable until the node has/i)
	).toBeVisible();
	await expect
		.poll(async () => {
			const state = await fixtureState(page);
			return state.calls.some(
				(call) =>
					call.method === "assets.searchImages" &&
					JSON.stringify(call.input) ===
						JSON.stringify({ provider: "unsplash", query: "board sketch" })
			);
		})
		.toBe(true);

	await source.selectOption("openverse");
	const result = dialog.getByRole("button", {
		name: "Harbor diagram reference — Ryu fixture artist",
	});
	await expect(result).toBeVisible();
	await result.click();
	await expect(dialog).toBeHidden();
	await waitForSaved(app);

	const state = await fixtureState(page);
	const scene = sceneFrom(state);
	const imageElement = scene.elements.find(
		(element) => element.type === "image"
	);
	expect(imageElement).toBeDefined();
	expect(fileIdentifierSchema.safeParse(imageElement?.fileId).success).toBe(
		true
	);
	const fileId = fileIdentifierSchema.parse(imageElement?.fileId);
	expect(scene.files[fileId]?.dataURL).toMatch(/^data:image\/png;base64,/u);
	expect(state.doc.title).toBe("Fixture whiteboard");
	const imageSearchCalls = state.calls.filter(
		(call) => call.method === "assets.searchImages"
	);
	expect(
		imageSearchCalls.some(
			(call) =>
				JSON.stringify(call.input) ===
				JSON.stringify({ provider: "openverse", query: "board sketch" })
		)
	).toBe(true);
	await saveScreenshot(page, "whiteboard-attributed-image-saved.png");
});

test("stored scene restoration preserves local viewport and transient editing state", async ({
	page,
}) => {
	await page.goto("/");
	await expect(appFrame(page).getByLabel("Whiteboard title")).toHaveValue(
		"Fixture whiteboard"
	);
	const result = await page.evaluate(async () => {
		const probe = window.__whiteboardRestoreSceneProbe;
		if (!probe) {
			throw new Error(
				"The native stored-scene regression probe is unavailable."
			);
		}
		return await probe();
	});
	expect(result).toEqual({
		background: "#abc123",
		editingFrame: "local-frame",
		elements: 0,
		gridSize: 17,
		gridStep: 11,
		legacyScrollX: 999,
		legacyZoom: 2,
		latestScrollX: 812,
		previousTool: "ellipse",
		sameActiveTool: true,
		scrollX: 431,
		scrollY: 112,
		tool: "rectangle",
		zoom: 1.5,
	});
});
