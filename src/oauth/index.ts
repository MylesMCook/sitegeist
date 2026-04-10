import { anthropicAdapter } from "./anthropic.js";
import { githubCopilotAdapter } from "./github-copilot.js";
import { googleGeminiCliAdapter } from "./google-gemini-cli.js";
import { openAICodexAdapter } from "./openai-codex.js";
import { createOAuthRuntime as createRuntime, type OAuthProviderAdapter, type OAuthRuntime } from "./runtime.js";
import {
	type DeviceCodeCallback,
	isOAuthCredentials,
	type OAuthCredentials,
	type OAuthProviderId,
	parseOAuthCredentials,
	serializeOAuthCredentials,
} from "./types.js";

export { isOAuthCredentials, parseOAuthCredentials, serializeOAuthCredentials };
export type { DeviceCodeCallback, OAuthCredentials, OAuthProviderId, OAuthProviderAdapter, OAuthRuntime };

const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderAdapter> = {
	anthropic: anthropicAdapter,
	"openai-codex": openAICodexAdapter,
	"github-copilot": githubCopilotAdapter,
	"google-gemini-cli": googleGeminiCliAdapter,
};

const oauthRuntime = createRuntime(OAUTH_PROVIDERS);

export function createOAuthRuntime(dependencies?: Parameters<typeof createRuntime>[1]): OAuthRuntime {
	return createRuntime(OAUTH_PROVIDERS, dependencies);
}

export function isOAuthProvider(provider: string): provider is OAuthProviderId {
	return provider in OAUTH_PROVIDERS;
}

export function getOAuthProviderName(provider: OAuthProviderId): string {
	return OAUTH_PROVIDERS[provider].name;
}

export async function oauthLogin(
	provider: OAuthProviderId,
	proxyUrl?: string,
	onDeviceCode?: DeviceCodeCallback,
): Promise<OAuthCredentials> {
	return oauthRuntime.login(provider, { proxyUrl, onDeviceCode });
}

export async function oauthRefresh(credentials: OAuthCredentials, proxyUrl?: string): Promise<OAuthCredentials> {
	return oauthRuntime.refresh(credentials, { proxyUrl });
}

export async function resolveApiKey(
	storedValue: string,
	provider: string,
	storage: { set: (provider: string, value: string) => Promise<void> },
	proxyUrl?: string,
	runtime: OAuthRuntime = oauthRuntime,
): Promise<string> {
	if (!isOAuthCredentials(storedValue)) {
		return storedValue;
	}

	let credentials = parseOAuthCredentials(storedValue);

	if (Date.now() >= credentials.expires - 60_000) {
		try {
			credentials = await runtime.refresh(credentials, { proxyUrl });
			await storage.set(provider, serializeOAuthCredentials(credentials));
		} catch (error) {
			console.error(`Failed to refresh OAuth token for ${provider}:`, error);
			throw new Error(`OAuth token expired and refresh failed for ${provider}`);
		}
	}

	const adapter = OAUTH_PROVIDERS[credentials.providerId];
	const serializedApiKey = adapter?.serializeApiKey?.(credentials);
	if (serializedApiKey) {
		return serializedApiKey;
	}

	return credentials.access;
}
