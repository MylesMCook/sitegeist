import { AppStorage as BaseAppStorage, WebExtensionStorageBackend, SessionIndexedDBBackend, getAppStorage } from "@mariozechner/pi-web-ui";
import { SkillsRepository } from "./skills-repository.js";

/**
 * Extended AppStorage for Sitegeist with skills repository.
 */
export class SitegeistAppStorage extends BaseAppStorage {
	readonly skills: SkillsRepository;

	constructor() {
		// Initialize base AppStorage with web-ui repositories
		super({
			settings: new WebExtensionStorageBackend("settings"),
			providerKeys: new WebExtensionStorageBackend("providerKeys"),
			sessions: new SessionIndexedDBBackend("pi-extension-sessions"),
		});

		// Add Sitegeist-specific repository
		this.skills = new SkillsRepository(new WebExtensionStorageBackend("skills"));
	}
}

/**
 * Helper to get typed Sitegeist storage.
 */
export function getSitegeistStorage(): SitegeistAppStorage {
	return getAppStorage() as SitegeistAppStorage;
}
