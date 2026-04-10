export interface CredentialPromptSettlement<TInterval> {
	checkInterval?: TInterval;
	resolvePromise?: (success: boolean) => void;
}

export function settleCredentialPromptSuccess<TInterval>(
	state: CredentialPromptSettlement<TInterval>,
	clearIntervalFn: (interval: TInterval) => void,
): CredentialPromptSettlement<TInterval> {
	if (state.checkInterval !== undefined) {
		clearIntervalFn(state.checkInterval);
	}

	state.resolvePromise?.(true);

	return {
		checkInterval: undefined,
		resolvePromise: undefined,
	};
}
