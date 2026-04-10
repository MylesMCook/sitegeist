import type { OAuthBrowserDriver, OAuthHttpTransport, OAuthRequestOptions } from "../../src/oauth/browser-oauth.js";

type FakeRequestMethod = "GET_JSON" | "POST_FORM" | "POST_JSON";

interface FakeRequestRecord {
	method: FakeRequestMethod;
	url: string;
	body?: Record<string, string>;
	options?: OAuthRequestOptions;
}

interface FakeResponseEntry {
	method: FakeRequestMethod;
	url: string;
	result?: unknown;
	error?: Error;
}

export class FakeBrowserDriver implements OAuthBrowserDriver {
	readonly authUrls: string[] = [];
	readonly redirectHosts: string[] = [];
	readonly externalUrls: string[] = [];

	constructor(
		private readonly onRedirect: (authUrl: string, redirectHost: string) => Promise<URL> | URL,
	) {}

	async waitForRedirect(authUrl: string, redirectHost: string): Promise<URL> {
		this.authUrls.push(authUrl);
		this.redirectHosts.push(redirectHost);
		return this.onRedirect(authUrl, redirectHost);
	}

	async openExternal(url: string): Promise<void> {
		this.externalUrls.push(url);
	}
}

export class FakeHttpTransport implements OAuthHttpTransport {
	readonly requests: FakeRequestRecord[] = [];
	readonly sleeps: number[] = [];
	private readonly responses: FakeResponseEntry[] = [];

	respond(method: FakeRequestMethod, url: string, result: unknown): this {
		this.responses.push({ method, url, result });
		return this;
	}

	fail(method: FakeRequestMethod, url: string, error: Error): this {
		this.responses.push({ method, url, error });
		return this;
	}

	async postJson<T>(url: string, body: Record<string, string>, options?: OAuthRequestOptions): Promise<T> {
		return this.handle<T>("POST_JSON", url, body, options);
	}

	async postForm<T>(url: string, body: Record<string, string>, options?: OAuthRequestOptions): Promise<T> {
		return this.handle<T>("POST_FORM", url, body, options);
	}

	async getJson<T>(url: string, options?: OAuthRequestOptions): Promise<T> {
		return this.handle<T>("GET_JSON", url, undefined, options);
	}

	async sleep(ms: number): Promise<void> {
		this.sleeps.push(ms);
	}

	private async handle<T>(
		method: FakeRequestMethod,
		url: string,
		body?: Record<string, string>,
		options?: OAuthRequestOptions,
	): Promise<T> {
		this.requests.push({ method, url, body, options });
		const index = this.responses.findIndex((entry) => entry.method === method && entry.url === url);
		if (index === -1) {
			throw new Error(`No fake response configured for ${method} ${url}`);
		}

		const [entry] = this.responses.splice(index, 1);
		if (entry.error) {
			throw entry.error;
		}

		return entry.result as T;
	}
}
