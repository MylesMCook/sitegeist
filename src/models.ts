import { type Api, getModel, type KnownProvider, type Model } from "@sitegeist/pi-ai";

export const OPENAI_CHATGPT_MODEL = "gpt-5.4";

export const LEGACY_MODEL_ALIASES: Record<string, Record<string, string>> = {
	openai: {
		"gpt-5-codex": OPENAI_CHATGPT_MODEL,
	},
	"openai-codex": {
		"gpt-5-codex": OPENAI_CHATGPT_MODEL,
		"gpt-5.1-codex-mini": OPENAI_CHATGPT_MODEL,
	},
};

export function getCanonicalModelId(provider: string, modelId: string): string {
	return LEGACY_MODEL_ALIASES[provider]?.[modelId] || modelId;
}

export function resolveModel(provider: string, modelId: string): Model<Api> | undefined {
	const knownProvider = provider as KnownProvider;
	const canonicalModelId = getCanonicalModelId(provider, modelId);
	return (
		(getModel(knownProvider, canonicalModelId as never) as Model<Api> | undefined) ||
		(getModel(knownProvider, modelId as never) as Model<Api> | undefined)
	);
}

export function normalizeStoredModel(model: Model<Api>): Model<Api> {
	return resolveModel(model.provider, model.id) || model;
}
