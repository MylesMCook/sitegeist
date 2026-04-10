export interface OAuthBrowserDriver {
	waitForRedirect(authUrl: string, redirectHost: string): Promise<URL>;
	openExternal(url: string): Promise<void>;
}

export interface OAuthRequestOptions {
	headers?: Record<string, string>;
	proxyUrl?: string;
}

export interface OAuthHttpTransport {
	postJson<T>(url: string, body: Record<string, string>, options?: OAuthRequestOptions): Promise<T>;
	postForm<T>(url: string, body: Record<string, string>, options?: OAuthRequestOptions): Promise<T>;
	getJson<T>(url: string, options?: OAuthRequestOptions): Promise<T>;
	sleep(ms: number): Promise<void>;
}

export class TabRedirectBrowserDriver implements OAuthBrowserDriver {
	async waitForRedirect(authUrl: string, redirectHost: string): Promise<URL> {
		const tab = await chrome.tabs.create({ url: authUrl, active: true });
		const tabId = tab.id;
		if (!tabId) {
			throw new Error("Failed to create auth tab");
		}

		return new Promise<URL>((resolve, reject) => {
			const cleanup = () => {
				chrome.tabs.onUpdated.removeListener(onUpdated);
				chrome.tabs.onRemoved.removeListener(onRemoved);
			};

			const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
				if (updatedTabId !== tabId || !changeInfo.url) {
					return;
				}

				let url: URL;
				try {
					url = new URL(changeInfo.url);
				} catch {
					return;
				}

				if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
					return;
				}

				if (url.host !== redirectHost && url.hostname !== new URL(`http://${redirectHost}`).hostname) {
					return;
				}

				cleanup();
				void chrome.tabs.remove(tabId).catch(() => {});
				resolve(url);
			};

			const onRemoved = (removedTabId: number) => {
				if (removedTabId !== tabId) {
					return;
				}

				cleanup();
				reject(new Error("Auth tab was closed before completing login"));
			};

			chrome.tabs.onUpdated.addListener(onUpdated);
			chrome.tabs.onRemoved.addListener(onRemoved);
		});
	}

	async openExternal(url: string): Promise<void> {
		await chrome.tabs.create({ url, active: true });
	}
}

export class FetchOAuthHttpTransport implements OAuthHttpTransport {
	async postJson<T>(url: string, body: Record<string, string>, options?: OAuthRequestOptions): Promise<T> {
		return this.request<T>(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(options?.headers || {}),
			},
			body: JSON.stringify(body),
			proxyUrl: options?.proxyUrl,
		});
	}

	async postForm<T>(url: string, body: Record<string, string>, options?: OAuthRequestOptions): Promise<T> {
		return this.request<T>(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				...(options?.headers || {}),
			},
			body: new URLSearchParams(body).toString(),
			proxyUrl: options?.proxyUrl,
		});
	}

	async getJson<T>(url: string, options?: OAuthRequestOptions): Promise<T> {
		return this.request<T>(url, {
			method: "GET",
			headers: options?.headers,
			proxyUrl: options?.proxyUrl,
		});
	}

	async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async request<T>(
		url: string,
		options: {
			method: "GET" | "POST";
			headers?: Record<string, string>;
			body?: string;
			proxyUrl?: string;
		},
	): Promise<T> {
		const targetUrl = options.proxyUrl ? `${options.proxyUrl}/?url=${encodeURIComponent(url)}` : url;
		const response = await fetch(targetUrl, {
			method: options.method,
			headers: options.headers,
			body: options.body,
		});

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(`${options.method} ${url} failed: ${response.status} ${text}`.trim());
		}

		return (await response.json()) as T;
	}
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
	const verifierBytes = new Uint8Array(32);
	crypto.getRandomValues(verifierBytes);
	const verifier = base64urlEncode(verifierBytes);

	const data = new TextEncoder().encode(verifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const challenge = base64urlEncode(new Uint8Array(hashBuffer));

	return { verifier, challenge };
}

export function generateState(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return base64urlEncode(bytes);
}

function base64urlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
