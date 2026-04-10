import { type AppConfig, appConfig } from "../config/app-config.js";
import {
	FetchOAuthHttpTransport,
	type OAuthBrowserDriver,
	type OAuthHttpTransport,
	TabRedirectBrowserDriver,
} from "./browser-oauth.js";
import type { DeviceCodeCallback, OAuthCredentials, OAuthProviderId } from "./types.js";

export interface OAuthRuntimeContext {
	browser: OAuthBrowserDriver;
	http: OAuthHttpTransport;
	proxyUrl?: string;
	onDeviceCode: DeviceCodeCallback;
	now: () => number;
	config: AppConfig;
}

export interface OAuthProviderAdapter {
	id: OAuthProviderId;
	name: string;
	login(context: OAuthRuntimeContext): Promise<OAuthCredentials>;
	refresh(context: OAuthRuntimeContext, credentials: OAuthCredentials): Promise<OAuthCredentials>;
	serializeApiKey?(credentials: OAuthCredentials): string;
}

export interface OAuthRuntime {
	login(
		provider: OAuthProviderId,
		options?: { proxyUrl?: string; onDeviceCode?: DeviceCodeCallback },
	): Promise<OAuthCredentials>;
	refresh(credentials: OAuthCredentials, options?: { proxyUrl?: string }): Promise<OAuthCredentials>;
}

export function createOAuthRuntime(
	adapters: Record<OAuthProviderId, OAuthProviderAdapter>,
	dependencies?: {
		browser?: OAuthBrowserDriver;
		http?: OAuthHttpTransport;
		now?: () => number;
		config?: AppConfig;
	},
): OAuthRuntime {
	const browser = dependencies?.browser || new TabRedirectBrowserDriver();
	const http = dependencies?.http || new FetchOAuthHttpTransport();
	const now = dependencies?.now || (() => Date.now());
	const config = dependencies?.config || appConfig;

	const createContext = (options?: { proxyUrl?: string; onDeviceCode?: DeviceCodeCallback }): OAuthRuntimeContext => ({
		browser,
		http,
		proxyUrl: options?.proxyUrl,
		onDeviceCode: options?.onDeviceCode || (() => {}),
		now,
		config,
	});

	return {
		async login(provider, options) {
			const adapter = adapters[provider];
			if (!adapter) {
				throw new Error(`Unknown OAuth provider: ${provider}`);
			}
			return adapter.login(createContext(options));
		},

		async refresh(credentials, options) {
			const adapter = adapters[credentials.providerId];
			if (!adapter) {
				throw new Error(`Unknown OAuth provider: ${credentials.providerId}`);
			}
			return adapter.refresh(createContext(options), credentials);
		},
	};
}
