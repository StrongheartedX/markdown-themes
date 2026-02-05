# AI Chat Integration Research

> Research document for implementing AI chat in markdown-themes, based on personal-homepage's AI Workspace implementation.

## Overview

The **personal-homepage** project implements a sophisticated AI chat workspace with:
- SSE streaming from Claude CLI
- tmux-based process persistence (survives browser disconnection)
- Session resumption via `claude -p` pattern
- Multi-backend support (Claude, Gemini, Codex, Docker)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                             │
├─────────────────────────────────────────────────────────────────┤
│  useAIChat Hook                    Components                    │
│  ├─ Conversations state            ├─ ChatMessage               │
│  ├─ SSE stream parsing             ├─ ChatInput                 │
│  ├─ Process recovery               ├─ Conversation              │
│  └─ Cross-tab sync                 └─ AIDrawer                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                    HTTP + SSE Streams
                           │
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Next.js API)                         │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/ai/chat          GET /api/ai/process                 │
│  ├─ Spawns Claude in tmux   ├─ Check tmux window status         │
│  ├─ Returns SSE stream      └─ Kill running process             │
│  └─ Multi-backend routing                                        │
│                             GET /api/ai/process/output           │
│  GET /api/ai/conversations  └─ Recover output from tmux         │
│  └─ JSONL storage                                                │
└─────────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  localStorage (Client)              tmux Session                 │
│  ├─ conversations                   ├─ Session: ai-workspace    │
│  ├─ settings                        ├─ 1 window per conversation │
│  └─ generating state                └─ Output: /tmp/ai-workspace/│
│                                                                   │
│  JSONL Files (Server)                                            │
│  └─ .conversations/{convId}.jsonl                                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. useAIChat Hook

**Location**: `hooks/useAIChat.ts`

**Purpose**: Core chat logic and state management

**Key Functions**:
```typescript
sendMessage(content, options?)
  ├─ Prevents duplicate submissions (in-flight tracking)
  ├─ Formats system prompt + message history
  ├─ Sends POST to /api/ai/chat with SSE response
  ├─ Parses SSE chunks into Message objects
  ├─ Handles tool_start/tool_end events
  └─ Stores in localStorage + JSONL (server-side)

recoverOutput(conversationId)
  ├─ Fetches /api/ai/process/output
  ├─ Parses Claude stream-json format
  └─ Adds recovered message with flag

checkForRunningProcess()
  ├─ On mount, checks /api/ai/process status
  ├─ Detects stale tmux sessions
  ├─ Polls until completion or timeout (5 min)
  └─ Auto-recovers output when done
```

### 2. Chat API Endpoint

**Location**: `app/api/ai/chat/route.ts`

**Request**:
```typescript
{
  messages: ChatMessage[],
  backend: 'claude' | 'gemini' | 'codex' | 'docker',
  model?: string,
  conversationId?: string,
  settings: ChatSettings,
  cwd?: string,              // Working directory
  claudeSessionId?: string   // Resume session
}
```

**Response**: Server-Sent Events (SSE)
```javascript
// Streaming chunk
data: {"content": "text...", "done": false, "model": "claude"}

// Completion
data: {"done": true, "usage": {...}, "claudeSessionId": "session_..."}
```

### 3. Claude Integration

**Location**: `lib/ai/claude.ts`

**CLI Spawning**:
```bash
claude \
  --model claude-sonnet-4-20250514 \
  --output-format stream-json \
  --print-system-prompt \
  -p "user message here"
```

**Output Format**: stream-json events
- `type: 'message'` - Full assistant message
- `type: 'content_block_delta'` - Text streaming
- `type: 'content_block_start'` - Tool use start
- `type: 'message_stop'` - End with usage stats

**Session Resumption**:
- Session ID returned in stream events
- Pass back via `claudeSessionId` for multi-turn conversations
- Claude CLI loads session from `~/.claude/projects/{cwd}/{sessionId}.jsonl`

### 4. tmux Process Management

**Location**: `lib/ai/tmux-manager.ts`

**Session Setup**:
- Session name: `ai-workspace`
- Each conversation = new tmux window
- Output redirected to `/tmp/ai-workspace/{convId}.out`

**Process Lifecycle**:
```
1. sendMessage() → /api/ai/chat
2. streamClaude() → spawnInWindow()
3. tmux creates window, runs: claude ... > /tmp/.../convId.out
4. Browser reads SSE stream
5. User closes browser → process continues in tmux
6. User returns → checkForRunningProcess()
7. Poll until done → recoverOutput()
8. Parsed output added with "recovered" flag
```

### 5. Disconnection Recovery Flow

```
SCENARIO: User closes browser while Claude is streaming

T0: sendMessage() spawns tmux window, SSE stream opens
T1: Browser receives chunks, updates UI
T2: User closes browser
    └─ SSE connection breaks
    └─ tmux process CONTINUES in background

T3: User reopens app
    └─ checkForRunningProcess() fires
    └─ GET /api/ai/process?conversationId=xxx
    └─ Returns { hasProcess: true, running: true }
    └─ Polls every 1s until done

T4: tmux process finishes
    └─ Output in /tmp/ai-workspace/conv_....out
    └─ recoverOutput() fetches and parses
    └─ Message shown with "recovered" badge
```

## UI Components

### ChatMessage
- Markdown rendering with code blocks
- Tool use display (collapsible, auto-collapse after 4s)
- Action buttons: copy, regenerate, feedback
- Model badge with colors
- Recovery indicator

### ChatInput
- Auto-resizing textarea
- Send/Stop buttons
- Shift+Enter for newlines
- Disabled during streaming

### Conversation
- Message list with animations
- Typing indicator during generation
- Empty state with quick actions
- Auto-scroll to bottom

### AIDrawer
- Collapsible sidebar
- States: collapsed, minimized, expanded
- Width presets: narrow (360px), default (480px), wide (640px)
- Conversation list with search
- Settings panel

## State Management

### localStorage Keys
```typescript
"ai-workspace-conversations"    // Conversation[]
"ai-workspace-settings"         // ChatSettings
"ai-workspace-generating"       // Cross-tab sync
"ai-drawer-state"              // UI state
```

### Cross-Tab Synchronization
Uses `StorageEvent` to sync generating state across browser tabs.

## Key Patterns

### 1. Preventing Duplicate Messages
```typescript
const inFlightMessageIdsRef = useRef<Set<string>>(new Set())

const convInFlightKey = `conv:${activeConvId}`
if (inFlightMessageIdsRef.current.has(convInFlightKey)) {
  return // Already sending
}
inFlightMessageIdsRef.current.add(convInFlightKey)
```

### 2. Claude Event Markers
Tool usage embedded in response text:
```
Text content...
__CLAUDE_EVENT__{"type":"tool_start","tool":{"name":"read_file"}}__END_EVENT__
More text...
__CLAUDE_EVENT__{"type":"tool_end","tool":{"id":"t_123"}}__END_EVENT__
```

### 3. SSE Headers
```typescript
new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  }
})
```

## Key Files in personal-homepage

| File | Purpose |
|------|---------|
| `hooks/useAIChat.ts` | Core chat logic, state, streaming |
| `app/api/ai/chat/route.ts` | Chat API with SSE |
| `app/api/ai/process/route.ts` | Process status/kill |
| `app/api/ai/process/output/route.ts` | Recover output |
| `lib/ai/claude.ts` | Claude CLI integration |
| `lib/ai/tmux-manager.ts` | tmux session management |
| `components/ai/ChatMessage.tsx` | Message rendering |
| `components/ai/ChatInput.tsx` | Input textarea |
| `components/ai/Conversation.tsx` | Message list |
| `components/ai/AIDrawer.tsx` | Sidebar drawer |
| `components/ai/AIDrawerProvider.tsx` | Context provider |

## Implementation Plan for markdown-themes

### Phase 1: Backend (Go)

1. **Add chat endpoint** (`POST /api/chat`)
   - Accept messages array, conversation ID, settings
   - Spawn Claude CLI process
   - Return SSE stream

2. **Add process management**
   - `GET /api/chat/process` - Check status
   - `DELETE /api/chat/process` - Kill process
   - `GET /api/chat/process/output` - Recover output

3. **tmux integration**
   - Create `ai-workspace` session
   - Spawn conversations as windows
   - Capture output to files

### Phase 2: Frontend (React)

1. **Create useAIChat hook**
   - Conversation state management
   - SSE streaming
   - Process recovery on mount

2. **Build chat components**
   - ChatMessage with markdown
   - ChatInput with auto-resize
   - Conversation list
   - Chat drawer/panel

3. **Integration with Files page**
   - Chat panel in sidebar or drawer
   - Context from current file
   - Follow AI edits integration

### Phase 3: Enhancements

1. Tool use display (read_file, edit, etc.)
2. Session resumption UI
3. Multiple conversations
4. Export conversations

## Questions to Resolve

1. **Where should chat UI live?**
   - Sidebar panel (like AIDrawer)?
   - Bottom drawer?
   - Separate page?

2. **Context integration**
   - Send current file as context?
   - Include file tree?
   - Project-specific system prompts?

3. **tmux vs direct process**
   - tmux provides recovery but adds complexity
   - Could start simpler with direct process

4. **Backend language**
   - Go backend already exists
   - Could add chat endpoints there
   - Or separate Node/Next.js service?

## Dependencies

From personal-homepage:
```json
{
  "framer-motion": "^12.23.24",     // Animations
  "@radix-ui/*": "latest",          // UI components
  "sonner": "^2.0.7"                // Toast notifications
}
```

markdown-themes already has:
- React 19
- Tailwind v4
- Streamdown (markdown)
- Shiki (code highlighting)
