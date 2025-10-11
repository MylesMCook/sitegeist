# Multi-Window Session Lock Problem

## Context

Sitegeist is a Chrome extension with a sidepanel. We implemented session locking to prevent the same session from being open in multiple windows simultaneously.

**Architecture**:
- **Background service worker** ([background.ts](../src/background.ts)) - Maintains session locks in memory (`Map<sessionId, windowId>`)
- **Sidepanel** ([sidepanel.ts](../src/sidepanel.ts)) - Runs in each window's sidepanel, loads sessions
- **Communication** - Via `chrome.runtime.sendMessage()` for lock acquire/release

## Current Implementation

### Lock Acquisition (sidepanel.ts ~line 619-633)
```typescript
const latestSessionId = await storage.sessions.getLatestSessionId();
if (latestSessionId) {
    try {
        const lockResponse = await browserAPI.runtime.sendMessage({
            type: "acquireLock",
            sessionId: latestSessionId,
            windowId: currentWindowId,
        });
        if (lockResponse?.success) {
            // Load session
        } else {
            // Show landing page
        }
    } catch (err) {
        // Background not ready, show landing page
    }
}
```

### Lock Release Mechanisms

**1. beforeunload event** (sidepanel.ts ~line 496):
```typescript
window.addEventListener("beforeunload", () => {
    if (currentSessionId) {
        browserAPI.runtime.sendMessage({
            type: "releaseLock",
            sessionId: currentSessionId,
        });
    }
});
```

**2. windows.onRemoved** (background.ts ~line 78):
```typescript
browserAPI.windows.onRemoved.addListener((windowId: number) => {
    sessionLockManager.releaseAllForWindow(windowId);
});
```

**3. Session switch** (sidepanel.ts ~line 270-275):
```typescript
const loadSession = async (sessionId: string) => {
    if (currentSessionId) {
        await browserAPI.runtime.sendMessage({
            type: "releaseLock",
            sessionId: currentSessionId,
        });
    }
    // Navigate to new session
};
```

## The Problem

### Observed Behavior

**Step 1: Window 1 - Cmd+Shift+P**
- Opens sidepanel
- Loads last active session (e.g., "session-123")
- Lock acquired: `locks.set("session-123", window1Id)`
- ✓ Works correctly

**Step 2: Window 2 - Cmd+Shift+P**
- Opens sidepanel
- Tries to load session-123
- Lock acquisition fails (window1 has it)
- Shows landing page
- ✓ Works correctly

**Step 3: Window 1 - Close sidepanel manually**
- User clicks X button on sidepanel
- `beforeunload` event fires
- Sends `releaseLock` message
- **Problem**: Lock NOT released reliably

**Step 4: Window 2 - Cmd+Shift+P again**
- Opens sidepanel
- Tries to load session-123
- Lock STILL held by window1 (which is now closed!)
- Shows landing page
- ✗ **WRONG** - should load the session

### Additional Issue: Keyboard Shortcut

**Cmd+Shift+P behavior**:
- When sidepanel is **closed** → opens it ✓
- When sidepanel is **open** → does nothing ✗
- Expected: should toggle (open/close)

Currently (background.ts ~line 122-127):
```typescript
browserAPI.commands?.onCommand.addListener(async (command: string) => {
    if (command === "toggle-sidepanel") {
        browserAPI.windows.getCurrent((w: any) => {
            if (w.id && (browserAPI as any).sidePanel?.open) {
                (browserAPI as any).sidePanel.open({ windowId: w.id });
            }
        });
    }
});
```

This only **opens**, never closes.

## Root Cause Analysis

### Why beforeunload is unreliable

1. **Fire-and-forget**: `sendMessage()` in `beforeunload` doesn't wait for response
2. **Browser kills page immediately**: Message might not be sent before page unloads
3. **No guarantees**: Chrome doesn't guarantee message delivery from closing pages
4. **Race condition**: Service worker might be asleep when message arrives

### Why windows.onRemoved doesn't help

- `windows.onRemoved` fires when the **browser window** closes
- Closing the **sidepanel** (clicking X) does NOT close the window
- Window stays open, sidepanel closes, lock remains

### Why this is a critical issue

1. **Stale locks**: Once a lock gets stuck, only extension reload clears it
2. **User frustration**: User can't open their session even though no window has it
3. **No workaround**: User must reload extension to clear locks

## System Constraints

### Chrome Extension APIs

**Message passing** (`chrome.runtime.sendMessage`):
- One-shot request/response
- No delivery guarantees in `beforeunload`
- Background worker must be awake to receive

**Port connections** (`chrome.runtime.connect`):
- Long-lived bidirectional communication
- `onDisconnect` fires reliably when page closes/crashes
- Better for tracking page lifecycle

**Service worker lifecycle**:
- Can go to sleep after 30s inactivity
- Wakes on incoming messages/events
- All in-memory state (like locks) persists while awake

**Sidepanel behavior**:
- Each window can have one sidepanel
- Closing sidepanel doesn't close window
- Sidepanel page unloads completely when closed
- No persistent connection between sidepanel and background

## Potential Solutions (Not Implemented)

### Option 1: Port-based connections
Use long-lived connections that automatically disconnect when sidepanel closes:

```typescript
// In sidepanel.ts initApp()
const port = browserAPI.runtime.connect({
    name: `sidepanel-${currentWindowId}`
});

port.postMessage({
    type: "acquireLock",
    sessionId,
    windowId
});

// In background.ts
browserAPI.runtime.onConnect.addListener((port) => {
    const windowId = extractWindowId(port.name);

    port.onDisconnect.addListener(() => {
        // Automatically release all locks for this window
        sessionLockManager.releaseAllForWindow(windowId);
    });
});
```

**Pros**: Reliable cleanup on sidepanel close/crash
**Cons**: More complex than message passing

### Option 2: Heartbeat system
Locks expire if not refreshed:

```typescript
interface LockData {
    windowId: number;
    lastHeartbeat: number;
}

// Background: Clean stale locks every 5s
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, data] of locks.entries()) {
        if (now - data.lastHeartbeat > 10000) {
            locks.delete(sessionId);
        }
    }
}, 5000);

// Sidepanel: Send heartbeat every 3s
setInterval(() => {
    if (currentSessionId) {
        browserAPI.runtime.sendMessage({
            type: "heartbeat",
            sessionId: currentSessionId,
            windowId: currentWindowId,
        });
    }
}, 3000);
```

**Pros**: Automatically clears stale locks
**Cons**: Complexity, periodic message traffic, 10s delay before lock clears

### Option 3: Visibility API
Use `visibilitychange` instead of `beforeunload`:

```typescript
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && currentSessionId) {
        browserAPI.runtime.sendMessage({
            type: "releaseLock",
            sessionId: currentSessionId,
        });
    }
});
```

**Pros**: Simple
**Cons**: Still unreliable (same issues as beforeunload), fires on tab switch

### Option 4: Persistent locks in chrome.storage
Store locks in `chrome.storage.local`:

```typescript
// Store locks persistently
await chrome.storage.local.set({
    locks: JSON.stringify(Array.from(locks.entries()))
});
```

**Pros**: Survives service worker sleep
**Cons**: Async overhead, still doesn't solve cleanup problem, stale locks persist across extension reload

### Option 5: No locking at all
Remove session locking, accept that same session can be open in multiple windows:

**Pros**: Simplifies code
**Cons**: User confusion, potential data conflicts, defeats the purpose of multi-window isolation

## Questions for Implementation

1. **Which solution is most reliable for lock cleanup?**
   - Port-based seems most reliable but is it overkill?
   - Heartbeat is complex but handles all edge cases
   - Can we combine approaches?

2. **How to handle keyboard shortcut toggle?**
   - Chrome's native sidepanel API: does `sidePanel.open()` toggle or always open?
   - Should we track sidepanel state per-window?
   - Can we query Chrome for sidepanel state?

3. **What happens if background service worker sleeps?**
   - Locks are lost (in-memory only)
   - Is this acceptable? (User can reopen session)
   - Or should we persist locks?

4. **Should we add a "force unlock" mechanism?**
   - User-facing "force open" button when lock fails?
   - Auto-unlock after N minutes?
   - Manual unlock in settings?

## Files Involved

- [src/background.ts](../src/background.ts) - SessionLockManager, message handlers, windows.onRemoved
- [src/sidepanel.ts](../src/sidepanel.ts) - Lock acquisition, beforeunload handler, keyboard shortcuts
- [src/dialogs/SessionListDialog.ts](../src/dialogs/SessionListDialog.ts) - Shows lock badges
- [docs/multi-window.md](./multi-window.md) - Original design documentation

## Test Scenario for Verification

1. Open Window A, press Cmd+Shift+P, verify session loads
2. Open Window B, press Cmd+Shift+P, verify landing page (session locked)
3. Window A: Close sidepanel with X button
4. Window B: Press Cmd+Shift+P again
5. **Expected**: Session loads (lock released)
6. **Actual**: Landing page (lock still held)

Additional test:
- With sidepanel open, press Cmd+Shift+P
- **Expected**: Sidepanel closes
- **Actual**: Nothing happens

## Current Status

- Lock acquisition works correctly ✓
- Lock display in session list works ✓
- Window-scoped navigation filtering works ✓
- Lock release on beforeunload: **UNRELIABLE** ✗
- Keyboard shortcut toggle: **DOESN'T CLOSE** ✗
- Stale lock cleanup: **INSUFFICIENT** ✗
