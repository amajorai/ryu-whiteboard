import type {
	RyuCatalogSnapshot,
	RyuRuntimeSelection,
} from "@ryu/app-host/app-bridge";
import {
	ModelAgentPicker,
	type RyuPickerSelection,
} from "@ryu/blocks/composer/runtime-picker";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ryu/ui/components/dialog.tsx";
import { Input } from "@ryu/ui/components/input.tsx";

export interface GenerateDialogProps {
	busy: boolean;
	catalog: RyuCatalogSnapshot | null;
	error: string | null;
	onGenerate: () => void;
	onOpenChange: (open: boolean) => void;
	onPromptChange: (prompt: string) => void;
	onSelectionChange: (selection: RyuRuntimeSelection) => void;
	open: boolean;
	prompt: string;
	selection: RyuRuntimeSelection | undefined;
}

/** The "Generate with AI" dialog: a model lane picker and a diagram prompt. */
export function GenerateDialog({
	busy,
	catalog,
	error,
	onGenerate,
	onOpenChange,
	onPromptChange,
	onSelectionChange,
	open,
	prompt,
	selection,
}: GenerateDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Generate with AI</DialogTitle>
					<DialogDescription>
						Describe the diagram to add to this whiteboard.
					</DialogDescription>
				</DialogHeader>
				<form
					className="wb-modal-form"
					onSubmit={(e) => {
						e.preventDefault();
						onGenerate();
					}}
				>
					<div className="wb-runtime-picker">
						<div className="wb-runtime-label">Ryu model lane</div>
						<ModelAgentPicker
							ariaLabel="Choose the Whiteboard model"
							catalog={catalog}
							mode="model"
							onDiscoverModels={(providerId) =>
								window.ryu?.catalog.models({ providerId }) ??
								Promise.reject(new Error("Ryu model discovery is unavailable."))
							}
							onSelectionChange={(next: RyuPickerSelection) => {
								if (next.kind === "model") {
									onSelectionChange(next);
								}
							}}
							placeholder="Choose a Ryu model"
							value={selection}
						/>
					</div>
					<Input
						aria-label="Diagram description"
						autoFocus
						onChange={(e) => onPromptChange(e.target.value)}
						placeholder="e.g. a flowchart for user signup with email verification"
						value={prompt}
					/>
					{error ? <div className="wb-modal-error">{error}</div> : null}
					<div className="wb-modal-actions">
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="ghost"
						>
							Cancel
						</Button>
						<Button
							disabled={busy || !prompt.trim()}
							type="submit"
							variant="default"
						>
							{busy ? "Generating…" : "Generate"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
