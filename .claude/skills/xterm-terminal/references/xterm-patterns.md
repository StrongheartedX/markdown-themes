# Advanced xterm.js Patterns

> Adapted from TabzChrome terminal implementation

This document covers advanced patterns for complex xterm.js implementations, including emoji width fixes, mouse coordinate transformation, and tmux reconnection best practices.

## Emoji & Unicode Width Fix (Unicode11 Addon)

**Date:** Pre-October 2025
**Time to Solution:** 2 days of debugging
**Actual Solution:** 1 line of code
**GitHub Gist:** https://gist.github.com/GGPrompts/61392f3e2a8cb15865d245490ac7b3db

### The Problem

When displaying emojis or wide Unicode characters in xterm.js terminals:

```
Expected:
+---------------+
| folder        |
| file.txt      |
+---------------+

Actual:
+---------------+
| folder    | <- Emoji width miscalculated
| file.txt  | <- Box characters misaligned
+----------   | <- Bottom border broken
```

**Symptoms:**
- Box drawing characters misaligned
- Text after emojis positioned incorrectly
- Table layouts broken
- TUI apps (Bubbletea) rendering garbled
- Double-width characters taking single width (or vice versa)

**Root Cause:**
xterm.js uses simplified Unicode width calculation by default. It doesn't properly handle:
- Emojis (should be width 2)
- Combining characters
- Zero-width joiners
- Unicode 11+ characters

### The Solution

**Install the Unicode11 addon:**

```typescript
// In src/components/Terminal.tsx
import { Terminal } from 'xterm';
import { Unicode11Addon } from 'xterm-addon-unicode11';  // <- Add this

// When creating the terminal:
xtermRef.current = new Terminal({
  // ... your options
});

// Load the Unicode11 addon:
const unicode11Addon = new Unicode11Addon();
xtermRef.current.loadAddon(unicode11Addon);
xtermRef.current.unicode.activeVersion = '11';  // <- This is the magic line

// Now emojis work perfectly!
```

**Install the package:**
```bash
npm install xterm-addon-unicode11
```

**That's it.** 2 days of debugging, 1 line to fix.

### Why This Was Hard to Find

**Debugging attempts that didn't work:**
- Adjusting terminal cols/rows
- Changing font sizes
- Different fonts (NerdFonts, etc.)
- CSS width adjustments
- Examining xterm.js source code
- Manual character width calculations
- Asking LLMs (not in training data!)

**What finally worked:**
- Web search: "xterm.js emoji width broken"
- Found: Unicode11Addon in xterm.js documentation
- One line of code, instant fix

### When You Need This

**If you're building terminal apps with xterm.js and using:**
- Emojis in output
- TUI apps (Bubbletea, blessed, etc.)
- Box drawing characters
- Table layouts with Unicode
- Progress bars with Unicode block characters
- Non-English text (CJK characters)

**You NEED the Unicode11 addon.**

### Full Working Example

```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Unicode11Addon } from 'xterm-addon-unicode11';  // <- Critical

const terminal = new Terminal({
  fontFamily: 'JetBrains Mono Nerd Font, monospace',
  fontSize: 14,
  theme: {
    background: '#1a1a1a',
    foreground: '#ffffff',
  },
});

// Load Unicode11 addon
const unicode11 = new Unicode11Addon();
terminal.loadAddon(unicode11);
terminal.unicode.activeVersion = '11';  // <- The magic line

// Load fit addon
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

// Now emojis work!
terminal.write('\u{1F4C1} Projects\r\n');
terminal.write('\u{1F4C4} README.md\r\n');
terminal.write('\u{2705} All formatting perfect!\r\n');
```

### Impact

**Before:**
- TUI apps looked broken
- Had to avoid emojis entirely
- Box art wouldn't work
- Reduced aesthetic options

**After:**
- Perfect emoji rendering
- Beautiful TUI apps
- Box characters work perfectly
- Can use full Unicode range

**This fix unlocks:**
- Building beautiful TUI tools
- Using emojis in terminal output
- Proper rendering of Bubbletea apps
- Professional-looking terminal interfaces

---

## Mouse Coordinate Transformation for CSS Zoom

**Relevance:** If implementing canvas-based terminal layouts with zoom features

### The Problem

xterm.js doesn't support CSS `transform: scale()` on parent elements. Mouse clicks register incorrectly when canvas is zoomed.

**Symptom:** Click at position (100, 100) on screen, xterm receives click at (50, 50) when zoomed to 50%.

### The Solution

**Critical Discovery:**
```typescript
// The correct formula that accounts for BOTH browser zoom AND canvas zoom:
const visualToLayoutRatio = rect.width / offsetWidth
const layoutX = visualX / visualToLayoutRatio
const layoutY = visualY / visualToLayoutRatio
```

**Why This Works:**
- `offsetWidth` = layout size (accounts for browser zoom)
- `rect.width` = visual size (accounts for both browser + canvas zoom)
- Ratio gives exact visual scaling factor

### Implementation Pattern

```typescript
// Track processed events to prevent infinite recursion
const processedEvents = new WeakSet<Event>()

const mouseTransformHandler = (e: MouseEvent) => {
  // Prevent infinite recursion
  if (processedEvents.has(e)) return
  processedEvents.add(e)

  const rect = terminalRef.current.getBoundingClientRect()
  const ratio = rect.width / terminalRef.current.offsetWidth

  // Only transform if zoom != 100%
  if (Math.abs(ratio - 1) > 0.01) {
    e.stopImmediatePropagation()

    const visualX = e.clientX - rect.left
    const visualY = e.clientY - rect.top
    const layoutX = visualX / ratio
    const layoutY = visualY / ratio

    // Create transformed event
    const transformedEvent = new MouseEvent(e.type, {
      clientX: rect.left + layoutX,
      clientY: rect.top + layoutY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      bubbles: true,
      cancelable: true,
      view: window
    })

    processedEvents.add(transformedEvent)

    // Dispatch to xterm viewport (not wrapper!)
    const xtermViewport = terminalRef.current.querySelector('.xterm-viewport')
    xtermViewport?.dispatchEvent(transformedEvent)
  }
}

// Register in CAPTURE phase to intercept before xterm
const mouseEventTypes = ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel']
mouseEventTypes.forEach(type => {
  terminalRef.current.addEventListener(type, mouseTransformHandler, { capture: true })
})

// Cleanup
return () => {
  mouseEventTypes.forEach(type => {
    terminalRef.current?.removeEventListener(type, mouseTransformHandler, { capture: true })
  })
}
```

### Critical Bug to Avoid

**WRONG - Breaks text selection:**
```typescript
// This check is too broad!
if (e.type === 'mousemove' && e.buttons > 0) {
  return // Skips transformation, thinking it's terminal dragging
}
```

**Why This Breaks:**
- xterm.js text selection uses `mousemove` + `buttons > 0`
- This check incorrectly assumes ALL mousemove with buttons = terminal window dragging
- Text selection gets untransformed coordinates -> offset by ~180-200px

**CORRECT - Only skip when actually dragging terminal window:**
```typescript
// Check for dragging class set by react-draggable
const terminalWrapper = terminalRef.current.closest('.draggable-terminal-wrapper')
if (terminalWrapper && terminalWrapper.classList.contains('dragging')) {
  return // React-draggable sets this class only when dragging header
}
```

### When to Use This

**Applicable only if:**
- Implementing infinite canvas terminal layout
- Users can zoom in/out with mouse wheel
- Terminals need to respond to mouse clicks while zoomed
- Using CSS `transform: scale()` for zoom

**Not needed for:**
- Tab-based terminal layouts (no zoom)
- Fixed-size terminal windows
- Terminal apps without canvas zoom

---

## Architectural Decision: Canvas Zoom vs. Tab-Based Layouts

**Decision:** Avoid canvas zoom unless it's a core feature requirement

### The Mouse Wheel Conflict Problem

**Issue:** Canvas zoom competes with terminal scroll behavior.

When users scroll with mouse wheel over a terminal:
1. **xterm.js** wants to scroll terminal buffer
2. **tmux** wants to enter copy mode on scroll
3. **Canvas zoom** wants to zoom the workspace

**All three fight for the same input!**

**Middle-click (mouse wheel button) also conflicts:**

With `set -g mouse on` in tmux:
- **Standard behavior:** Middle-click pastes from X11 primary selection (Linux/Unix)
- **With tmux mouse mode:** Middle-click intercepted by tmux, may show coordinates instead of pasting
- **Users expect:** Standard paste behavior

**Workarounds required:**
- Hold Shift while middle-clicking to bypass tmux
- Add explicit tmux binding: `bind -n MouseDown2Pane run "tmux set-buffer..."`
- Toggle mouse mode off when you need to paste

**Result:** Even clicking the mouse wheel is problematic with tmux!

### Recommendation for markdown-themes-terminal

Use tab-based terminal layout. No canvas zoom = no conflict.

```typescript
// No Alt key checks needed
// No conditional event propagation
// Mouse wheel just works naturally:
// - Scroll in terminal -> terminal scrolls
// - Scroll in browser -> page scrolls
// - No modifier keys needed
```

**Result:**
- Browser-native tab behavior (no custom zoom)
- Split panes for spatial organization
- Zero mouse wheel conflicts

### When Canvas Zoom is Worth the Complexity

**Use canvas zoom if:**
- Infinite workspace is CORE feature (diagram tools, whiteboards)
- Users need true 2D spatial organization
- Zoom level is essential to workflow
- Willing to maintain ~300 lines of mouse event handling

**Avoid canvas zoom if:**
- Tab-based layout solves the use case
- Users don't need spatial relationships
- Mouse wheel conflicts would hurt UX
- Simpler architecture is preferred

---

## Tmux Session Reconnection Best Practices

**Relevance:** HIGH - Immediately applicable to tmux-based terminal persistence

### The Problem

Auto-reconnection was too greedy - reconnected to ANY tmux session matching terminal names, including external sessions.

**Symptoms:**
- Reconnects to user's personal tmux sessions
- Collisions between app sessions and external sessions
- Unexpected terminal content after refresh
- Can't use same session names for multiple apps

### Root Causes

1. Used `terminal.name` as fallback for session identification (too generic)
2. No ownership check - reconnected to all sessions
3. Session name collisions between app sessions and external sessions

**Example Collision:**
```typescript
// App terminal named "claude-code"
const terminal = { name: "claude-code" }

// User also has personal tmux session named "claude-code"
// App reconnects to user's personal session instead of creating new one!
```

### The Solution

**Use explicit session identifiers only:**

```typescript
// BEFORE (too greedy):
const sessionIdentifier = terminal.sessionId || terminal.sessionName || terminal.name
// Falls back to generic name - causes collisions!

// AFTER (explicit only):
const sessionIdentifier = terminal.sessionId || terminal.sessionName
if (!sessionIdentifier) {
  console.log('[Reconnect] Skipping - no explicit session identifier')
  continue
}
```

**Key Principle:** Only reconnect to sessions that were explicitly created by the app.

### Auto-Reconnection Toggle

Add user control for mixed workflows:

```typescript
// In settings store:
interface SettingsStore {
  autoReconnectToTmuxSessions: boolean  // Default: true
}

// In reconnection logic:
const autoReconnectEnabled = useSettingsStore.getState().autoReconnectToTmuxSessions
if (!autoReconnectEnabled) {
  console.log('[Reconnect] Auto-reconnect disabled in settings')
  return
}
```

**Use Cases:**
- Default ON: Most users want automatic reconnection
- Toggle OFF: Power users who manually manage tmux sessions
- Mixed workflow: Some terminals auto-reconnect, others don't

### Session Naming Best Practices

**Use unique prefixes:**
```typescript
// GOOD - Unique per app
const sessionName = `mdt-bash-${uniqueId}`  // e.g., "mdt-bash-abc123"
const sessionName = `mdt-claude-${uniqueId}`

// BAD - Generic names (collision risk)
const sessionName = 'claude-code'
const sessionName = 'bash'
const sessionName = 'terminal-1'
```

**Separate app sessions from external sessions:**
```typescript
// Check session prefix before reconnecting
const isAppSession = sessionName.startsWith('mdt-')

if (!isAppSession) {
  console.log('[Reconnect] Skipping external session:', sessionName)
  continue
}
```

### Session Cleanup

**Clean up stale references:**
```typescript
// On reconnection, verify session exists
const existingSessions = await getTmuxSessions()
const sessionExists = existingSessions.some(s => s.name === terminal.sessionName)

if (!sessionExists) {
  console.log('[Reconnect] Session no longer exists:', terminal.sessionName)
  updateTerminal(terminal.id, {
    sessionName: undefined,
    status: 'error'
  })
  continue
}
```

**Periodic cleanup:**
```typescript
// Clean up terminals referencing dead sessions (every 30 seconds)
setInterval(async () => {
  const existingSessions = await getTmuxSessions()
  const sessionNames = new Set(existingSessions.map(s => s.name))

  terminals.forEach(terminal => {
    if (terminal.sessionName && !sessionNames.has(terminal.sessionName)) {
      console.log('[Cleanup] Removing reference to dead session:', terminal.sessionName)
      updateTerminal(terminal.id, {
        sessionName: undefined,
        agentId: undefined,
        status: 'detached'
      })
    }
  })
}, 30000)
```

### Future Enhancement Ideas

**Session tagging with environment variables:**
```bash
# On spawn, tag session as managed
tmux set-environment -t session-name MANAGED_BY markdown-themes-terminal
tmux set-environment -t session-name APP_VERSION 1.0.0

# On reconnect, verify ownership
if tmux show-environment -t session-name MANAGED_BY | grep -q "markdown-themes-terminal"; then
  # Safe to reconnect
fi
```

**Session health check:**
```typescript
// Before reconnecting, verify session is responsive
const isHealthy = await checkSessionHealth(sessionName)
if (!isHealthy) {
  console.log('[Reconnect] Session unhealthy, skipping:', sessionName)
  continue
}

async function checkSessionHealth(sessionName: string): Promise<boolean> {
  try {
    // Check if pane is responsive
    const result = await execSync(`tmux display-message -t ${sessionName} -p "#{pane_id}"`)
    return result.toString().trim().startsWith('%')
  } catch {
    return false
  }
}
```

### Testing Checklist

When implementing tmux reconnection:

- [ ] Spawn terminal with unique session name
- [ ] Verify session created in `tmux ls`
- [ ] Refresh page
- [ ] Verify reconnects to correct session
- [ ] Create external tmux session with similar name
- [ ] Refresh page
- [ ] Verify does NOT reconnect to external session
- [ ] Toggle auto-reconnect OFF in settings
- [ ] Refresh page
- [ ] Verify does NOT auto-reconnect
- [ ] Toggle auto-reconnect ON
- [ ] Verify reconnects again

### Common Issues

**Issue:** Reconnects to wrong session
- Check: Is sessionId/sessionName unique?
- Check: Are you using name fallback?
- Fix: Only use explicit identifiers

**Issue:** Can't use same terminal name in multiple apps
- Check: Are session names prefixed with app name?
- Fix: Use `appname-terminaltype-uniqueid` pattern

**Issue:** Reconnects to user's personal tmux sessions
- Check: Is prefix filtering implemented?
- Fix: Only reconnect to sessions with app prefix

---

## References

### Emoji Width Fix
- xterm.js Unicode11 Addon: https://github.com/xtermjs/xterm.js/tree/master/addons/xterm-addon-unicode11
- xterm.js Addons: https://xtermjs.org/docs/guides/using-addons/
- Unicode Width Issues: https://github.com/xtermjs/xterm.js/issues/2450

### Mouse Coordinate Transformation
- Only needed for canvas-zoom layouts (not recommended for markdown-themes-terminal)

### Tmux Reconnection
- Applicable to Go backend session management via creack/pty

---

## Files to Reference

**markdown-themes-terminal:**
- `src/components/Terminal.tsx` - Unicode11 addon usage, xterm.js setup
- `src/hooks/useTerminal.ts` - Terminal state, WebSocket communication
- `backend/handlers/terminal.go` - PTY management via creack/pty
- `backend/websocket/hub.go` - WebSocket connection management
