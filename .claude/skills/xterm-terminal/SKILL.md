# xterm-terminal

xterm.js terminal patterns for the markdown-themes-terminal project. Covers Unicode/emoji rendering, resize coordination with PTY processes, write queue management, and WebSocket I/O between the React frontend and Go backend.

## References

- [xterm-patterns.md](references/xterm-patterns.md) - Emoji/Unicode width fix (Unicode11 addon), mouse coordinate transformation for CSS zoom, tmux session reconnection best practices
- [resize-handling.md](references/resize-handling.md) - Output quiet period, two-step resize trick, write queue management, output guard on reconnection, deferred timeout tracking, debugging checklist
- [websocket-io.md](references/websocket-io.md) - WebSocket message types (disconnect vs close semantics), output routing by terminal ownership, spawn/reconnect message flows

## Trigger

Activate this skill when working on:

- `src/components/Terminal.tsx` - xterm.js terminal component
- `src/components/TerminalPanel.tsx` - Terminal panel container/layout
- `src/hooks/useTerminal.ts` - Terminal state and WebSocket hook
- `backend/handlers/terminal.go` - Go backend terminal handler (creack/pty, WebSocket hub)
- `backend/websocket/` - WebSocket hub and terminal message routing
