import { html, type TemplateResult, icon } from "@mariozechner/mini-lit";
import "@mariozechner/mini-lit/dist/MarkdownBlock.js";
import { StringEnum, type AgentTool, type ToolResultMessage } from "@mariozechner/pi-ai";
import { registerToolRenderer, type ToolRenderer, SandboxIframe } from "@mariozechner/pi-web-ui";
import { Type, type Static } from "@sinclair/typebox";
import { BookOpen, List, Sparkles, Edit, Trash2, AlertCircle, ChevronDown, ChevronUp } from "lucide";
import type { Skill } from "../storage/skills-repository.js";
import { getSitegeistStorage } from "../storage/app-storage.js";
import { getFaviconUrl } from "../utils/favicon.js";
import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";

// Cross-browser API
// @ts-expect-error
const browser = globalThis.browser || globalThis.chrome;

const getSkills = () => getSitegeistStorage().skills;

// Get sandbox URL for CSP-compliant code validation
const getSandboxUrl = () => {
	return browser.runtime.getURL("sandbox.html");
};

/**
 * Validate JavaScript syntax using sandboxed iframe (CSP-compliant).
 * Returns { valid: true } or { valid: false, error: string }
 */
async function validateJavaScriptSyntax(code: string): Promise<{ valid: boolean; error?: string }> {
	const sandbox = new SandboxIframe();
	sandbox.sandboxUrlProvider = getSandboxUrl;
	sandbox.style.display = "none";
	document.body.appendChild(sandbox);

	try {
		const result = await sandbox.execute(`syntax-check-${Date.now()}`, code, []);
		sandbox.remove();

		if (!result.success && result.error) {
			return { valid: false, error: result.error.message };
		}

		return { valid: true };
	} catch (error: unknown) {
		sandbox.remove();
		return { valid: false, error: (error as Error).message || "Unknown error" };
	}
}

// IMPORTANT: Use StringEnum for Google API compatibility (NOT Type.Union!)
const skillParamsSchema = Type.Object({
	action: StringEnum(["get", "list", "create", "update", "delete"], {
		description: "Action to perform",
	}),
	name: Type.Optional(Type.String({ description: "Skill name (required for get/update/delete)" })),
	data: Type.Optional(
		Type.Object({
			name: Type.String({ description: "Unique skill name" }),
			domainPatterns: Type.Array(Type.String(), {
				description: "Array of glob patterns (e.g., ['youtube.com', 'youtu.be'] or ['github.com', 'github.com/*/issues']). Include short URLs and domain variations!"
			}),
			shortDescription: Type.String({ description: "Brief one-line plain text description" }),
			description: Type.String({ description: "Full markdown description (include gotchas/limitations, use markdown formatting)" }),
			examples: Type.String({ description: "Plain JavaScript code examples (will be rendered in code block)" }),
			library: Type.String({ description: "JavaScript code to inject" }),
		}),
	),
});

type SkillParams = Static<typeof skillParamsSchema>;

export const skillTool: AgentTool<typeof skillParamsSchema, any> = {
	label: "Skill Management",
	name: "skill",
	description: `Manage site skills - reusable JavaScript libraries for token-efficient automation.

**Why Skills Matter:**
Skills are small, domain-specific libraries you write ONCE and reuse via browser_javascript. Instead of repeatedly analyzing DOM and writing similar code, create a skill with common functions (e.g., "compose email", "list inbox", "send Slack message"). This is ESSENTIAL for token efficiency and faster workflows.

**What Skills Do:**
- Auto-inject into browser_javascript execution context when domain matches
- Provide reusable functions for common tasks on a site
- Save tokens by avoiding repetitive DOM exploration

**Example - Gmail Skill:**
Instead of writing code to compose email every time, create a skill once:

{
  action: "create",
  data: {
    name: "gmail-basics",
    domainPatterns: ["mail.google.com"],
    shortDescription: "Gmail email operations",
    description: "Send emails, read inbox, reply. Functions: sendEmail({to, subject, body}), listEmails(), readCurrentEmail(), reply(message), archive(), delete()",
    examples: "// Send email\\nawait window.gmail.sendEmail({to: 'test@example.com', subject: 'Hi', body: 'Hello!'})\\n\\n// List inbox\\nconst emails = window.gmail.listEmails()\\n\\n// Reply\\nawait window.gmail.reply('Thanks!')",
    library: "window.gmail = {\\n  sendEmail: async function({to, subject, body}) { /* ... */ },\\n  listEmails: function() { /* ... */ },\\n  readCurrentEmail: function() { /* ... */ },\\n  reply: async function(msg) { /* ... */ },\\n  archive: function() { /* ... */ },\\n  delete: function() { /* ... */ }\\n}"
  }
}

Then use it efficiently:
- gmail.sendEmail({to: 'user@example.com', subject: 'Test', body: 'Hi'})
- gmail.listEmails()

**Actions:**

1. **get** - View skill description and examples
   { action: "get", name: "gmail-basics" }

2. **list** - List skills for current domain
   { action: "list" }

3. **create** - Create new skill
   { action: "create", data: { name, domainPatterns, shortDescription, description, examples, library } }

4. **update** - Update skill (merges fields)
   { action: "update", name: "skill-name", data: { library: "..." } }

5. **delete** - Delete skill
   { action: "delete", name: "skill-name" }

**Creating Skills Workflow:**
1. User wants to automate site tasks
2. You MUST ask what tasks (5-15 functions like: compose email, list inbox, search, etc.) and provide the user with a proposal
3. For each task: explore DOM, write function, TEST IT WITH USER CONFIRMATION - user must confirm it works!
4. Bundle all functions into namespace object (window.siteName = {...})
5. Create skill with complete library code
6. CRITICAL: Always include domain variations in domainPatterns array if applicable:
   - Short URLs (e.g., ['youtube.com', 'youtu.be'])
   - Common variations (['github.com', 'gist.github.com'])
   - Use glob patterns for specificity (e.g., ['youtube.com', 'youtube.com/watch*', 'youtu.be'])
7. Now functions available every time you visit matching domains!

**Testing Requirements:**
- MUST test each function with user before finalizing
- User must confirm each function works
- If function fails, debug and retry until confirmed working

If invalid skill name provided, returns list of available skills for domain.`,
	parameters: skillParamsSchema,
	execute: async (_toolCallId: string, args: SkillParams) => {
		try {
			const skillsRepo = getSkills();
			const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
			const currentUrl = tab?.url || "";

			switch (args.action) {
				case "get": {
					if (!args.name) {
						return { output: "Missing 'name' parameter for get action.", isError: true, details: {} };
					}

					const skill = await skillsRepo.getSkill(args.name);
					if (!skill) {
						// Return list of available skills for current domain
						const available = await skillsRepo.listSkills(currentUrl);
						if (available.length === 0) {
							return { output: `Skill '${args.name}' not found. No skills available for current domain.`, isError: true, details: {} };
						}
						const list = available.map((s) => `- ${s.name}: ${s.shortDescription}`).join("\n");
						return {
							output: `Skill '${args.name}' not found. Available skills for current domain:\n\n${list}`,
							isError: true,
							details: {},
						};
					}

					return {
						output: `# ${skill.name}\n\n${skill.description}\n\n## Examples\n\`\`\`javascript\n${skill.examples}\n\`\`\``,
						isError: false,
						details: skill,
					};
				}

				case "list": {
					const skillList = await skillsRepo.listSkills(currentUrl);
					if (skillList.length === 0) {
						return { output: "No skills found for current domain.", isError: false, details: {} };
					}

					const output = skillList.map((s) => `- **${s.name}**: ${s.shortDescription}`).join("\n");
					return { output: `# Skills for current domain (${skillList.length})\n\n${output}`, isError: false, details: { skills: skillList } };
				}

				case "create": {
					if (!args.data) {
						return { output: "Missing 'data' parameter for create.", isError: true, details: {} };
					}

					// Check if already exists
					const existing = await skillsRepo.getSkill(args.data.name);
					if (existing) {
						return { output: `Skill '${args.data.name}' already exists. Use update action to modify.`, isError: true, details: {} };
					}

					// Validate syntax using sandboxed iframe (CSP-compliant)
					const validation = await validateJavaScriptSyntax(args.data.library);
					if (!validation.valid) {
						return { output: `Syntax error in library: ${validation.error}`, isError: true, details: {} };
					}

					const now = new Date().toISOString();
					const newSkill: Skill = {
						name: args.data.name,
						domainPatterns: args.data.domainPatterns,
						shortDescription: args.data.shortDescription,
						description: args.data.description,
						createdAt: now,
						lastUpdated: now,
						examples: args.data.examples,
						library: args.data.library,
					};

					await skillsRepo.saveSkill(newSkill);

					return {
						output: `Skill '${args.data.name}' created!\n\n${args.data.description}\n\n## Examples\n\n\`\`\`javascript\n${args.data.examples}\n\`\`\``,
						isError: false,
						details: newSkill,
					};
				}

				case "update": {
					if (!args.name) {
						return { output: "Missing 'name' parameter for update.", isError: true, details: {} };
					}
					if (!args.data) {
						return { output: "Missing 'data' parameter for update.", isError: true, details: {} };
					}

					const existing = await skillsRepo.getSkill(args.name);
					if (!existing) {
						return { output: `Skill '${args.name}' not found. Use create action.`, isError: true, details: {} };
					}

					// Validate library syntax if provided (using sandboxed iframe)
					if (args.data.library) {
						const validation = await validateJavaScriptSyntax(args.data.library);
						if (!validation.valid) {
							return { output: `Syntax error in library: ${validation.error}`, isError: true, details: {} };
						}
					}

					// Merge with existing (only update provided fields)
					const updated: Skill = {
						...existing,
						...args.data,
						name: existing.name, // Name cannot be changed
						createdAt: existing.createdAt, // Keep original creation date
						lastUpdated: new Date().toISOString(),
					};

					await skillsRepo.saveSkill(updated);

					return {
						output: `Skill '${args.name}' updated!`,
						isError: false,
						details: updated
					};
				}

				case "delete": {
					if (!args.name) {
						return { output: "Missing 'name' parameter for delete.", isError: true, details: {} };
					}

					const existing = await skillsRepo.getSkill(args.name);
					if (!existing) {
						return { output: `Skill '${args.name}' not found.`, isError: false, details: {} };
					}

					await skillsRepo.deleteSkill(args.name);
					return { output: `Skill '${args.name}' deleted.`, isError: false, details: {} };
				}

				default:
					return { output: `Unknown action: ${(args as any).action}`, isError: true, details: {} };
			}
		} catch (error: any) {
			return { output: `Error: ${error.message}`, isError: true, details: {} };
		}
	},
};

// Renderer
export class SkillRenderer extends LitElement implements ToolRenderer<SkillParams, any> {
	@property({ type: Object }) params!: SkillParams;
	@property({ type: Boolean }) isStreaming = false;
	@state() private expanded = false;

	protected createRenderRoot() {
		return this;
	}

	toggleExpanded() {
		this.expanded = !this.expanded;
	}

	renderParams(params: SkillParams, isStreaming?: boolean): TemplateResult {
		this.params = params;
		this.isStreaming = isStreaming || false;
		this.expanded = false; // Reset expanded state for new params
		return html`${this}`;
	}

	render(): TemplateResult {
		const params = this.params;
		if (!params) return html``;

		const isStreaming = this.isStreaming;
		const { action, name, data } = params;

		// Action-specific icons and labels
		const actionConfig: Record<string, { icon: any; getLabel: (name?: string) => string }> = {
			get: { icon: BookOpen, getLabel: (n) => `Get Skill${n ? ` "${n}"` : ""}` },
			list: { icon: List, getLabel: () => "List Skills" },
			create: { icon: Sparkles, getLabel: (n) => `Create Skill${n || data?.name ? ` "${n || data?.name}"` : ""}` },
			update: { icon: Edit, getLabel: (n) => `Update Skill${n ? ` "${n}"` : ""}` },
			delete: { icon: Trash2, getLabel: (n) => `Delete Skill${n ? ` "${n}"` : ""}` },
		};

		const config = actionConfig[action] || { icon: null, getLabel: () => `Skill: ${action}` };
		const label = config.getLabel(name);

		// Only show "Processing..." for create action (others are instant)
		const showProcessing = isStreaming && action === 'create';

		// Show expand/collapse for create action only (has full details)
		const canExpand = action === 'create';

		return html`
			<div class="rounded-md border border-border bg-card p-3 space-y-3">
				<!-- Header with action and status -->
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						${config.icon ? html`<span class="text-muted-foreground">${icon(config.icon, "sm")}</span>` : ""}
						<span class="font-medium text-sm">${label}</span>
					</div>
					<div class="flex items-center gap-2">
						${showProcessing ? html`<span class="text-xs text-muted-foreground">Processing...</span>` : ""}
						${canExpand ? html`
							<button
								class="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
								@click=${() => this.toggleExpanded()}
							>
								${icon(this.expanded ? ChevronUp : ChevronDown, "sm")}
							</button>
						` : ""}
					</div>
				</div>

				${data ? html`
					<!-- Domain info (using same style as NavigationMessage) -->
					${data.domainPatterns && data.domainPatterns.length > 0 ? html`
						<div class="flex flex-wrap gap-2">
							${data.domainPatterns.map(pattern => html`
								<div class="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg">
									<img src=${getFaviconUrl(pattern, 16)} width="16" height="16" alt="" class="flex-shrink-0" />
									<code class="text-muted-foreground font-mono">${pattern}</code>
								</div>
							`)}
						</div>
					` : ""}

					<!-- Short description -->
					${data.shortDescription ? html`
						<div class="text-sm text-foreground">${data.shortDescription}</div>
					` : ""}

					${this.expanded ? html`
						<!-- Full description (markdown) -->
						${data.description ? html`
							<div class="prose prose-sm max-w-none text-muted-foreground">
								<markdown-block .content=${data.description}></markdown-block>
							</div>
						` : ""}

						<!-- Examples (markdown) -->
						${data.examples ? html`
							<div class="space-y-1">
								<div class="text-xs font-medium text-muted-foreground">Examples</div>
								<div class="prose prose-sm max-w-none">
									<markdown-block .content=${data.examples}></markdown-block>
								</div>
							</div>
						` : ""}

						<!-- Library code -->
						${data.library ? html`
							<div class="space-y-1">
								<div class="text-xs font-medium text-muted-foreground">Library Code</div>
								<code-block .code=${data.library} language="javascript" .showLineNumbers=${false}></code-block>
							</div>
						` : ""}
					` : ""}
				` : ""}
			</div>
		`;
	}

	renderResult(_params: SkillParams, result: ToolResultMessage<any>): TemplateResult {
		const output = result.output || "";
		const isError = result.isError === true;
		const details = result.details || {};

		// Check if output looks like markdown
		const hasMarkdown = output.includes('#') || output.includes('**') || output.includes('```');

		// Get domain patterns from details if available (for get/list/delete actions)
		const domainPatterns = details.domainPatterns || (details.skills && details.skills.length > 0 ? details.skills[0].domainPatterns : null);

		if (isError) {
			return html`
				<div class="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-3">
					<div class="flex items-start gap-2">
						<span class="text-destructive">${icon(AlertCircle, "sm")}</span>
						<div class="text-sm text-destructive whitespace-pre-wrap flex-1">${output}</div>
					</div>
				</div>
			`;
		}

		return html`
			<div class="rounded-md border border-border bg-card p-3 space-y-3">
				${domainPatterns && domainPatterns.length > 0 ? html`
					<div class="flex flex-wrap gap-2">
						${domainPatterns.map((pattern: string) => html`
							<div class="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg">
								<img src=${getFaviconUrl(pattern, 16)} width="16" height="16" alt="" class="flex-shrink-0" />
								<code class="text-muted-foreground font-mono">${pattern}</code>
							</div>
						`)}
					</div>
				` : ""}
				${hasMarkdown ? html`
					<markdown-block .content=${output}></markdown-block>
				` : html`
					<div class="text-sm text-foreground whitespace-pre-wrap">${output}</div>
				`}
			</div>
		`;
	}
}

customElements.define("skill-renderer", SkillRenderer);

registerToolRenderer(skillTool.name, new SkillRenderer());
