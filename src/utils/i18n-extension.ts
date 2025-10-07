import { setTranslations } from "@mariozechner/mini-lit";
import { translations as webUiTranslations } from "@mariozechner/pi-web-ui";

declare module "@mariozechner/mini-lit" {
	interface i18nMessages {
		"Permission request failed": string;
		"JavaScript Execution Permission Required": string;
		"This extension needs permission to execute JavaScript code on web pages": string;
		"The browser_javascript tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.": string;
		"The AI can read and modify web page content when you ask it to": string;
		"Code runs in an isolated environment with security safeguards": string;
		"Network access is blocked to prevent data exfiltration": string;
		"You can revoke this permission at any time in browser settings": string;
	}
}

const sitegeistTranslations = {
	en: {
		"Permission request failed": "Permission request failed",
		"JavaScript Execution Permission Required": "JavaScript Execution Permission Required",
		"This extension needs permission to execute JavaScript code on web pages":
			"This extension needs permission to execute JavaScript code on web pages",
		"The browser_javascript tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.":
			"The browser_javascript tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.",
		"The AI can read and modify web page content when you ask it to":
			"The AI can read and modify web page content when you ask it to",
		"Code runs in an isolated environment with security safeguards":
			"Code runs in an isolated environment with security safeguards",
		"Network access is blocked to prevent data exfiltration": "Network access is blocked to prevent data exfiltration",
		"You can revoke this permission at any time in browser settings":
			"You can revoke this permission at any time in browser settings",
	},
	de: {
		"Permission request failed": "Berechtigungsanfrage fehlgeschlagen",
		"JavaScript Execution Permission Required": "JavaScript-Ausführungsberechtigung erforderlich",
		"This extension needs permission to execute JavaScript code on web pages":
			"Diese Erweiterung benötigt die Berechtigung, JavaScript-Code auf Webseiten auszuführen",
		"The browser_javascript tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.":
			"Das browser_javascript-Tool ermöglicht es der KI, Webseiten in Ihrem Auftrag zu lesen und damit zu interagieren. Dies erfordert die userScripts-Berechtigung, um Code sicher auszuführen.",
		"The AI can read and modify web page content when you ask it to":
			"Die KI kann Webseiteninhalte lesen und ändern, wenn Sie es verlangen",
		"Code runs in an isolated environment with security safeguards":
			"Code wird in einer isolierten Umgebung mit Sicherheitsvorkehrungen ausgeführt",
		"Network access is blocked to prevent data exfiltration":
			"Netzwerkzugriff ist blockiert, um Datenexfiltration zu verhindern",
		"You can revoke this permission at any time in browser settings":
			"Sie können diese Berechtigung jederzeit in den Browsereinstellungen widerrufen",
	},
};

// Merge web-ui translations with sitegeist translations
const mergedTranslations = {
	en: { ...webUiTranslations.en, ...sitegeistTranslations.en },
	de: { ...webUiTranslations.de, ...sitegeistTranslations.de },
};

setTranslations(mergedTranslations);
