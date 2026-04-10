import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 60_000,
	fullyParallel: false,
	webServer: {
		command: "tsx tests/fake-auth/server.ts",
		port: 48652,
		reuseExistingServer: true,
	},
});
