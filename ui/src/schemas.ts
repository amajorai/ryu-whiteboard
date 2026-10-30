import type { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { rpcJsonResponseSchema } from "@ryu/app-host/rpc";
import { z } from "zod";

export type WhiteboardElementSkeleton = NonNullable<
	Parameters<typeof convertToExcalidrawElements>[0]
>[number];

export const imageProviderSchema = z.enum(["openverse", "unsplash"]);
export type ImageProvider = z.output<typeof imageProviderSchema>;

const storedSceneProjection = z
	.object({
		elements: z.array(z.json()).nullish(),
		appState: z.record(z.string(), z.json()).nullish(),
		files: z.record(z.string(), z.json()).nullish(),
	})
	.catchall(z.json().optional());
/** The serialized scene envelope is validated here; Excalidraw's own blob loader
 * restores its versioned elements, app state and binary-file contracts. */
export const storedSceneSchema = z.custom<
	z.output<typeof storedSceneProjection>
>(
	(value) =>
		rpcJsonResponseSchema.safeParse(value).success &&
		storedSceneProjection.safeParse(value).success
);

// Excalidraw 0.18's complete constructor skeleton contract. The converter owns
// defaults for optional element fields; position and each kind's required data
// are checked before model-produced elements reach it.
const pointSchema = z.tuple([z.number(), z.number()]);
// Upstream FontFamilyValues is numeric, including legacy custom/fallback fonts.
const fontSchema = z.number();
const textAlignSchema = z.enum(["left", "center", "right"]);
const verticalAlignSchema = z.enum(["top", "middle", "bottom"]);
const elementFields = {
	id: z.string(),
	x: z.number(),
	y: z.number(),
	strokeColor: z.string(),
	backgroundColor: z.string(),
	fillStyle: z.enum(["hachure", "cross-hatch", "solid", "zigzag"]),
	strokeWidth: z.number(),
	strokeStyle: z.enum(["solid", "dashed", "dotted"]),
	roundness: z
		.object({
			type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
			value: z.number().optional(),
		})
		.nullable(),
	roughness: z.number(),
	opacity: z.number(),
	width: z.number(),
	height: z.number(),
	angle: z.number(),
	seed: z.number(),
	version: z.number(),
	versionNonce: z.number(),
	index: z.string().nullable(),
	isDeleted: z.boolean(),
	groupIds: z.array(z.string()),
	frameId: z.string().nullable(),
	boundElements: z
		.array(z.object({ id: z.string(), type: z.enum(["arrow", "text"]) }))
		.nullable(),
	updated: z.number(),
	link: z.string().nullable(),
	locked: z.boolean(),
	customData: z.record(z.string(), z.json()).optional(),
};
const baseSchema = z.object(elementFields).catchall(z.json().optional());
const constructorSchema = baseSchema
	.partial()
	.extend({ x: z.number(), y: z.number() });
const textFields = {
	text: z.string(),
	fontSize: z.number().optional(),
	fontFamily: fontSchema.optional(),
	textAlign: textAlignSchema.optional(),
	verticalAlign: verticalAlignSchema.optional(),
};
const labelSchema = constructorSchema.partial().extend(textFields);
const bindingSchema = z.object({
	elementId: z.string(),
	focus: z.number(),
	gap: z.number(),
	fixedPoint: pointSchema.optional(),
});
const arrowheadSchema = z.enum([
	"arrow",
	"bar",
	"dot",
	"circle",
	"circle_outline",
	"triangle",
	"triangle_outline",
	"diamond",
	"diamond_outline",
	"crowfoot_one",
	"crowfoot_many",
	"crowfoot_one_or_many",
]);
const textSchema = constructorSchema.extend({
	...textFields,
	type: z.literal("text"),
	containerId: z.string().nullable().optional(),
	originalText: z.string().optional(),
	autoResize: z.boolean().optional(),
	lineHeight: z.number().optional(),
});
const endpointSchema = z.union([
	constructorSchema.partial().extend({
		type: z.enum(["rectangle", "ellipse", "diamond"]),
		id: z.string().optional(),
	}),
	constructorSchema.partial().extend({
		id: z.string(),
		type: z.enum(["rectangle", "ellipse", "diamond"]).optional(),
	}),
	textSchema.partial().extend({ text: z.string(), type: z.literal("text") }),
	textSchema.partial().extend({
		text: z.string(),
		id: z.string(),
		type: z.literal("text").optional(),
	}),
]);
const linearSchema = constructorSchema.extend({
	type: z.enum(["arrow", "line"]),
	label: labelSchema.optional(),
	start: endpointSchema.optional(),
	end: endpointSchema.optional(),
	points: z.array(pointSchema).optional(),
	lastCommittedPoint: pointSchema.nullable().optional(),
	startBinding: bindingSchema.nullable().optional(),
	endBinding: bindingSchema.nullable().optional(),
	startArrowhead: arrowheadSchema.nullable().optional(),
	endArrowhead: arrowheadSchema.nullable().optional(),
	elbowed: z.boolean().optional(),
	fixedSegments: z
		.array(
			z.object({ start: pointSchema, end: pointSchema, index: z.number() })
		)
		.nullable()
		.optional(),
	startIsSpecial: z.boolean().nullable().optional(),
	endIsSpecial: z.boolean().nullable().optional(),
});
const skeletonProjection = z.union([
	constructorSchema.extend({
		type: z.enum(["rectangle", "ellipse", "diamond"]),
		label: labelSchema.optional(),
	}),
	linearSchema,
	textSchema,
	constructorSchema.extend({
		type: z.literal("image"),
		fileId: z.string(),
		status: z.enum(["pending", "saved", "error"]).optional(),
		scale: pointSchema.optional(),
		crop: z
			.object({
				x: z.number(),
				y: z.number(),
				width: z.number(),
				height: z.number(),
				naturalWidth: z.number(),
				naturalHeight: z.number(),
			})
			.nullable()
			.optional(),
	}),
	constructorSchema.partial().extend({
		type: z.enum(["frame", "magicframe"]),
		children: z.array(z.string()),
		name: z.string().nullable().optional(),
	}),
	baseSchema.extend({ type: z.literal("embeddable") }),
	baseSchema.extend({
		type: z.literal("iframe"),
		customData: z
			.object({
				generationData: z
					.union([
						z.object({ status: z.literal("pending") }),
						z.object({ status: z.literal("done"), html: z.string() }),
						z.object({
							status: z.literal("error"),
							code: z.string(),
							message: z.string().optional(),
						}),
					])
					.optional(),
			})
			.catchall(z.json().optional())
			.optional(),
	}),
	baseSchema.extend({
		type: z.literal("freedraw"),
		points: z.array(pointSchema),
		pressures: z.array(z.number()),
		simulatePressure: z.boolean(),
		lastCommittedPoint: pointSchema.nullable(),
	}),
]);
export const elementSkeletonSchema = z.custom<WhiteboardElementSkeleton>(
	(value) =>
		rpcJsonResponseSchema.safeParse(value).success &&
		skeletonProjection.safeParse(value).success
);
export const elementSkeletonsSchema = z.array(elementSkeletonSchema);
export const generationEnvelopeSchema = z.object({
	format: z.string().catch(""),
	mermaid: z.string().optional().catch(undefined),
	skeleton: elementSkeletonsSchema.optional().catch(undefined),
});

const fileIdentifierProjection = z.string();
export const fileIdentifierSchema = z.custom<
	import("@excalidraw/excalidraw/element/types").FileId
>((value) => fileIdentifierProjection.safeParse(value).success);
// File data stores the image catalog's media URL. Excalidraw supports remote
// images as well as embedded data URLs; the nominal upstream type names both DataURL.
const imageUrlProjection = z.string();
export const imageDataUrlSchema = z.custom<
	import("@excalidraw/excalidraw/types").DataURL
>((value) => imageUrlProjection.safeParse(value).success);
export const imageMimeTypeSchema = z.enum([
	"image/svg+xml",
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/bmp",
	"image/x-icon",
	"image/avif",
	"image/jfif",
	"application/octet-stream",
]);

const serializedElementProjection = z.union([
	baseSchema.extend({
		type: z.enum([
			"selection",
			"rectangle",
			"ellipse",
			"diamond",
			"embeddable",
		]),
	}),
	baseSchema.extend({
		type: z.literal("iframe"),
		customData: z
			.object({
				generationData: z
					.union([
						z.object({ status: z.literal("pending") }),
						z.object({ status: z.literal("done"), html: z.string() }),
						z.object({
							status: z.literal("error"),
							code: z.string(),
							message: z.string().optional(),
						}),
					])
					.optional(),
			})
			.catchall(z.json().optional())
			.optional(),
	}),
	baseSchema.extend({
		type: z.literal("text"),
		text: z.string(),
		fontSize: z.number(),
		fontFamily: fontSchema,
		textAlign: textAlignSchema,
		verticalAlign: verticalAlignSchema,
		containerId: z.string().nullable(),
		originalText: z.string(),
		autoResize: z.boolean(),
		lineHeight: z.number(),
	}),
	baseSchema.extend({
		type: z.literal("line"),
		points: z.array(pointSchema),
		lastCommittedPoint: pointSchema.nullable(),
		startBinding: bindingSchema.nullable(),
		endBinding: bindingSchema.nullable(),
		startArrowhead: arrowheadSchema.nullable(),
		endArrowhead: arrowheadSchema.nullable(),
	}),
	baseSchema.extend({
		type: z.literal("arrow"),
		points: z.array(pointSchema),
		lastCommittedPoint: pointSchema.nullable(),
		startBinding: bindingSchema.nullable(),
		endBinding: bindingSchema.nullable(),
		startArrowhead: arrowheadSchema.nullable(),
		endArrowhead: arrowheadSchema.nullable(),
		elbowed: z.boolean(),
		fixedSegments: z
			.array(
				z.object({ start: pointSchema, end: pointSchema, index: z.number() })
			)
			.nullable()
			.optional(),
		startIsSpecial: z.boolean().nullable().optional(),
		endIsSpecial: z.boolean().nullable().optional(),
	}),
	baseSchema.extend({
		type: z.literal("freedraw"),
		points: z.array(pointSchema),
		pressures: z.array(z.number()),
		simulatePressure: z.boolean(),
		lastCommittedPoint: pointSchema.nullable(),
	}),
	baseSchema.extend({
		type: z.enum(["frame", "magicframe"]),
		name: z.string().nullable(),
	}),
	baseSchema.extend({
		type: z.literal("image"),
		fileId: z.string().nullable(),
		status: z.enum(["pending", "saved", "error"]),
		scale: pointSchema,
		crop: z
			.object({
				x: z.number(),
				y: z.number(),
				width: z.number(),
				height: z.number(),
				naturalWidth: z.number(),
				naturalHeight: z.number(),
			})
			.nullable(),
	}),
]);
export const serializedElementSchema = z.custom<
	import("@excalidraw/excalidraw/element/types").ExcalidrawElement
>(
	(value) =>
		rpcJsonResponseSchema.safeParse(value).success &&
		serializedElementProjection.safeParse(value).success
);
export const binaryFileSchema = z
	.object({
		id: fileIdentifierSchema,
		dataURL: imageDataUrlSchema,
		mimeType: imageMimeTypeSchema,
		created: z.number(),
		lastRetrieved: z.number().optional(),
		version: z.number().optional(),
	})
	.catchall(z.json().optional()) satisfies z.ZodType<
	import("@excalidraw/excalidraw/types").BinaryFileData
>;
export const savedSceneSchema = z
	.object({
		elements: z.array(serializedElementSchema),
		files: z.record(z.string(), binaryFileSchema).default({}),
	})
	.catchall(z.json().optional());
export const documentWriteSchema = z.object({
	doc_id: z.string(),
	source: z.string(),
	title: z.string().optional(),
});
