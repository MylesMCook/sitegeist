import { generatePKCE, generateState } from "./browser-oauth.js";
import type { OAuthProviderAdapter } from "./runtime.js";
import type { OAuthCredentials } from "./types.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const REDIRECT_HOST = "localhost:1455";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

function getEndpoints(fakeAuthUrl?: string) {
	if (!fakeAuthUrl) {
		return {
			authorizeUrl: AUTHORIZE_URL,
			tokenUrl: TOKEN_URL,
		};
	}

	return {
		authorizeUrl: `${fakeAuthUrl}/openai-codex/authorize`,
		tokenUrl: `${fakeAuthUrl}/openai-codex/token`,
	};
}

function decodeJwt(token: string): Record<string, unknown> | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}
		return JSON.parse(atob(parts[1]));
	} catch {
		return null;
	}
}

function getAccountId(accessToken: string): string | null {
	const payload = decodeJwt(accessToken);
	const auth = payload?.[JWT_CLAIM_PATH] as Record<string, unknown> | undefined;
	const accountId = auth?.chatgpt_account_id;
	return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}

function buildCredentials(tokenData: {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	account_id?: string;
	now: () => number;
}): OAuthCredentials {
	const access = tokenData.access_token;
	const refresh = tokenData.refresh_token;
	const expiresIn = tokenData.expires_in;
	const accountId = getAccountId(access || "") || tokenData.account_id;

	if (!access || !refresh || typeof expiresIn !== "number") {
		throw new Error("Token response missing required fields");
	}

	if (!accountId) {
		throw new Error("Failed to extract accountId from token");
	}

	return {
		providerId: "openai-codex",
		access,
		refresh,
		expires: tokenData.now() + expiresIn * 1000,
		accountId,
	};
}

export const openAICodexAdapter: OAuthProviderAdapter = {
	id: "openai-codex",
	name: "ChatGPT Plus/Pro",

	async login(context) {
		const { verifier, challenge } = await generatePKCE();
		const state = generateState();
		const endpoints = getEndpoints(context.config.fakeAuthUrl);

		const url = new URL(endpoints.authorizeUrl);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("client_id", CLIENT_ID);
		url.searchParams.set("redirect_uri", REDIRECT_URI);
		url.searchParams.set("scope", SCOPE);
		url.searchParams.set("code_challenge", challenge);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("state", state);
		url.searchParams.set("id_token_add_organizations", "true");
		url.searchParams.set("codex_cli_simplified_flow", "true");
		url.searchParams.set("originator", "sitegeist");

		const redirectUrl = await context.browser.waitForRedirect(url.toString(), REDIRECT_HOST);
		const code = redirectUrl.searchParams.get("code");
		const returnedState = redirectUrl.searchParams.get("state");

		if (!code) {
			throw new Error("Missing authorization code in redirect");
		}

		if (returnedState !== state) {
			throw new Error("OAuth state mismatch");
		}

		const tokenData = await context.http.postJson<{
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
			account_id?: string;
		}>(
			endpoints.tokenUrl,
			{
				grant_type: "authorization_code",
				client_id: CLIENT_ID,
				code,
				code_verifier: verifier,
				redirect_uri: REDIRECT_URI,
			},
			{ proxyUrl: context.proxyUrl },
		);

		return buildCredentials({
			...tokenData,
			now: context.now,
		});
	},

	async refresh(context, credentials) {
		const endpoints = getEndpoints(context.config.fakeAuthUrl);
		const tokenData = await context.http.postJson<{
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
			account_id?: string;
		}>(
			endpoints.tokenUrl,
			{
				grant_type: "refresh_token",
				refresh_token: credentials.refresh,
				client_id: CLIENT_ID,
			},
			{ proxyUrl: context.proxyUrl },
		);

		return buildCredentials({
			...tokenData,
			now: context.now,
		});
	},
};
