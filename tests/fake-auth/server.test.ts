import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import type { Readable } from "node:stream";
import net from "node:net";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

async function getAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Could not determine a free port"));
				return;
			}

			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(address.port);
			});
		});
	});
}

type FakeAuthServerProcess = ChildProcessByStdio<null, Readable, Readable>;

async function startFakeAuthServer(port: number): Promise<FakeAuthServerProcess> {
	const child = spawn(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "tests/fake-auth/server.ts"], {
		cwd: process.cwd(),
		env: {
			...process.env,
			SITEGEIST_FAKE_AUTH_PORT: String(port),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	const started = new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Timed out waiting for fake auth server to start"));
		}, 10_000);

		child.stdout.on("data", (chunk: Buffer | string) => {
			const text = chunk.toString();
			if (text.includes("Fake auth server running")) {
				clearTimeout(timeout);
				resolve();
			}
		});

		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});

		child.stderr.on("data", (chunk: Buffer | string) => {
			const text = chunk.toString();
			if (text.trim().length > 0 && !text.includes("[fake-auth] Unexpected error:")) {
				clearTimeout(timeout);
				reject(new Error(text.trim()));
			}
		});

		child.once("exit", (code, signal) => {
			clearTimeout(timeout);
			reject(new Error(`Fake auth server exited before startup (code=${code}, signal=${signal})`));
		});
	});

	await started;
	return child;
}

async function stopFakeAuthServer(child: FakeAuthServerProcess | undefined): Promise<void> {
	if (!child || child.killed) {
		return;
	}

	child.kill();
	await once(child, "exit");
}

describe("fake auth server", () => {
	let child: FakeAuthServerProcess | undefined;

	afterEach(async () => {
		await stopFakeAuthServer(child);
		child = undefined;
	});

	test("returns a deterministic 500 response for malformed request bodies", async () => {
		const port = await getAvailablePort();
		child = await startFakeAuthServer(port);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);

		try {
			const response = await fetch(`http://127.0.0.1:${port}/github-copilot/login/oauth/access_token`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: "{",
				signal: controller.signal,
			});

			expect(response.status).toBe(500);
			await expect(response.json()).resolves.toMatchObject({
				error: "internal_error",
			});
		} finally {
			clearTimeout(timeout);
		}
	});
});
