import { describe, expect, test } from "bun:test";
import { excalidrawLangCode } from "./excalidraw-locale.ts";

describe("excalidrawLangCode", () => {
	test.each([
		["en", "en"],
		["es", "es-ES"],
		["fr", "fr-FR"],
		["de", "de-DE"],
		["pt-BR", "pt-BR"],
		["ja", "ja-JP"],
		["zh-CN", "zh-CN"],
		["it", "it-IT"],
		["ko", "ko-KR"],
		["hi", "hi-IN"],
		["ru", "ru-RU"],
		["ar", "ar-SA"],
	])("maps the official %s pack to %s", (locale, langCode) => {
		expect(excalidrawLangCode(locale)).toBe(langCode);
	});

	test("keeps an exact regional variant Excalidraw ships", () => {
		expect(excalidrawLangCode("pt-PT")).toBe("pt-PT");
		expect(excalidrawLangCode("zh_tw")).toBe("zh-TW");
	});

	test("falls back to the base language, then English", () => {
		expect(excalidrawLangCode("de-AT")).toBe("de-DE");
		expect(excalidrawLangCode("en-GB")).toBe("en");
		expect(excalidrawLangCode("xx")).toBe("en");
		expect(excalidrawLangCode("")).toBe("en");
	});
});
