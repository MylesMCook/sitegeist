import { Button } from "@sitegeist/mini-lit/dist/Button.js";
import { DialogContent, DialogHeader } from "@sitegeist/mini-lit/dist/Dialog.js";
import { DialogBase } from "@sitegeist/mini-lit/dist/DialogBase.js";
import { html } from "lit";

/**
 * Shown on first launch when no providers are configured.
 * Blocks until user clicks OK, then opens provider settings.
 */
export class WelcomeSetupDialog extends DialogBase {
	private resolvePromise?: () => void;

	protected modalWidth = "min(450px, 90vw)";
	protected modalHeight = "auto";

	static show(): Promise<void> {
		return new Promise((resolve) => {
			const dialog = new WelcomeSetupDialog();
			dialog.resolvePromise = resolve;
			dialog.open();
		});
	}

	override close() {
		super.close();
		this.resolvePromise?.();
	}

	protected renderContent() {
		return html`
			${DialogContent({
				className: "flex flex-col gap-4",
				children: html`
					${DialogHeader({
						title: "Welcome to Sitegeist",
					})}
					<p class="text-sm text-foreground">
						Start by connecting a subscription-backed provider like ChatGPT, Claude, GitHub Copilot, or
						Gemini. API keys are still available later under advanced setup when you want them.
					</p>
					<div class="flex justify-end">
						${Button({
							variant: "default",
							onClick: () => this.close(),
							children: "Connect a provider",
						})}
					</div>
				`,
			})}
		`;
	}
}

if (!customElements.get("welcome-setup-dialog")) {
	customElements.define("welcome-setup-dialog", WelcomeSetupDialog);
}
