import { describe, expect, test } from "vitest";
import { getCanonicalModelId, OPENAI_CHATGPT_MODEL } from "../src/models.js";

describe("model normalization", () => {
	test("upgrades legacy Codex ids to the canonical ChatGPT model", () => {
		expect(getCanonicalModelId("openai-codex", "gpt-5-codex")).toBe(OPENAI_CHATGPT_MODEL);
		expect(getCanonicalModelId("openai-codex", "gpt-5.1-codex-mini")).toBe(OPENAI_CHATGPT_MODEL);
		expect(getCanonicalModelId("openai", "gpt-5-codex")).toBe(OPENAI_CHATGPT_MODEL);
	});

	test("leaves current ids untouched", () => {
		expect(getCanonicalModelId("openai-codex", OPENAI_CHATGPT_MODEL)).toBe(OPENAI_CHATGPT_MODEL);
		expect(getCanonicalModelId("anthropic", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
	});
});
