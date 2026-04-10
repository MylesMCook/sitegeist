import { Button } from "@sitegeist/mini-lit/dist/Button.js";
import { DialogContent, DialogHeader } from "@sitegeist/mini-lit/dist/Dialog.js";
import { DialogBase } from "@sitegeist/mini-lit/dist/DialogBase.js";
import { getAppStorage } from "@sitegeist/pi-web-ui";
import { html } from "lit";
import { Toast } from "../components/Toast.js";
import {
	getOAuthProviderName,
	isOAuthProvider,
	type OAuthProviderId,
	oauthLogin,
	serializeOAuthCredentials,
} from "../oauth/index.js";
import { settleCredentialPromptSuccess } from "./credential-prompt.js";
// ProviderKeyInput custom element is registered via pi-web-ui main export
import "@sitegeist/pi-web-ui";

/**
 * Prompt dialog shown when trying to use a provider with no stored credentials.
 * Leads with subscription login when available and keeps API keys behind an advanced path.
 */
export class ApiKeyOrOAuthDialog extends DialogBase {
	private provider = "";
	private resolvePromise?: (success: boolean) => void;
	private checkInterval?: ReturnType<typeof setInterval>;
	private oauthStatus: "idle" | "logging-in" | "error" = "idle";
	private oauthError = "";
	private deviceCode: string | null = null;

	protected modalWidth = "min(500px, 90vw)";
	protected modalHeight = "auto";

	static async prompt(provider: string): Promise<boolean> {
		const dialog = new ApiKeyOrOAuthDialog();
		dialog.provider = provider;
		dialog.open();

		return new Promise((resolve) => {
			dialog.resolvePromise = resolve;
		});
	}

	override connectedCallback() {
		super.connectedCallback();

		// Poll for key existence
		this.checkInterval = setInterval(async () => {
			const hasKey = !!(await getAppStorage().providerKeys.get(this.provider));
			if (hasKey) {
				this.resolveSuccess();
			}
		}, 500);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		if (this.checkInterval) clearInterval(this.checkInterval);
	}

	override close() {
		super.close();
		if (this.resolvePromise) {
			this.resolvePromise(false);
		}
	}

	private resolveSuccess() {
		const nextState = settleCredentialPromptSuccess(
			{
				checkInterval: this.checkInterval,
				resolvePromise: this.resolvePromise,
			},
			(interval) => clearInterval(interval),
		);

		this.checkInterval = nextState.checkInterval;
		this.resolvePromise = nextState.resolvePromise;
		this.close();
	}

	private async handleOAuthLogin() {
		this.oauthStatus = "logging-in";
		this.oauthError = "";
		this.deviceCode = null;
		this.requestUpdate();

		try {
			const storage = getAppStorage();

			const credentials = await oauthLogin(this.provider as OAuthProviderId, undefined, (info) => {
				this.deviceCode = info.userCode;
				this.requestUpdate();
			});

			await storage.providerKeys.set(this.provider, serializeOAuthCredentials(credentials));

			this.oauthStatus = "idle";
			this.deviceCode = null;
			Toast.success(`Logged in to ${getOAuthProviderName(this.provider as OAuthProviderId)}`);
			this.resolveSuccess();
		} catch (error) {
			console.error(`OAuth login failed for ${this.provider}:`, error);
			this.oauthStatus = "error";
			this.oauthError = error instanceof Error ? error.message : "Login failed";
			this.deviceCode = null;
			this.requestUpdate();
		}
	}

	protected renderContent() {
		const supportsOAuth = isOAuthProvider(this.provider);
		const providerName = supportsOAuth ? getOAuthProviderName(this.provider as OAuthProviderId) : this.provider;

		return html`
			${DialogContent({
				className: "flex flex-col gap-4",
				children: html`
					${DialogHeader({
						title: supportsOAuth ? `Connect ${providerName}` : `Set up ${providerName}`,
						description: supportsOAuth
							? "Connect your existing subscription to use this provider right away."
							: "Enter an API key to use this provider's models.",
					})}

					${
						supportsOAuth
							? html`
							<div class="flex flex-col gap-3">
								<h3 class="text-sm font-semibold text-foreground">Subscription</h3>

								<div class="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
									<div class="flex-1">
										<div class="text-sm font-medium text-foreground">
											${providerName}
										</div>
										<div class="text-xs text-muted-foreground mt-1">
											${
												this.oauthStatus === "logging-in"
													? this.deviceCode
														? html`Enter code: <strong class="text-foreground font-mono">${this.deviceCode}</strong>`
														: "Logging in..."
													: this.oauthStatus === "error"
														? html`<span class="text-destructive">${this.oauthError}</span>`
														: "Use your existing subscription. No API key needed."
											}
										</div>
									</div>
									${Button({
										variant: "default",
										size: "sm",
										disabled: this.oauthStatus === "logging-in",
										loading: this.oauthStatus === "logging-in",
										onClick: () => this.handleOAuthLogin(),
										children: "Connect",
									})}
								</div>
							</div>
							<details class="rounded-lg border border-border bg-card/40">
								<summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
									Bring your own key
									<span class="ml-2 text-xs font-normal text-muted-foreground">Advanced</span>
								</summary>
								<div class="flex flex-col gap-3 border-t border-border px-4 py-4">
									<h3 class="text-sm font-semibold text-foreground">API key</h3>
									<p class="text-sm text-muted-foreground">
										Use direct API billing instead of your subscription when you want full control.
									</p>
									<provider-key-input .provider=${this.provider}></provider-key-input>
								</div>
							</details>
						`
							: ""
					}

					${
						supportsOAuth
							? ""
							: html`
								<div class="flex flex-col gap-3">
									<h3 class="text-sm font-semibold text-foreground">API key</h3>
									<provider-key-input .provider=${this.provider}></provider-key-input>
								</div>
							`
					}
				`,
			})}
		`;
	}
}

if (!customElements.get("api-key-or-oauth-dialog")) {
	customElements.define("api-key-or-oauth-dialog", ApiKeyOrOAuthDialog);
}
