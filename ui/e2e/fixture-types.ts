import type { RpcJsonResponse } from "@ryu/app-host/rpc";
import type { SceneRestoreProbeResult } from "./scene-restore-probe.ts";
export interface WhiteboardCall {
	input: RpcJsonResponse;
	method: string;
}
export interface WhiteboardHostState {
	calls: WhiteboardCall[];
	doc: { id: string; kind: string; source: string; title: string };
}
export interface WhiteboardFixture extends WhiteboardHostState {
	getDocFailures: number;
	modelReply: string;
}
declare global {
	interface Window {
		__whiteboardFixture: WhiteboardFixture;
		__whiteboardRestoreSceneProbe?: () => Promise<SceneRestoreProbeResult>;
	}
}
