import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import { ExtensionHost } from "@ryu/app-host/ExtensionHost";
import {
	capabilitiesFromGrants,
	type HostServices,
	type RpcJsonResponse,
} from "@ryu/app-host/rpc";
import { htmlCompanionSrcdoc } from "@ryu/app-host/third-party-plugin";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import manifest from "../../manifest.json" with { type: "json" };
import appHtml from "../dist/index.html?raw";
import { runStoredSceneRestoreProbe } from "./scene-restore-probe.ts";
import "./whiteboard-host.css";

import type { WhiteboardFixture } from "./fixture-types.ts";
import styles from "./whiteboard-host.module.css";

const DOC_ID = "whiteboard-local-fixture-doc";
const SPACE_ID = "whiteboard-local-fixture-space";
const imageCanvas = document.createElement("canvas");
imageCanvas.width = 80;
imageCanvas.height = 48;
const imageContext = imageCanvas.getContext("2d");
if (!imageContext) {
	throw new Error("Whiteboard fixture could not create its PNG.");
}
imageContext.fillStyle = "#327d71";
imageContext.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
const selectedImageDataUrl = imageCanvas.toDataURL("image/png");

const catalog: RyuCatalogSnapshot = {
	agents: [],
	apiTypes: [],
	current: { provider: "gateway", providerRouting: {}, routing: "gateway" },
	hookEvents: [],
	hooks: [],
	plugins: [],
	providers: [
		{
			api: "openai",
			authKind: "api-key",
			configured: true,
			id: "whiteboard-fixture-provider",
			label: "Whiteboard fixture provider",
			managed: false,
			suggestedModels: ["whiteboard-fixture-model"],
		},
	],
	thinkingLevels: [],
	version: 1,
};

const fixture: WhiteboardFixture = {
	calls: [],
	doc: {
		id: DOC_ID,
		kind: "whiteboard",
		source: "",
		title: "Fixture whiteboard",
	},
	getDocFailures: Number(
		new URLSearchParams(window.location.search).get("failDoc") ?? 0
	),
	modelReply: JSON.stringify({
		format: "skeleton",
		skeleton: [
			{
				id: "fixture-approval-path",
				label: { text: "Approval path" },
				type: "rectangle",
				width: 220,
				x: 80,
				y: 90,
			},
		],
	}),
};

function recordCall(method: string, input: RpcJsonResponse): void {
	fixture.calls.push({ input: structuredClone(input), method });
}

const services: HostServices = {
	listAgents: async () => [],
	registerRoute: async (claim) => ({ path: claim.path }),
	catalogModels: async (input) => {
		recordCall("catalog.models", input);
		return {
			models: [{ id: "whiteboard-discovered-model", name: "Discovered model" }],
			providerId: input.providerId,
			source: "fixture",
		};
	},
	catalogSnapshot: async () => {
		recordCall("catalog.snapshot", {});
		return structuredClone(catalog);
	},
	modelComplete: async (input) => {
		recordCall("model.complete", input);
		return fixture.modelReply;
	},
	searchImages: async (input) => {
		recordCall("assets.searchImages", input);
		return {
			configured: input.provider === "openverse",
			provider: input.provider,
			results:
				input.provider === "openverse"
					? [
							{
								attribution: "Ryu fixture artist",
								height: imageCanvas.height,
								id: "fixture-image-harbor",
								licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
								preview: selectedImageDataUrl,
								rights: "CC BY 4.0",
								sourceUrl: "https://example.invalid/harbor",
								title: "Harbor diagram reference",
								url: selectedImageDataUrl,
								width: imageCanvas.width,
							},
						]
					: [],
		};
	},
	spacesGetDoc: async (input) => {
		recordCall("spaces.getDoc", input);
		if (fixture.getDocFailures > 0) {
			fixture.getDocFailures -= 1;
			throw new Error("Fixture Space read failed once.");
		}
		return structuredClone(fixture.doc);
	},
	spacesUpdateDoc: async (input) => {
		recordCall("spaces.updateDoc", input);
		fixture.doc = {
			...fixture.doc,
			source: input.source,
			title: input.title ?? fixture.doc.title,
		};
	},
};

Object.assign(window, {
	__whiteboardFixture: fixture,
	__whiteboardRestoreSceneProbe: runStoredSceneRestoreProbe,
});

function ProductHost() {
	const nonce = useMemo(() => crypto.randomUUID(), []);
	const srcdoc = useMemo(
		() =>
			htmlCompanionSrcdoc(nonce, appHtml, manifest.id, {
				docId: DOC_ID,
				spaceId: SPACE_ID,
			}),
		[nonce]
	);
	const grants = manifest.permission_grants;
	const granted = useMemo(() => capabilitiesFromGrants(grants), [grants]);

	return (
		<main className={styles.frame}>
			<p className={styles.banner}>
				Built Whiteboard bundle · sandboxed ExtensionHost · local Space, model,
				and image-search fixtures
			</p>
			<ExtensionHost
				allowForms
				granted={granted}
				nonce={nonce}
				services={services}
				srcdoc={srcdoc}
				title="Whiteboard"
			/>
		</main>
	);
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(<ProductHost />);
}
