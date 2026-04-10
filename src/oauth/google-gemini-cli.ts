import { generatePKCE } from "./browser-oauth.js";
import type { OAuthProviderAdapter } from "./runtime.js";
import type { OAuthCredentials } from "./types.js";

const decode = (value: string) => atob(value);
const CLIENT_ID = decode(
	"NjgxMjU1ODA5Mzk1LW9vOGZ0Mm9wcmRybnA5ZTNhcWY2YXYzaG1kaWIxMzVqLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29t",
);
const CLIENT_SECRET = decode("R09DU1BYLTR1SGdNUG0tMW83U2stZ2VWNkN1NWNsWEZzeGw=");
const REDIRECT_URI = "http://localhost:8085/oauth2callback";
const REDIRECT_HOST = "localhost:8085";
const SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";

interface LoadCodeAssistResponse {
	cloudaicompanionProject?: string;
	allowedTiers?: Array<{ id: string; isDefault?: boolean }>;
}

interface OnboardResponse {
	done?: boolean;
	name?: string;
	response?: {
		cloudaicompanionProject?: {
			id?: string;
		};
	};
}

function getProjectId(onboardData: OnboardResponse): string | undefined {
	const projectId = onboardData.response?.cloudaicompanionProject?.id;
	if (typeof projectId === "string" && projectId.length > 0) {
		return projectId;
	}
	return undefined;
}

function isPendingOnboardingResponse(
	onboardData: OnboardResponse,
): onboardData is OnboardResponse & { done: false; name: string } {
	return onboardData.done === false && typeof onboardData.name === "string" && onboardData.name.length > 0;
}

function getEndpoints(fakeAuthUrl?: string) {
	if (!fakeAuthUrl) {
		return {
			authorizeUrl: AUTH_URL,
			tokenUrl: TOKEN_URL,
			loadCodeAssistUrl: `${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`,
			onboardUrl: `${CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`,
			pollBaseUrl: `${CODE_ASSIST_ENDPOINT}/v1internal/`,
		};
	}

	return {
		authorizeUrl: `${fakeAuthUrl}/google-gemini-cli/authorize`,
		tokenUrl: `${fakeAuthUrl}/google-gemini-cli/token`,
		loadCodeAssistUrl: `${fakeAuthUrl}/google-gemini-cli/load-code-assist`,
		onboardUrl: `${fakeAuthUrl}/google-gemini-cli/onboard-user`,
		pollBaseUrl: `${fakeAuthUrl}/google-gemini-cli/operations/`,
	};
}

async function discoverProject(
	accessToken: string,
	context: Parameters<OAuthProviderAdapter["login"]>[0],
): Promise<string> {
	const endpoints = getEndpoints(context.config.fakeAuthUrl);
	const headers = {
		Authorization: `Bearer ${accessToken}`,
		"User-Agent": "google-api-nodejs-client/9.15.1",
		"X-Goog-Api-Client": "gl-node/22.17.0",
	};

	const loadData = await context.http.postJson<LoadCodeAssistResponse>(
		endpoints.loadCodeAssistUrl,
		{
			metadata: JSON.stringify({
				ideType: "IDE_UNSPECIFIED",
				platform: "PLATFORM_UNSPECIFIED",
				pluginType: "GEMINI",
			}),
		},
		{ headers },
	);

	if (typeof loadData.cloudaicompanionProject === "string" && loadData.cloudaicompanionProject.length > 0) {
		return loadData.cloudaicompanionProject;
	}

	const defaultTier = loadData.allowedTiers?.find((tier) => tier.isDefault)?.id || "free-tier";
	let onboardData = await context.http.postJson<OnboardResponse>(
		endpoints.onboardUrl,
		{
			tierId: defaultTier,
			metadata: JSON.stringify({
				ideType: "IDE_UNSPECIFIED",
				platform: "PLATFORM_UNSPECIFIED",
				pluginType: "GEMINI",
			}),
		},
		{ headers },
	);

	while (isPendingOnboardingResponse(onboardData)) {
		await context.http.sleep(1000);
		onboardData = await context.http.getJson<OnboardResponse>(`${endpoints.pollBaseUrl}${onboardData.name}`, {
			headers,
		});
	}

	const projectId = getProjectId(onboardData);
	if (projectId) {
		return projectId;
	}

	if (onboardData.done === true) {
		throw new Error("Google Gemini onboarding completed without a project id.");
	}

	throw new Error("Malformed Google Gemini onboarding response.");
}

function buildCredentials(tokenData: {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	projectId: string;
	now: () => number;
}): OAuthCredentials {
	const access = tokenData.access_token;
	const refresh = tokenData.refresh_token;
	const expiresIn = tokenData.expires_in;

	if (!access || !refresh || typeof expiresIn !== "number") {
		throw new Error("Token response missing required fields");
	}

	return {
		providerId: "google-gemini-cli",
		access,
		refresh,
		expires: tokenData.now() + expiresIn * 1000 - 5 * 60 * 1000,
		projectId: tokenData.projectId,
	};
}

export const googleGeminiCliAdapter: OAuthProviderAdapter = {
	id: "google-gemini-cli",
	name: "Google Gemini",
	serializeApiKey(credentials) {
		const projectId = credentials.projectId;
		if (!projectId) {
			throw new Error("Gemini CLI credentials missing projectId");
		}

		return JSON.stringify({ token: credentials.access, projectId });
	},

	async login(context) {
		const { verifier, challenge } = await generatePKCE();
		const endpoints = getEndpoints(context.config.fakeAuthUrl);

		const authParams = new URLSearchParams({
			client_id: CLIENT_ID,
			response_type: "code",
			redirect_uri: REDIRECT_URI,
			scope: SCOPES.join(" "),
			code_challenge: challenge,
			code_challenge_method: "S256",
			state: verifier,
			access_type: "offline",
			prompt: "consent",
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
		if (state !== verifier) {
			throw new Error("OAuth state mismatch");
		}

		const tokenData = await context.http.postForm<{
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
		}>(endpoints.tokenUrl, {
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			code,
			grant_type: "authorization_code",
			redirect_uri: REDIRECT_URI,
			code_verifier: verifier,
		});

		if (!tokenData.refresh_token) {
			throw new Error("No refresh token received. Please try again.");
		}

		const projectId = await discoverProject(tokenData.access_token || "", context);

		return buildCredentials({
			...tokenData,
			projectId,
			now: context.now,
		});
	},

	async refresh(context, credentials) {
		const projectId = credentials.projectId;
		if (!projectId) {
			throw new Error("Gemini CLI credentials missing projectId");
		}

		const endpoints = getEndpoints(context.config.fakeAuthUrl);
		const tokenData = await context.http.postForm<{
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
		}>(endpoints.tokenUrl, {
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			refresh_token: credentials.refresh,
			grant_type: "refresh_token",
		});

		if (!tokenData.access_token || typeof tokenData.expires_in !== "number") {
			throw new Error("Token refresh response missing required fields");
		}

		return {
			providerId: "google-gemini-cli",
			access: tokenData.access_token,
			refresh: tokenData.refresh_token || credentials.refresh,
			expires: context.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000,
			projectId,
		};
	},
};
