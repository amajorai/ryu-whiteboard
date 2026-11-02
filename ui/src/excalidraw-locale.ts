// Excalidraw ships its own UI translations keyed by regional codes (`de-DE`,
// `ja-JP`); it loads the chosen one lazily and falls back to English for any
// code it does not know. Map the Ryu UI locale onto the closest one.

/** Excalidraw locale codes that differ from their region-less Ryu locale. */
const EXCALIDRAW_LANG_BY_LANGUAGE: Readonly<Record<string, string>> = {
	ar: "ar-SA",
	de: "de-DE",
	es: "es-ES",
	fr: "fr-FR",
	hi: "hi-IN",
	it: "it-IT",
	ja: "ja-JP",
	ko: "ko-KR",
	pt: "pt-BR",
	ru: "ru-RU",
	zh: "zh-CN",
};

/** Regional Excalidraw locales a Ryu locale can name exactly. */
const EXCALIDRAW_REGIONAL = new Set([
	"pt-BR",
	"pt-PT",
	"zh-CN",
	"zh-HK",
	"zh-TW",
]);

/** The Excalidraw `langCode` for a Ryu UI locale; `en` when it has none. */
export function excalidrawLangCode(locale: string): string {
	const [rawLanguage = "", rawRegion = ""] = locale.trim().split(/[-_]/u);
	const language = rawLanguage.toLowerCase();
	const regional = `${language}-${rawRegion.toUpperCase()}`;
	if (EXCALIDRAW_REGIONAL.has(regional)) {
		return regional;
	}
	return EXCALIDRAW_LANG_BY_LANGUAGE[language] ?? "en";
}
