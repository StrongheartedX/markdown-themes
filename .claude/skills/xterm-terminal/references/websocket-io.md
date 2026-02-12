# WebSocket Communication Patterns

> Adapted from TabzChrome terminal implementation

This document covers WebSocket patterns for terminal I/O between the React frontend and the Go backend, including message types, output routing, and spawn/reconnect flows. The Go backend uses its WebSocket hub (`backend/websocket/hub.go`) for connection management and creack/pty for PTY operations (`backend/handlers/terminal.go`).

## Critical Pattern: Disconnect vs Close Semantics

### The Problem

Backend WebSocket handlers often have different semantics for similar-looking message types. You must read the backend code to understand what each type does.

### Message Types

```go
// backend/handlers/terminal.go - WebSocket message handler

switch msg.Type {
case "disconnect":
    // Graceful disconnect - closes PTY connection
    // BUT keeps tmux session alive
    // Use this when navigating away or closing the tab
    ptmx.Close()

case "close":
    // DESTRUCTIVE - kills PTY AND tmux session
    // Use this only when the user explicitly closes/deletes the terminal
    ptmx.Close()
    exec.Command("tmux", "kill-session", "-t", sessionName).Run()

case "input":
    // Standard terminal input
    ptmx.Write([]byte(msg.Data))

case "resize":
    // Resize PTY dimensions via creack/pty
    pty.Setsize(ptmx, &pty.Winsize{
        Cols: uint16(msg.Cols),
        Rows: uint16(msg.Rows),
    })
}
```

**Key distinction:**
- `disconnect` = detach (session survives, can reconnect later)
- `close` = destroy (session killed permanently)

### The Fix: Use API Endpoints for Non-Destructive Operations

```typescript
// CORRECT - Use API endpoint for detach
const handleDetach = async () => {
  // Only call the API endpoint - don't send WebSocket message
  await fetch(`/api/terminal/detach/${terminal.sessionName}`, {
    method: 'POST'
  })

  // PTY disconnects naturally when client detaches
  // Tmux session stays alive

  // Clear refs and update state
  updateTerminal(id, {
    status: 'detached',
    agentId: undefined,
  })
}
```

## Backend Output Routing

### The Problem

Broadcasting terminal output to all WebSocket clients causes corruption. Escape sequences meant for one terminal appear in another.

**Symptom:** Random escape sequences like `1;2c0;276;0c` appearing in terminals.

### The Solution: Terminal Ownership Tracking

In the Go WebSocket hub, track which connection owns which terminal and route output only to owners:

```go
// backend/websocket/hub.go

type Hub struct {
    // Track which WebSocket owns which terminal
    terminalOwners map[string]map[*websocket.Conn]bool  // terminalId -> set of connections
    mu             sync.RWMutex
}

// On spawn/reconnect: register ownership
func (h *Hub) RegisterTerminal(terminalId string, conn *websocket.Conn) {
    h.mu.Lock()
    defer h.mu.Unlock()

    if h.terminalOwners[terminalId] == nil {
        h.terminalOwners[terminalId] = make(map[*websocket.Conn]bool)
    }
    h.terminalOwners[terminalId][conn] = true
}

// On output: send ONLY to owners (no broadcast!)
func (h *Hub) SendTerminalOutput(terminalId string, data []byte) {
    h.mu.RLock()
    owners := h.terminalOwners[terminalId]
    h.mu.RUnlock()

    if len(owners) == 0 {
        return
    }

    msg, _ := json.Marshal(map[string]interface{}{
        "type":       "output",
        "terminalId": terminalId,
        "data":       string(data),
    })

    for conn := range owners {
        conn.WriteMessage(websocket.TextMessage, msg)
    }
}
```

**Critical:** Never broadcast terminal output to all connections. Each terminal's output goes only to the connections that spawned or reconnected to it.

## Message Flow Patterns

### Spawn Flow

```typescript
// Frontend (src/hooks/useTerminal.ts) sends spawn request
wsRef.current.send(JSON.stringify({
  type: 'spawn',
  requestId: 'spawn-12345',  // For matching response
  terminalId: 'terminal-abc',
  config: {
    command: 'bash',
    sessionName: 'mdt-bash-abc',
    useTmux: true,
  }
}))

// Go backend spawns PTY via creack/pty and registers ownership
// Backend sends spawned confirmation
// {
//   "type": "terminal-spawned",
//   "requestId": "spawn-12345",
//   "terminalId": "terminal-abc",
//   "data": {
//     "id": "agent-xyz",
//     "sessionName": "mdt-bash-abc"
//   }
// }

// Frontend matches by requestId and updates terminal
updateTerminal('terminal-abc', {
  agentId: 'agent-xyz',
  status: 'running',
})
```

### Reconnect Flow

```typescript
// Frontend sends reconnect request
wsRef.current.send(JSON.stringify({
  type: 'reconnect',
  sessionName: 'mdt-bash-abc',  // Use existing session!
  terminalId: 'terminal-abc',
}))

// Go backend finds existing PTY and registers ownership
// Backend sends reconnected confirmation with SAME agentId
// {
//   "type": "terminal-spawned",   // Same event type as spawn!
//   "terminalId": "terminal-abc",
//   "data": {
//     "id": "agent-xyz",          // SAME agentId as before
//     "sessionName": "mdt-bash-abc"
//   }
// }

// Frontend must allow same agentId to be processed again
// This is why we clear processedAgentIds on detach!
```

### Disconnect vs Close Flow

```typescript
// DETACH (session survives):
// Option A: API endpoint (preferred)
await fetch(`/api/terminal/detach/${sessionName}`, { method: 'POST' })

// Option B: WebSocket message
wsRef.current.send(JSON.stringify({
  type: 'disconnect',
  terminalId: 'terminal-abc',
}))
// Result: PTY closed, tmux session alive, can reconnect later

// DESTROY (session killed):
wsRef.current.send(JSON.stringify({
  type: 'close',
  terminalId: 'terminal-abc',
}))
// Result: PTY closed AND tmux session killed permanently
```

## Connection Lifecycle

### WebSocket Connection Setup

```typescript
// src/hooks/useTerminal.ts

const connectWebSocket = () => {
  const ws = new WebSocket(`ws://localhost:8130/ws/terminal`)

  ws.onopen = () => {
    console.log('[Terminal WS] Connected')
    // Re-register any existing terminals after reconnect
    terminals.forEach(t => {
      if (t.sessionName && t.status === 'running') {
        ws.send(JSON.stringify({
          type: 'reconnect',
          terminalId: t.id,
          sessionName: t.sessionName,
        }))
      }
    })
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)

    switch (msg.type) {
      case 'output':
        // Route to correct terminal's xterm instance
        handleTerminalOutput(msg.terminalId, msg.data)
        break

      case 'terminal-spawned':
        // Update terminal state
        handleTerminalSpawned(msg)
        break

      case 'terminal-exited':
        // Terminal process exited
        handleTerminalExited(msg.terminalId, msg.exitCode)
        break
    }
  }

  ws.onclose = () => {
    console.log('[Terminal WS] Disconnected, reconnecting...')
    setTimeout(connectWebSocket, 2000)
  }

  wsRef.current = ws
}
```

### Cleanup on Unmount

```typescript
// When component unmounts, disconnect (don't close/destroy)
useEffect(() => {
  return () => {
    // Send disconnect for all active terminals
    terminals.forEach(t => {
      if (t.status === 'running' && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'disconnect',
          terminalId: t.id,
        }))
      }
    })
    wsRef.current?.close()
  }
}, [])
```

## Debugging WebSocket Issues

### Common Issues and Solutions

**Issue:** Escape sequences in wrong terminal
- Check: Is backend using `terminalOwners` routing instead of broadcast?
- Check: Is frontend filtering output by terminalId?

**Issue:** Terminal output stops after navigation
- Check: Is backend cleaning up dead connections from owner maps?
- Check: Is periodic cleanup running to remove closed connections?

**Issue:** Detach kills tmux session
- Check: Are you sending WebSocket 'close' message when you meant 'disconnect'?
- Fix: Use API endpoint for detach, or send 'disconnect' (not 'close')

**Issue:** Reconnect doesn't work
- Check: Is processedAgentIds cleared on detach?
- Check: Is Go backend returning same agentId for the session?
- Check: Is frontend allowing same agentId to be processed?

**Issue:** Output appears garbled after reconnect
- Check: Is output guard active during reconnection? (see resize-handling.md Pattern 4)
- Check: Is resize trick running after guard lifts?
