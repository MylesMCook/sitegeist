export interface AppConfig {
	repoUrl: string;
	releasesUrl: string;
	updatePageUrl: string;
	versionUrl?: string;
	defaultProxyUrl?: string;
	fakeAuthUrl?: string;
}

const DEFAULT_REPO_URL = "https://github.com/MylesMCook/sitegeist";

const DEFAULT_APP_CONFIG: AppConfig = {
	repoUrl: DEFAULT_REPO_URL,
	releasesUrl: `${DEFAULT_REPO_URL}/releases`,
	updatePageUrl: `${DEFAULT_REPO_URL}/releases`,
	versionUrl: undefined,
	defaultProxyUrl: undefined,
	fakeAuthUrl: undefined,
};

const rawConfig =
	typeof __SITEGEIST_APP_CONFIG__ === "object" && __SITEGEIST_APP_CONFIG__ !== null ? __SITEGEIST_APP_CONFIG__ : {};

function normalizeOptionalUrl(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

export const appConfig: AppConfig = {
	repoUrl: normalizeOptionalUrl(rawConfig.repoUrl) || DEFAULT_APP_CONFIG.repoUrl,
	releasesUrl: normalizeOptionalUrl(rawConfig.releasesUrl) || DEFAULT_APP_CONFIG.releasesUrl,
	updatePageUrl: normalizeOptionalUrl(rawConfig.updatePageUrl) || DEFAULT_APP_CONFIG.updatePageUrl,
	versionUrl: normalizeOptionalUrl(rawConfig.versionUrl),
	defaultProxyUrl: normalizeOptionalUrl(rawConfig.defaultProxyUrl),
	fakeAuthUrl: normalizeOptionalUrl(rawConfig.fakeAuthUrl),
};
