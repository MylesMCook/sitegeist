import { describe, expect, test, vi } from "vitest";
import { settleCredentialPromptSuccess } from "../../src/dialogs/credential-prompt.js";

describe("credential prompt success settlement", () => {
	test("resolves immediately and clears polling state", () => {
		const clearIntervalFn = vi.fn();
		const resolvePromise = vi.fn();

		const nextState = settleCredentialPromptSuccess(
			{
				checkInterval: 42,
				resolvePromise,
			},
			clearIntervalFn,
		);

		expect(clearIntervalFn).toHaveBeenCalledWith(42);
		expect(resolvePromise).toHaveBeenCalledOnce();
		expect(resolvePromise).toHaveBeenCalledWith(true);
		expect(nextState).toEqual({
			checkInterval: undefined,
			resolvePromise: undefined,
		});
	});
});
