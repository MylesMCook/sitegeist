import { afterEach, describe, expect, test, vi } from "vitest";
import { createOAuthRuntime, resolveApiKey, serializeOAuthCredentials, type OAuthCredentials, type OAuthRuntime } from "../../src/oauth/index.js";
import { FakeBrowserDriver, FakeHttpTransport } from "./fakes.js";

const FAKE_AUTH_URL = "http://127.0.0.1:48652";
const FIXED_NOW = 1_700_000_000_000;

function createTestConfig() {
	return {
		repoUrl: "https://github.com/MylesMCook/sitegeist",
		releasesUrl: "https://github.com/MylesMCook/sitegeist/releases",
		updatePageUrl: "https://github.com/MylesMCook/sitegeist/releases",
		versionUrl: undefined,
		defaultProxyUrl: undefined,
		fakeAuthUrl: FAKE_AUTH_URL,
	};
}

function encodeBase64Url(value: string): string {
	return Buffer.from(value, "utf8").toString("base64url");
}

function createOpenAiAccessToken(accountId: string): string {
	const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
	const payload = encodeBase64Url(
		JSON.stringify({
			"https://api.openai.com/auth": {
				chatgpt_account_id: accountId,
			},
		}),
	);
	return `${header}.${payload}.signature`;
}

describe("oauth runtime", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("logs in to ChatGPT through the redirect flow and exchanges the code", async () => {
		const browser = new FakeBrowserDriver((authUrl) => {
			const url = new URL(authUrl);
			expect(url.origin + url.pathname).toBe(`${FAKE_AUTH_URL}/openai-codex/authorize`);
			expect(url.searchParams.get("response_type")).toBe("code");
			expect(url.searchParams.get("client_id")).toBeTruthy();
			expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
			expect(url.searchParams.get("scope")).toContain("offline_access");

			const state = url.searchParams.get("state");
			return new URL(`http://localhost:1455/auth/callback?code=openai-code&state=${state}`);
		});
		const http = new FakeHttpTransport().respond("POST_JSON", `${FAKE_AUTH_URL}/openai-codex/token`, {
			access_token: createOpenAiAccessToken("acct_test"),
			refresh_token: "refresh-openai",
			expires_in: 3600,
		});
		const runtime = createOAuthRuntime({
			browser,
			http,
			now: () => FIXED_NOW,
			config: createTestConfig(),
		});

		const credentials = await runtime.login("openai-codex");

		expect(credentials).toEqual({
			providerId: "openai-codex",
			access: createOpenAiAccessToken("acct_test"),
			refresh: "refresh-openai",
			expires: FIXED_NOW + 3_600_000,
			accountId: "acct_test",
		});

		expect(http.requests).toHaveLength(1);
		expect(http.requests[0]).toMatchObject({
			method: "POST_JSON",
			url: `${FAKE_AUTH_URL}/openai-codex/token`,
			body: {
				grant_type: "authorization_code",
				client_id: expect.any(String),
				code: "openai-code",
				redirect_uri: "http://localhost:1455/auth/callback",
			},
		});
	});

	test("rejects anthropic login when the returned state does not match", async () => {
		const browser = new FakeBrowserDriver(() => new URL("http://localhost:53692/callback?code=anthropic-code&state=wrong"));
		const runtime = createOAuthRuntime({
			browser,
			http: new FakeHttpTransport(),
			now: () => FIXED_NOW,
			config: createTestConfig(),
		});

		await expect(runtime.login("anthropic")).rejects.toThrow("OAuth state mismatch");
	});

	test("completes the GitHub Copilot device flow with a local verification page", async () => {
		const http = new FakeHttpTransport()
			.respond("POST_FORM", `${FAKE_AUTH_URL}/github-copilot/login/device/code`, {
				device_code: "device-code-1",
				user_code: "ABCD-EFGH",
				verification_uri: `${FAKE_AUTH_URL}/github-copilot/verify?device_code=device-code-1`,
				interval: 1,
				expires_in: 900,
			})
			.respond("POST_FORM", `${FAKE_AUTH_URL}/github-copilot/login/oauth/access_token`, {
				error: "authorization_pending",
			})
			.respond("POST_FORM", `${FAKE_AUTH_URL}/github-copilot/login/oauth/access_token`, {
				access_token: "github-access-token",
			})
			.respond("GET_JSON", `${FAKE_AUTH_URL}/github-copilot/copilot_internal/v2/token`, {
				token: "copilot-session-token",
				expires_at: Math.floor((FIXED_NOW + 7_200_000) / 1000),
			});
		const browser = new FakeBrowserDriver(() => {
			throw new Error("redirect flow not expected");
		});
		const onDeviceCode = vi.fn();
		const runtime = createOAuthRuntime({
			browser,
			http,
			now: () => FIXED_NOW,
			config: createTestConfig(),
		});

		const credentials = await runtime.login("github-copilot", { onDeviceCode });

		expect(onDeviceCode).toHaveBeenCalledWith({
			userCode: "ABCD-EFGH",
			verificationUri: `${FAKE_AUTH_URL}/github-copilot/verify?device_code=device-code-1`,
		});
		expect(browser.externalUrls).toEqual([`${FAKE_AUTH_URL}/github-copilot/verify?device_code=device-code-1`]);
		expect(http.sleeps).toEqual([1000, 1000]);
		expect(credentials).toEqual({
			providerId: "github-copilot",
			access: "copilot-session-token",
			refresh: "github-access-token",
			expires: Math.floor((FIXED_NOW + 7_200_000) / 1000) * 1000 - 5 * 60 * 1000,
		});
	});

	test("surfaces a closed auth tab without touching network state", async () => {
		const runtime = createOAuthRuntime({
			browser: new FakeBrowserDriver(() => {
				throw new Error("Auth tab was closed before completing login");
			}),
			http: new FakeHttpTransport(),
			now: () => FIXED_NOW,
			config: createTestConfig(),
		});

		await expect(runtime.login("openai-codex")).rejects.toThrow("Auth tab was closed before completing login");
	});

	test("refreshes expired Gemini credentials before resolving the stored key", async () => {
		const storage = {
			set: vi.fn(async () => {}),
		};
		const runtime: OAuthRuntime = {
			login: vi.fn(),
			refresh: vi.fn(async () => ({
				providerId: "google-gemini-cli",
				access: "fresh-access-token",
				refresh: "fresh-refresh-token",
				expires: FIXED_NOW + 3_600_000,
				projectId: "project-123",
			} satisfies OAuthCredentials)),
		};
		const expiredCredentials = serializeOAuthCredentials({
			providerId: "google-gemini-cli",
			access: "stale-access-token",
			refresh: "stale-refresh-token",
			expires: FIXED_NOW - 1,
			projectId: "project-123",
		});
		vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);

		const resolvedKey = await resolveApiKey(expiredCredentials, "google-gemini-cli", storage, undefined, runtime);

		expect(runtime.refresh).toHaveBeenCalledOnce();
		expect(storage.set).toHaveBeenCalledOnce();
		expect(resolvedKey).toBe(JSON.stringify({ token: "fresh-access-token", projectId: "project-123" }));
	});

	test("fails Gemini login when onboarding returns a malformed pending response", async () => {
		const browser = new FakeBrowserDriver((authUrl) => {
			const url = new URL(authUrl);
			const state = url.searchParams.get("state");
			return new URL(`http://localhost:8085/oauth2callback?code=gemini-code&state=${state}`);
		});
		const http = new FakeHttpTransport()
			.respond("POST_FORM", `${FAKE_AUTH_URL}/google-gemini-cli/token`, {
				access_token: "gemini-access",
				refresh_token: "gemini-refresh",
				expires_in: 3600,
			})
			.respond("POST_JSON", `${FAKE_AUTH_URL}/google-gemini-cli/load-code-assist`, {})
			.respond("POST_JSON", `${FAKE_AUTH_URL}/google-gemini-cli/onboard-user`, {
				done: false,
			});
		const runtime = createOAuthRuntime({
			browser,
			http,
			now: () => FIXED_NOW,
			config: createTestConfig(),
		});

		await expect(runtime.login("google-gemini-cli")).rejects.toThrow("Malformed Google Gemini onboarding response.");
		expect(http.sleeps).toEqual([]);
	});
});
