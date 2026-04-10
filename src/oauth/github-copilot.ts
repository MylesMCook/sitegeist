import type { OAuthProviderAdapter } from "./runtime.js";
import type { OAuthCredentials } from "./types.js";

const decode = (value: string) => atob(value);
const CLIENT_ID = decode("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");

const COPILOT_HEADERS = {
	"User-Agent": "GitHubCopilotChat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": "vscode-chat",
} as const;

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval: number;
	expires_in: number;
}

interface DeviceTokenResponse {
	access_token?: string;
	error?: string;
	error_description?: string;
	interval?: number;
}

interface CopilotTokenResponse {
	token?: string;
	expires_at?: number;
}

function getUrls(fakeAuthUrl?: string, domain: string = "github.com") {
	if (fakeAuthUrl) {
		return {
			deviceCodeUrl: `${fakeAuthUrl}/github-copilot/login/device/code`,
			accessTokenUrl: `${fakeAuthUrl}/github-copilot/login/oauth/access_token`,
			copilotTokenUrl: `${fakeAuthUrl}/github-copilot/copilot_internal/v2/token`,
		};
	}

	return {
		deviceCodeUrl: `https://${domain}/login/device/code`,
		accessTokenUrl: `https://${domain}/login/oauth/access_token`,
		copilotTokenUrl: `https://api.${domain}/copilot_internal/v2/token`,
	};
}

function getBaseUrlFromToken(token: string): string | null {
	const match = token.match(/proxy-ep=([^;]+)/);
	if (!match) {
		return null;
	}
	const apiHost = match[1].replace(/^proxy\./, "api.");
	return `https://${apiHost}`;
}

export function getGitHubCopilotBaseUrl(token?: string, enterpriseDomain?: string): string {
	if (token) {
		const urlFromToken = getBaseUrlFromToken(token);
		if (urlFromToken) {
			return urlFromToken;
		}
	}

	if (enterpriseDomain) {
		return `https://copilot-api.${enterpriseDomain}`;
	}

	return "https://api.individual.githubcopilot.com";
}

async function startDeviceFlow(context: Parameters<OAuthProviderAdapter["login"]>[0]): Promise<DeviceCodeResponse> {
	const urls = getUrls(context.config.fakeAuthUrl);
	const data = await context.http.postForm<DeviceCodeResponse>(
		urls.deviceCodeUrl,
		{
			client_id: CLIENT_ID,
			scope: "read:user",
		},
		{
			headers: {
				Accept: "application/json",
				"User-Agent": "GitHubCopilotChat/0.35.0",
			},
			proxyUrl: context.proxyUrl,
		},
	);

	if (
		typeof data.device_code !== "string" ||
		typeof data.user_code !== "string" ||
		typeof data.verification_uri !== "string" ||
		typeof data.interval !== "number" ||
		typeof data.expires_in !== "number"
	) {
		throw new Error("Invalid device code response");
	}

	return data;
}

async function pollForGitHubAccessToken(
	context: Parameters<OAuthProviderAdapter["login"]>[0],
	deviceCode: string,
	intervalSeconds: number,
	expiresIn: number,
): Promise<string> {
	const urls = getUrls(context.config.fakeAuthUrl);
	const deadline = context.now() + expiresIn * 1000;
	let intervalMs = Math.max(1000, intervalSeconds * 1000);

	while (context.now() < deadline) {
		await context.http.sleep(intervalMs);

		const data = await context.http.postForm<DeviceTokenResponse>(
			urls.accessTokenUrl,
			{
				client_id: CLIENT_ID,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			},
			{
				headers: {
					Accept: "application/json",
					"User-Agent": "GitHubCopilotChat/0.35.0",
				},
				proxyUrl: context.proxyUrl,
			},
		);

		if (typeof data.access_token === "string") {
			return data.access_token;
		}

		if (data.error === "authorization_pending") {
			continue;
		}

		if (data.error === "slow_down") {
			intervalMs = typeof data.interval === "number" && data.interval > 0 ? data.interval * 1000 : intervalMs + 5000;
			continue;
		}

		if (data.error) {
			throw new Error(
				`Device flow failed: ${data.error}${data.error_description ? `: ${data.error_description}` : ""}`,
			);
		}
	}

	throw new Error("Device flow timed out");
}

async function fetchCopilotToken(
	context: Parameters<OAuthProviderAdapter["refresh"]>[0],
	githubAccessToken: string,
): Promise<OAuthCredentials> {
	const urls = getUrls(context.config.fakeAuthUrl);
	const data = await context.http.getJson<CopilotTokenResponse>(urls.copilotTokenUrl, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${githubAccessToken}`,
			...COPILOT_HEADERS,
		},
		proxyUrl: context.proxyUrl,
	});

	if (typeof data.token !== "string" || typeof data.expires_at !== "number") {
		throw new Error("Invalid Copilot token response");
	}

	return {
		providerId: "github-copilot",
		refresh: githubAccessToken,
		access: data.token,
		expires: data.expires_at * 1000 - 5 * 60 * 1000,
	};
}

export const githubCopilotAdapter: OAuthProviderAdapter = {
	id: "github-copilot",
	name: "GitHub Copilot",

	async login(context) {
		const device = await startDeviceFlow(context);

		context.onDeviceCode({
			userCode: device.user_code,
			verificationUri: device.verification_uri,
		});

		await context.browser.openExternal(device.verification_uri);
		const githubAccessToken = await pollForGitHubAccessToken(
			context,
			device.device_code,
			device.interval,
			device.expires_in,
		);

		return fetchCopilotToken(context, githubAccessToken);
	},

	async refresh(context, credentials) {
		return fetchCopilotToken(context, credentials.refresh);
	},
};
