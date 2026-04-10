import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";

export const test = base.extend<{
	context: BrowserContext;
	extensionId: string;
	sidepanelPage: Page;
}>({
	context: async ({}, use) => {
		const userDataDir = await mkdtemp(path.join(os.tmpdir(), "sitegeist-e2e-"));
		const pathToExtension = path.resolve("dist-chrome");
		const context = await chromium.launchPersistentContext(userDataDir, {
			channel: "chromium",
			headless: true,
			args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
		});

		try {
			await use(context);
		} finally {
			await context.close();
			await rm(userDataDir, { recursive: true, force: true });
		}
	},

	extensionId: async ({ context }, use) => {
		let [serviceWorker] = context.serviceWorkers();
		if (!serviceWorker) {
			serviceWorker = await context.waitForEvent("serviceworker");
		}

		const extensionId = serviceWorker.url().split("/")[2];
		await use(extensionId);
	},

	sidepanelPage: async ({ context, extensionId }, use) => {
		const page = await context.newPage();
		await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
		await expect(page.locator("body")).toContainText("Sitegeist");
		await use(page);
	},
});

export { expect };
