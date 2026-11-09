import { describe, expect, test } from "bun:test";
import type { WhiteboardElementSkeleton } from "./schemas.ts";
import {
	elementSkeletonSchema,
	elementSkeletonsSchema,
	generationEnvelopeSchema,
	imageMimeTypeSchema,
	savedSceneSchema,
	storedSceneSchema,
} from "./schemas.ts";

describe("Whiteboard model and scene boundaries", () => {
	test("retains complete constructor records and additive JSON metadata", () => {
		const rectangle: WhiteboardElementSkeleton = {
			type: "rectangle",
			x: 80,
			y: 90,
			id: "a",
			label: { text: "Approval" },
			customData: JSON.parse('{"__proto__":{"checked":true}}'),
		};
		expect(elementSkeletonSchema.parse(rectangle)).toBe(rectangle);
		expect(elementSkeletonsSchema.parse([rectangle])[0]).toBe(rectangle);
		const malformedMetadata = {};
		Object.defineProperty(malformedMetadata, "__proto__", {
			enumerable: true,
			value: () => null,
		});
		expect(
			elementSkeletonSchema.safeParse({
				...rectangle,
				customData: malformedMetadata,
			}).success
		).toBe(false);
		expect(
			elementSkeletonSchema.safeParse({ ...rectangle, label: { text: 42 } })
				.success
		).toBe(false);
	});
	test("checks the required data for text, image and arrow constructors", () => {
		expect(
			elementSkeletonSchema.safeParse({
				type: "text",
				x: 0,
				y: 0,
				text: "Legacy font",
				fontFamily: 4,
			}).success
		).toBe(true);
		expect(
			elementSkeletonSchema.safeParse({
				type: "text",
				x: 0,
				y: 0,
				text: "Fallback font",
				fontFamily: 100,
			}).success
		).toBe(true);
		expect(
			elementSkeletonSchema.safeParse({ type: "text", x: 0, y: 0 }).success
		).toBe(false);
		expect(
			elementSkeletonSchema.safeParse({ type: "image", x: 0, y: 0, fileId: 42 })
				.success
		).toBe(false);
		expect(
			elementSkeletonSchema.safeParse({
				type: "arrow",
				x: 0,
				y: 0,
				points: [[0, "bad"]],
			}).success
		).toBe(false);
		expect(
			elementSkeletonSchema.safeParse({
				type: "arrow",
				x: 0,
				y: 0,
				start: { id: "a" },
				end: { id: "b" },
				points: [
					[0, 0],
					[80, 30],
				],
			}).success
		).toBe(true);
		expect(
			generationEnvelopeSchema.parse({ format: 42, mermaid: "graph TD;A-->B" })
				.format
		).toBe("");
	});
	test("retains versioned serialized envelopes for Excalidraw's loader", () => {
		const scene = {
			elements: [{ type: "rectangle", id: "legacy" }],
			appState: { viewBackgroundColor: "#fff" },
			files: {},
			source: "legacy",
			metadata: JSON.parse('{"__proto__":{"note":"retained"}}'),
		};
		expect(storedSceneSchema.parse(scene)).toBe(scene);
		expect(
			storedSceneSchema.safeParse({ ...scene, elements: "not an array" })
				.success
		).toBe(false);
		expect(savedSceneSchema.safeParse(scene).success).toBe(false);
	});
	test("requires complete saved elements and supported image MIME types", () => {
		expect(
			savedSceneSchema.safeParse({
				elements: [{ type: "image", fileId: "image-1" }],
				files: {},
			}).success
		).toBe(false);
		expect(imageMimeTypeSchema.parse("image/png")).toBe("image/png");
		expect(imageMimeTypeSchema.safeParse("text/html").success).toBe(false);
	});
});
