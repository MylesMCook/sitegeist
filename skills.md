# Site Skills System

## Overview

**Site Skills** are reusable JavaScript libraries that provide domain-specific automation APIs for frequently visited websites. Instead of writing DOM manipulation code from scratch each time, the LLM can use pre-built functions like `slack.reply("Thanks!")` or `gmail.search("from:boss")`. We MUST assume useres are non-technical and guide them through this. If a user turns out to be technical, we can exploit that to create skills quicker.

### Key Benefits

- **Consistency**: Same API across sessions for a given site
- **Efficiency**: LLM writes cleaner, simpler code
- **Evolution**: Skills improve over time as new tasks are discovered
- **User Control**: User decides when to create/update skills

## How It Works

### 1. Skill Detection & Auto-Injection

When the user visits a page:

1. System checks if a skill exists for the current domain (e.g., `slack.com`)
2. If found, the skill's library code is **automatically injected** into the userScripts execution context
3. A **system reminder** is added to the LLM context, informing it about available skills

Example system reminder:
```
A skill library for slack.com is loaded. Use await skill({ action: 'get' }) to see available functions, or use window.slack.* directly.
```

### 2. Using Skills

The LLM can:

- **Use functions directly** if it remembers the API:
  ```javascript
  await slack.reply("Thanks for the update!", true)
  ```

- **Get documentation** when needed:
  ```javascript
  await skill({ action: 'get' })
  ```

- **List all available skills**:
  ```javascript
  await skill({ action: 'list' })
  ```

### 3. Creating Skills

**User Trigger**: User says something like:
- "let's create a skill for this site"
- "can we make a skill for Slack?"
- "let's build automation for Gmail"

**LLM Response**: Enter skill creation mode with this process:

#### Step 1: Identify Tasks
Ask the user what tasks they want to automate:
- Be specific: "read messages", "send reply", "search", etc.
- Aim for 5-15 granular tasks
- Examples from slack.md and gmail.md show good granularity

#### Step 2: Explore & Implement
For each task:
1. Use `browser_javascript` to explore the page DOM
2. Figure out selectors, event triggers, click sequences
3. Build a simple function for that task
4. **Test it immediately** to verify it works together with the user
5. Iterate if needed

#### Step 3: Build the Library
Create a namespace object:
```javascript
window.slack = {
  getMessages: () => {
    // DOM manipulation code
    const messages = Array.from(document.querySelectorAll('.message'));
    return messages.map(m => ({
      author: m.querySelector('.author').textContent,
      text: m.querySelector('.text').textContent,
      time: m.querySelector('.time').textContent
    }));
  },

  reply: (text, send = false) => {
    const input = document.querySelector('[data-qa="message_input"]');
    input.textContent = text;
    if (send) {
      document.querySelector('[data-qa="send_button"]').click();
    }
  }
}
```

**API Design Principles**:
- Keep functions simple and intuitive
- Use descriptive names
- Add helpful console.log messages
- Handle errors gracefully
- Return useful data structures

#### Step 4: Document
Write comprehensive documentation:

**Description**: What this skill does
```
Slack workspace automation library for reading messages, sending replies, and managing channels.
```

**Usage Examples**: How to call each function
```
Examples:

// Get recent messages from current channel
const messages = slack.getMessages()

// Reply to a thread (without sending)
slack.reply("Thanks for the update!")

// Reply and send immediately
slack.reply("Sounds good!", true)

// Search for messages
const results = slack.search("project deadline")
```

**Notes**: Gotchas, limitations, important details
```
Notes:
- Works in Slack web app only (not mobile)
- Must be viewing a channel/thread for reply() to work
- getMessages() returns last 50 visible messages
- Reinstall when switching workspaces
```

#### Step 5: Save
Call the skill tool to persist:
```javascript
await skill({
  action: "create",
  data: {
    domain: "slack.com",
    description: "Slack workspace automation library...",
    examples: "Examples:\n- slack.getMessages()...",
    library: "window.slack = { ... }",
    notes: "Works in Slack web app only..."
  }
})
```

### 4. Updating Skills

When a skill function breaks (selectors changed, page updated):

1. **Debug**: Use browser_javascript to investigate what changed
2. **Fix**: Update the affected function(s)
3. **Update**: Call skill tool with changes
   ```javascript
   await skill({
     action: "update",
     changes: {
       library: "window.slack = { /* updated code */ }"
     }
   })
   ```
4. **Test**: Verify the fix works together with the user
5. **Continue**: Resume the original task

### 5. LLM Proactive Suggestions

The LLM should suggest creating a skill when it notices repetitive patterns:

**Trigger**: Writing similar browser_javascript code for the same domain 3+ times in a session

**Suggestion**:
> "We're doing a lot of slack.com automation. Want to create a skill for this site so I can be more effective?"

**User decides**: They can accept, decline, or defer to later

## Skill Format

```javascript
{
  domain: "slack.com",               // Domain to match (exact match)
  version: "1.0.0",                  // Semantic version
  lastUpdated: "2025-10-07",         // ISO date
  description: "Brief overview...",  // What this skill does
  examples: "Examples:\n...",        // Usage examples (shown when skill() called)
  library: "window.slack = {...}",   // JavaScript code to inject
  notes: "Important details..."      // Gotchas, limitations, etc.
}
```

## Skill Tool API

The `skill()` tool provides multiple actions:

### Get Current Skill
```javascript
await skill({ action: 'get' })
// Returns: { description, examples, notes } for current domain
```

### List All Skills
```javascript
await skill({ action: 'list' })
// Returns: Array of { domain, description, version, lastUpdated }
```

### Create New Skill
```javascript
await skill({
  action: 'create',
  domain: 'gmail.com',  // Optional, defaults to current domain
  data: {
    description: "...",
    examples: "...",
    library: "window.gmail = {...}",
    notes: "..."
  }
})
```

### Update Existing Skill
```javascript
await skill({
  action: 'update',
  changes: {
    library: "window.slack = { /* updated */ }",
    notes: "Updated reply() to use new selector",
    version: "1.1.0"  // Optional version bump
  }
})
```

### Delete Skill
```javascript
await skill({
  action: 'delete',
  domain: 'oldsite.com'  // Optional, defaults to current domain
})
```

## Implementation Details

### Storage
- **Location**: Extension storage (chrome.storage.local / browser.storage.local)
- **Key**: `skills:{domain}` (e.g., `skills:slack.com`)
- **Format**: JSON object as defined above
- **Size**: Monitor storage usage, warn if approaching limits

### Domain Matching
- **Exact match**: `slack.com` matches `https://app.slack.com/client/...`
- **Subdomain support**: Extract base domain (strip `www.`, `app.`, etc.)
- **Path agnostic**: Skill applies to all paths under domain
- **Protocol agnostic**: Works for both http and https

### Code Injection
In `browser-javascript-userscripts.ts`:

1. Before executing user code, check if skill exists for current domain
2. If found, prepend skill library to user code:
   ```javascript
   const finalCode = skillLibrary + '\n' + userCode;
   ```
3. Inject combined code into userScripts execution context
4. Skill functions available as global (e.g., `window.slack.*`)

### System Reminder Injection
In `sidepanel.ts` or message transformer:

1. When loading a page, check for skill
2. If found, add system message to context:
   ```javascript
   {
     role: 'system',
     content: `A skill library for ${domain} is available. Use skill({ action: 'get' }) to see docs, or use window.${namespace}.* directly.`
   }
   ```

### Testing & Validation
After create/update:

1. **Syntax check**: Try to eval() the library code in a sandbox
2. **Structure check**: Verify the namespace object exists
3. **Function check**: List all available functions
4. **Report**: Show user what was created/updated
   ```
   ✅ Skill created for slack.com
   Functions: getMessages, reply, search, deleteMessage
   Version: 1.0.0
   ```

### Error Handling
- **Missing skill**: Gracefully handle when skill() called but no skill exists
- **Broken code**: Catch syntax errors, show user the issue
- **Storage errors**: Handle quota exceeded, permission issues
- **Stale skills**: Warn when skill is >6 months old

## User Experience Flows

### Flow 1: First Time on Slack
```
User: "What are the latest messages?"
LLM: [Uses browser_javascript to manually get messages]
LLM: "We're doing Slack automation. Want to create a skill for this site?"
User: "Yes, let's do it"
LLM: [Enters skill creation mode]
  1. "What tasks do you want to automate? Here's what I can think of:
     - Read messages
     - Send replies
     - Search messages
     Any others?"
  2. [User provides list]
  3. [LLM implements each function]
  4. [LLM saves skill]
  5. "✅ Skill created! Try: slack.getMessages()"
```

### Flow 2: Using Existing Skill
```
User: "Reply 'Thanks!' to the last message"
LLM: [Sees system reminder about slack skill]
LLM: [Uses slack.reply("Thanks!", true) directly]
LLM: "Done! Sent 'Thanks!' as a reply"
```

### Flow 3: Skill Needs Update
```
User: "Get the latest messages"
LLM: [Calls slack.getMessages()]
Error: Cannot read property 'textContent' of null
LLM: [Debugs, finds selector changed]
LLM: "The message selector changed. Let me update the skill..."
LLM: [Updates skill with new selector]
LLM: [Retries, succeeds]
LLM: "Fixed! Here are the messages..."
```

## System Prompt Addition

Add to the system prompt:

```markdown
## Site Skills

Site Skills are reusable JavaScript libraries for domain-specific automation. When available, skills are automatically loaded for the current domain.

### Using Skills
- Skills are injected as global objects (e.g., `window.slack`, `window.gmail`)
- Use functions directly if you know the API: `slack.reply("Thanks!")`
- Call `skill({ action: 'get' })` to see documentation
- Call `skill({ action: 'list' })` to see all available skills

### Creating Skills
When the user says:
- "let's create a skill for this site"
- "can we make a skill for [domain]?"
- "let's build automation for this page"

Enter skill creation mode:

1. **Identify tasks**: Ask what they want to automate (5-15 granular tasks)
2. **Explore & implement**: For each task, explore DOM and build function
3. **Build library**: Create namespace object with all functions
4. **Document**: Write description, examples, notes
5. **Save**: Call skill({ action: "create", data: {...} })

Be methodical. Test each function. Keep APIs simple and intuitive.

### Suggesting Skills
If you write similar browser_javascript code for the same domain 3+ times in a session, suggest:
"We're doing a lot of [domain] automation. Want to create a skill for this site so these functions are always available?"

User stays in control - they can accept, decline, or defer.
```

## Open Questions

### 1. Skill Sharing
- Should skills be exportable/importable?
- Community skill repository?
- How to handle different versions of the same site (Gmail UI changes)?

### 2. Skill Namespacing
- Always use domain as namespace? (`window.slack`)
- Allow custom names? (`window.mySlackUtils`)
- Conflict resolution if multiple skills for same domain?

### 3. Skill Permissions
- Some sites might need additional permissions (clipboard, notifications)
- How to declare and request these?
- Security model for untrusted skill code?

### 4. Skill Composition
- Can skills depend on each other?
- Shared utilities across skills? (e.g., `common.waitForElement()`)
- How to manage dependencies?

### 5. Skill Testing
- Beyond smoke tests, should we have unit tests?
- How to test async operations (clicking, waiting)?
- Mocking vs real page interaction?

### 6. Multi-Account Support
- Gmail has /mail/u/0/, /mail/u/1/, etc.
- Should each be a separate skill?
- Or one skill with account parameter?

### 7. Skill Versioning
- Semantic versioning (1.0.0, 1.1.0, 2.0.0)?
- Auto-increment on update?
- Migration path for breaking changes?

### 8. Performance
- Skills could be large (10KB+ of code)
- Lazy load vs eager inject?
- Cache compiled/minified versions?

### 9. Debugging
- How to debug skill code when it fails?
- Source maps?
- Breakpoint support?
- Logging strategy?

### 10. Skill Lifecycle
- When to deprecate old skills?
- Automatic cleanup of unused skills?
- Archive vs delete?

## Examples

See:
- [slack.md](./slack.md) - Slack skill example
- [gmail.md](./gmail.md) - Gmail skill example

These show the right level of granularity and documentation style.

## Next Steps

1. Implement `skill()` tool in `src/tools/`
2. Add skill storage/retrieval logic
3. Settings tab that lets user browse skills they created, inspect them
3. Update `browser-javascript-userscripts.ts` to inject skill code
4. Add system reminder injection for skill availability
5. Update system prompt with skill creation instructions
6. Test with Slack and Gmail skills
7. Iterate based on real usage
