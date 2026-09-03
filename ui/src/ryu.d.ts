// The `window.ryu` companion host-bridge surface, injected inline by the Path B
// host (`htmlCompanionSrcdoc` in `@ryu/app-host/third-party-plugin`) BEFORE this
// app's module scripts run. Every method is an RPC over a capability-gated
// MessagePort the desktop host grant-gates against this app's Gateway-approved
// grants; nothing here holds a token or reaches the network directly. Calls made
// before the port arrives are queued in an outbox and flush on connect, so a
// `spaces.getDoc` in the first effect never races the handshake.

import type {
	RyuCatalogModels,
	RyuCatalogSnapshot,
} from "@ryu/app-host/app-bridge";
import type { RyuCompanionWindowApi } from "@ryu/app-host/realtime";

export interface RyuAppDoc {
	id: string;
	kind: string;
	source: string;
	title: string;
}

export interface RyuAppDocSummary {
	id: string;
	title: string;
	updated_at: number;
}

export interface RyuSpaces {
	createDoc(input: { space_id: string; title: string }): Promise<string>;
	deleteDoc(input: { doc_id: string }): Promise<void>;
	getDoc(input: { doc_id: string }): Promise<RyuAppDoc | null>;
	listDocs(input: { space_id: string }): Promise<RyuAppDocSummary[]>;
	updateDoc(input: {
		doc_id: string;
		title?: string;
		source: string;
	}): Promise<void>;
}

export interface RyuModel {
	complete(input: {
		prompt: string;
		system?: string;
		model?: string;
		provider?: string;
		effort?: string;
	}): Promise<string>;
}

/** Baked in by the host when the app is opened as a Space document. */
export interface RyuMountContext {
	docId: string;
	spaceId: string;
}

export interface RyuBridge extends RyuCompanionWindowApi {
	catalog: {
		models(input: { providerId: string }): Promise<RyuCatalogModels>;
		snapshot(): Promise<RyuCatalogSnapshot>;
	};
	context: RyuMountContext | null;
	model: RyuModel;
	spaces: RyuSpaces;
}

declare module "@ryu/app-host/realtime" {
	interface RyuCompanionWindowApi {
		catalog: RyuBridge["catalog"];
		context: RyuBridge["context"];
		model: RyuBridge["model"];
		spaces: RyuBridge["spaces"];
	}
}
