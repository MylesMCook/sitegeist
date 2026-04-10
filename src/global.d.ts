/// <reference path="./utils/i18n-extension.ts" />

declare const __SITEGEIST_APP_CONFIG__:
	| {
			repoUrl?: string;
			releasesUrl?: string;
			updatePageUrl?: string;
			versionUrl?: string;
			defaultProxyUrl?: string;
			fakeAuthUrl?: string;
	  }
	| undefined;
