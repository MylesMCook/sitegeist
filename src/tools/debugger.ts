import type { AgentTool } from "@mariozechner/pi-ai";
import { type Agent } from "@mariozechner/pi-web-ui";
import { type Static, Type } from "@sinclair/typebox";

// Cross-browser API compatibility
// @ts-expect-error - browser global exists in Firefox, chrome in Chrome
const browser = globalThis.browser || globalThis.chrome;

// ============================================================================
// TYPES
// ============================================================================

const debuggerSchema = Type.Object({
	code: Type.String({
		description: "JavaScript code to execute in MAIN world context",
	}),
});

export type DebuggerParams = Static<typeof debuggerSchema>;

export interface DebuggerResult {
	value: any;
}

// ============================================================================
// TOOL
// ============================================================================

export class DebuggerTool implements AgentTool<typeof debuggerSchema, DebuggerResult> {
	label = "Debugger";
	name = "debugger";
	description = `Execute JavaScript in the MAIN world (not USER_SCRIPT) to access things browser_javascript cannot.

USE CASES (what browser_javascript CANNOT access):
- Page's own JavaScript variables, functions, framework instances (React, Vue, Angular state)
- window properties set by page scripts
- Cookies via document.cookie
- All other MAIN world internals that USER_SCRIPT world cannot see

Examples:
{ code: "document.cookie" } - Get cookies
{ code: "window.myApp.state" } - Access app state
{ code: "window.myFunction()" } - Call page function
{ code: "JSON.stringify(localStorage)" } - Get localStorage

Returns the evaluated result as JSON/text.

CRITICAL: Use browser_javascript for DOM manipulation. Use this ONLY for MAIN world access.`;
	parameters = debuggerSchema;

	constructor(private agent: Agent) {}

	async execute(
		_toolCallId: string,
		args: DebuggerParams,
		signal?: AbortSignal,
	): Promise<{ output: string; details: DebuggerResult }> {
		if (signal?.aborted) {
			throw new Error("Debugger command aborted");
		}

		// Get active tab
		const [tab] = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});

		if (!tab || !tab.id) {
			throw new Error("No active tab found");
		}

		try {
			// Attach debugger if not already attached
			try {
				await browser.debugger.attach({ tabId: tab.id }, "1.3");
			} catch (err: any) {
				// Already attached is fine
				if (!err.message?.includes("already attached")) {
					throw err;
				}
			}

			// Execute code in MAIN world using Runtime.evaluate with returnByValue
			const result = await browser.debugger.sendCommand(
				{ tabId: tab.id },
				"Runtime.evaluate",
				{
					expression: args.code,
					returnByValue: true,
				},
			);

			// Check for exceptions
			if (result.exceptionDetails) {
				const error = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Unknown error";
				throw new Error(`MAIN world execution failed: ${error}`);
			}

			// Extract the actual value
			const value = result.result?.value;
			const details: DebuggerResult = { value };

			// Format output
			let output = "";
			if (value === undefined) {
				output = "undefined";
			} else if (typeof value === "string") {
				output = value;
			} else {
				output = JSON.stringify(value, null, 2);
			}

			return { output, details };
		} catch (error: any) {
			throw new Error(`Debugger error: ${error.message}`);
		}
	}
}
