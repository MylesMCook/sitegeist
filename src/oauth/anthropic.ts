import { generatePKCE } from "./browser-oauth.js";
import type { OAuthProviderAdapter } from "./runtime.js";
import type { OAuthCredentials } from "./types.js";

const decode = (value: string) => atob(value);
const CLIENT_ID = decode("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const REDIRECT_URI = "http://localhost:53692/callback";
const REDIRECT_HOST = "localhost:53692";
const SCOPES =
	"org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

function getEndpoints(fakeAuthUrl?: string) {
	if (!fakeAuthUrl) {
		return {
			authorizeUrl: AUTHORIZE_URL,
			tokenUrl: TOKEN_URL,
		};
	}

	return {
		authorizeUrl: `${fakeAuthUrl}/anthropic/authorize`,
		tokenUrl: `${fakeAuthUrl}/anthropic/token`,
	};
}

function buildCredentials(tokenData: {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	now: () => number;
}): OAuthCredentials {
	const access = tokenData.access_token;
	const refresh = tokenData.refresh_token;
	const expiresIn = tokenData.expires_in;

	if (!access || !refresh || typeof expiresIn !== "number") {
		throw new Error("Token response missing required fields");
	}

	return {
		providerId: "anthropic",
		access,
		refresh,
		expires: tokenData.now() + expiresIn * 1000 - 5 * 60 * 1000,
	};
}

export const anthropicAdapter: OAuthProviderAdapter = {
	id: "anthropic",
	name: "Anthropic (Claude Pro/Max)",

	async login(context) {
		const { verifier, challenge } = await generatePKCE();
		const endpoints = getEndpoints(context.config.fakeAuthUrl);

		const authParams = new URLSearchParams({
			code: "true",
			client_id: CLIENT_ID,
			response_type: "code",
			redirect_uri: REDIRECT_URI,
			scope: SCOPES,
			code_challenge: challenge,
			code_challenge_method: "S256",
			state: verifier,
		});

		const redirectUrl = await context.browser.waitForRedirect(
			`${endpoints.authorizeUrl}?${authParams.toString()}`,
			REDIRECT_HOST,
		);

		const code = redirectUrl.searchParams.get("code");
		const state = redirectUrl.searchParams.get("state");

		if (!code) {
			throw new Error("Missing authorization code in redirect");
		}
		if (!state) {
			throw new Error("Missing state in redirect");
		}
		if (state !== verifier) {
			throw new Error("OAuth state mismatch");
		}

		const tokenData = await context.http.postJson<{
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
		}>(
			endpoints.tokenUrl,
			{
				grant_type: "authorization_code",
				client_id: CLIENT_ID,
				code,
				state,
				redirect_uri: REDIRECT_URI,
				code_verifier: verifier,
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
		}>(
			endpoints.tokenUrl,
			{
				grant_type: "refresh_token",
				client_id: CLIENT_ID,
				refresh_token: credentials.refresh,
			},
			{ proxyUrl: context.proxyUrl },
		);

		return buildCredentials({
			...tokenData,
			now: context.now,
		});
	},
};
