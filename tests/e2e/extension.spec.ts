import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

async function openProvidersSetup(page: Page) {
	await expect(page.getByText("Welcome to Sitegeist")).toBeVisible();
	await page.getByRole("button", { name: "Connect a provider" }).click();
	await expect(page.getByText("Connect a subscription")).toBeVisible();
}

function providerCard(page: Page, name: string) {
	return page.locator("div").filter({ hasText: name }).first();
}

test("shows subscription-first providers in the curated order", async ({ sidepanelPage }) => {
	await openProvidersSetup(sidepanelPage);

	const bodyText = await sidepanelPage.locator("body").textContent();
	expect(bodyText).toContain("Bring your own key");

	const names = ["ChatGPT Plus/Pro", "Anthropic (Claude Pro/Max)", "GitHub Copilot", "Google Gemini"];
	const positions = names.map((name) => bodyText?.indexOf(name) ?? -1);

	for (const position of positions) {
		expect(position).toBeGreaterThanOrEqual(0);
	}

	expect(positions).toEqual([...positions].sort((left, right) => left - right));
});

test("connects ChatGPT through the local fake auth flow", async ({ context, sidepanelPage }) => {
	await openProvidersSetup(sidepanelPage);

	const authPagePromise = context.waitForEvent("page");
	await providerCard(sidepanelPage, "ChatGPT Plus/Pro").getByRole("button", { name: "Connect" }).click();
	const authPage = await authPagePromise;
	await authPage.waitForLoadState("domcontentloaded");
	await expect(authPage.getByText("Fake openai-codex consent")).toBeVisible();
	await authPage.getByRole("button", { name: "Approve" }).click();
	await authPage.waitForEvent("close");

	await expect(providerCard(sidepanelPage, "ChatGPT Plus/Pro")).toContainText("Connected");
});

test("shows an inline error when the auth tab is closed", async ({ context, sidepanelPage }) => {
	await openProvidersSetup(sidepanelPage);

	const authPagePromise = context.waitForEvent("page");
	await providerCard(sidepanelPage, "ChatGPT Plus/Pro").getByRole("button", { name: "Connect" }).click();
	const authPage = await authPagePromise;
	await authPage.close();

	await expect(providerCard(sidepanelPage, "ChatGPT Plus/Pro")).toContainText("Auth tab was closed before completing login");
});
