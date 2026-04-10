import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.SITEGEIST_FAKE_AUTH_PORT || 48652);
const baseUrl = `http://${HOST}:${PORT}`;

interface DeviceCodeState {
	approved: boolean;
	userCode: string;
}

const deviceCodes = new Map<string, DeviceCodeState>();

function sendJson(response: ServerResponse, status: number, body: unknown) {
	response.writeHead(status, {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "content-type, authorization, accept, user-agent, editor-version, editor-plugin-version, copilot-integration-id, x-goog-api-client",
		"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	});
	response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, html: string) {
	response.writeHead(status, {
		"Content-Type": "text/html; charset=utf-8",
	});
	response.end(html);
}

function redirect(response: ServerResponse, location: string) {
	response.writeHead(302, { Location: location });
	response.end();
}

function encodeBase64Url(value: string): string {
	return Buffer.from(value, "utf8").toString("base64url");
}

function createOpenAiToken(accountId: string): string {
	const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
	const payload = encodeBase64Url(
		JSON.stringify({
			"https://api.openai.com/auth": {
				chatgpt_account_id: accountId,
			},
		}),
	);
	return `${header}.${payload}.signature`;
}

async function readRequestBody(request: IncomingMessage): Promise<Record<string, string>> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	if (chunks.length === 0) {
		return {};
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");
	const contentType = request.headers["content-type"] || "";

	if (contentType.includes("application/json")) {
		const parsed = JSON.parse(rawBody) as Record<string, unknown>;
		return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
	}

	return Object.fromEntries(new URLSearchParams(rawBody).entries());
}

function renderAuthorizePage(provider: string, requestUrl: URL) {
	const redirectUri = requestUrl.searchParams.get("redirect_uri");
	const state = requestUrl.searchParams.get("state");
	if (!redirectUri || !state) {
		return "<h1>Missing redirect_uri or state</h1>";
	}

	const approveUrl = new URL(redirectUri);
	approveUrl.searchParams.set("code", `${provider}-code`);
	approveUrl.searchParams.set("state", state);

	const denyUrl = new URL(redirectUri);
	denyUrl.searchParams.set("error", "access_denied");
	denyUrl.searchParams.set("state", state);

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>${provider} fake auth</title>
		<style>
			body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #f9fafb; }
			main { width: min(420px, calc(100vw - 32px)); padding: 24px; border: 1px solid #374151; border-radius: 8px; background: #1f2937; }
			h1 { margin: 0 0 12px; font-size: 20px; }
			p { margin: 0 0 16px; color: #d1d5db; line-height: 1.5; }
			.actions { display: flex; gap: 12px; }
			button { border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; cursor: pointer; }
			.primary { background: #2563eb; color: white; }
			.secondary { background: #374151; color: white; }
		</style>
	</head>
	<body>
		<main>
			<h1>Fake ${provider} consent</h1>
			<p>Use this page to approve or deny the local Sitegeist test flow.</p>
			<div class="actions">
				<button id="approve" class="primary" type="button">Approve</button>
				<button id="deny" class="secondary" type="button">Deny</button>
			</div>
		</main>
		<script>
			document.getElementById("approve").addEventListener("click", () => {
				window.location.href = ${JSON.stringify(approveUrl.toString())};
			});
			document.getElementById("deny").addEventListener("click", () => {
				window.location.href = ${JSON.stringify(denyUrl.toString())};
			});
		</script>
	</body>
</html>`;
}

function renderDeviceVerificationPage(deviceCode: string, userCode: string) {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>GitHub Copilot fake verification</title>
		<style>
			body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #020617; color: #f8fafc; }
			main { width: min(420px, calc(100vw - 32px)); padding: 24px; border: 1px solid #1e293b; border-radius: 8px; background: #0f172a; }
			code { display: inline-block; margin: 8px 0 16px; padding: 6px 8px; border-radius: 6px; background: #1e293b; }
			button { border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; cursor: pointer; background: #2563eb; color: white; }
		</style>
	</head>
	<body>
		<main>
			<h1>Approve local device code</h1>
			<p>Device code:</p>
			<code>${userCode}</code>
			<div>
				<button id="approve" type="button">Approve</button>
			</div>
		</main>
		<script>
			document.getElementById("approve").addEventListener("click", async () => {
				await fetch(${JSON.stringify(`${baseUrl}/github-copilot/approve?device_code=${deviceCode}`)});
				document.body.innerHTML = "<main><h1>Approved</h1><p>You can close this tab.</p></main>";
			});
		</script>
	</body>
</html>`;
}

const server = createServer(async (request, response) => {
	try {
		if (!request.url) {
			sendJson(response, 400, { error: "missing_url" });
			return;
		}

		if (request.method === "OPTIONS") {
			response.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "content-type, authorization, accept, user-agent, editor-version, editor-plugin-version, copilot-integration-id, x-goog-api-client",
				"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
			});
			response.end();
			return;
		}

		const requestUrl = new URL(request.url, baseUrl);

		if (requestUrl.pathname === "/health") {
			sendJson(response, 200, { ok: true });
			return;
		}

		if (request.method === "GET" && /\/(openai-codex|anthropic|google-gemini-cli)\/authorize$/.test(requestUrl.pathname)) {
			sendHtml(response, 200, renderAuthorizePage(requestUrl.pathname.split("/")[1] || "provider", requestUrl));
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/openai-codex/token") {
			sendJson(response, 200, {
				access_token: createOpenAiToken("acct_local"),
				refresh_token: "refresh-openai-local",
				expires_in: 3600,
				account_id: "acct_local",
			});
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/anthropic/token") {
			sendJson(response, 200, {
				access_token: "anthropic-access-local",
				refresh_token: "anthropic-refresh-local",
				expires_in: 3600,
			});
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/google-gemini-cli/token") {
			sendJson(response, 200, {
				access_token: "gemini-access-local",
				refresh_token: "gemini-refresh-local",
				expires_in: 3600,
			});
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/google-gemini-cli/load-code-assist") {
			sendJson(response, 200, {
				cloudaicompanionProject: "sitegeist-local-project",
			});
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/google-gemini-cli/onboard-user") {
			sendJson(response, 200, {
				done: true,
				response: {
					cloudaicompanionProject: {
						id: "sitegeist-local-project",
					},
				},
			});
			return;
		}

		if (request.method === "GET" && requestUrl.pathname.startsWith("/google-gemini-cli/operations/")) {
			sendJson(response, 200, {
				done: true,
				response: {
					cloudaicompanionProject: {
						id: "sitegeist-local-project",
					},
				},
			});
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/github-copilot/login/device/code") {
			const deviceCode = `device-${Date.now()}`;
			const userCode = "SITE-GEIST";
			deviceCodes.set(deviceCode, {
				approved: false,
				userCode,
			});
			sendJson(response, 200, {
				device_code: deviceCode,
				user_code: userCode,
				verification_uri: `${baseUrl}/github-copilot/verify?device_code=${deviceCode}`,
				interval: 1,
				expires_in: 900,
			});
			return;
		}

		if (request.method === "GET" && requestUrl.pathname === "/github-copilot/verify") {
			const deviceCode = requestUrl.searchParams.get("device_code");
			const state = deviceCode ? deviceCodes.get(deviceCode) : undefined;
			if (!deviceCode || !state) {
				sendHtml(response, 404, "<h1>Unknown device code</h1>");
				return;
			}
			sendHtml(response, 200, renderDeviceVerificationPage(deviceCode, state.userCode));
			return;
		}

		if (request.method === "GET" && requestUrl.pathname === "/github-copilot/approve") {
			const deviceCode = requestUrl.searchParams.get("device_code");
			const state = deviceCode ? deviceCodes.get(deviceCode) : undefined;
			if (!deviceCode || !state) {
				sendJson(response, 404, { error: "unknown_device_code" });
				return;
			}
			state.approved = true;
			sendJson(response, 200, { ok: true });
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/github-copilot/login/oauth/access_token") {
			const body = await readRequestBody(request);
			const state = body.device_code ? deviceCodes.get(body.device_code) : undefined;
			if (!state || !state.approved) {
				sendJson(response, 200, { error: "authorization_pending" });
				return;
			}
			sendJson(response, 200, { access_token: "github-access-local" });
			return;
		}

		if (request.method === "GET" && requestUrl.pathname === "/github-copilot/copilot_internal/v2/token") {
			sendJson(response, 200, {
				token: "copilot-local-token",
				expires_at: Math.floor((Date.now() + 3_600_000) / 1000),
			});
			return;
		}

		sendJson(response, 404, {
			error: "not_found",
			method: request.method,
			path: requestUrl.pathname,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[fake-auth] Unexpected error:", error);
		if (!response.writableEnded) {
			if (response.headersSent) {
				response.end();
			} else {
				sendJson(response, 500, { error: "internal_error", message });
			}
		}
	}
});

server.listen(PORT, HOST, () => {
	console.log(`Fake auth server running at ${baseUrl}`);
});
