import { Button } from "@ryu/ui/components/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ryu/ui/components/dialog.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { safeMediaUrl } from "@ryu/ui/lib/safe-media-url.ts";
import { useEffect, useState } from "react";

import { type ImageProvider, imageProviderSchema } from "./schemas.ts";

interface ImageHit {
	attribution: string;
	height: number;
	id: string;
	licenseUrl?: string | null;
	preview: string;
	rights: string;
	sourceUrl: string;
	title: string;
	url: string;
	width: number;
}

export type WhiteboardImageSelection = ImageHit;

export function ImagePicker({
	open,
	onOpenChange,
	onSelect,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (hit: ImageHit) => void;
}) {
	const [provider, setProvider] = useState<ImageProvider>("openverse");
	const [query, setQuery] = useState("mountains");
	const [debounced, setDebounced] = useState("mountains");
	const [results, setResults] = useState<ImageHit[]>([]);
	const [configured, setConfigured] = useState(true);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query), 300);
		return () => clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		if (!open) {
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		window.ryu?.assets
			?.searchImages({ provider, query: debounced })
			.then((response) => {
				if (cancelled) {
					return;
				}
				setConfigured(response.configured);
				setResults(response.results);
			})
			.catch(() => {
				if (!cancelled) {
					setError(
						"Image search is unavailable. Check the node connection and try again."
					);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [open, provider, debounced]);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Insert image</DialogTitle>
					<DialogDescription>
						Search Openverse or the node-configured Unsplash catalog. Selected
						media is stored in this board as an editable image.
					</DialogDescription>
				</DialogHeader>
				<div className="wb-image-controls">
					<NativeSelect
						aria-label="Image source"
						onChange={(event) =>
							setProvider(imageProviderSchema.parse(event.target.value))
						}
						value={provider}
					>
						<NativeSelectOption value="openverse">
							Openverse (keyless)
						</NativeSelectOption>
						<NativeSelectOption value="unsplash">
							Unsplash (node key)
						</NativeSelectOption>
					</NativeSelect>
					<Input
						aria-label="Search images"
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search images…"
						value={query}
					/>
				</div>
				{provider === "unsplash" && !configured ? (
					<p className="wb-image-note" role="status">
						Unsplash is unavailable until the node has RYU_UNSPLASH_ACCESS_KEY
						(or UNSPLASH_ACCESS_KEY) configured. Openverse is ready without a
						key.
					</p>
				) : null}
				{error ? <p className="wb-image-error">{error}</p> : null}
				<div aria-live="polite" className="wb-image-results">
					{loading ? (
						<div className="wb-image-empty">Searching…</div>
					) : results.length === 0 ? (
						<div className="wb-image-empty">No images found.</div>
					) : (
						<div className="wb-image-grid">
							{results.map((hit) => (
								<Button
									aria-label={`${hit.title} — ${hit.attribution}`}
									className="h-auto w-full"
									key={hit.id}
									onClick={() => {
										onSelect(hit);
										onOpenChange(false);
									}}
									size="sm"
									type="button"
									variant="outline"
								>
									<div className="wb-image-tile flex w-full flex-col gap-1 py-1">
										<img
											alt={hit.title}
											loading="lazy"
											src={safeMediaUrl(hit.preview) ?? undefined}
										/>
										<span>{hit.title}</span>
										<small>{hit.attribution}</small>
									</div>
								</Button>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
