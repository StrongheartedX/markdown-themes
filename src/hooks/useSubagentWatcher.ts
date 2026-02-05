import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createWebSocket,
  clearAuthToken,
  type SubagentStartMessage,
  type SubagentEndMessage,
} from '../lib/api';

export interface ActiveSubagent {
  sessionId: string;
  workingDir: string;
  pane: string;
  conversationPath: string;
  taskDescription?: string;
  startTime: number;
}

interface UseSubagentWatcherOptions {
  /** Enable/disable subagent watching */
  enabled: boolean;
  /** Callback when a subagent starts */
  onSubagentStart?: (subagent: ActiveSubagent) => void;
  /** Callback when a subagent ends */
  onSubagentEnd?: (sessionId: string) => void;
}

interface UseSubagentWatcherResult {
  /** Currently active subagents */
  activeSubagents: ActiveSubagent[];
  /** WebSocket connection status */
  connected: boolean;
  /** Total count of active subagents */
  count: number;
}

type SubagentMessage = SubagentStartMessage | SubagentEndMessage;

/**
 * Construct the conversation file path from session info.
 * Claude Code stores conversations at ~/.claude/projects/{projectHash}/conversations/{sessionId}.jsonl
 */
function buildConversationPath(workingDir: string, sessionId: string): string {
  // The workingDir is the project directory, but we need the ~/.claude/projects/{hash} path
  // For now, we'll use a pattern that matches the standard Claude Code layout
  const home = workingDir.match(/^(\/home\/[^/]+)/)?.[1] || '/home';

  // Claude Code uses a hash of the project path for the directory name
  // We'll need to match the actual path structure
  // Format: ~/.claude/projects/{projectDir}/conversations/{sessionId}.jsonl
  // The projectDir is typically the base64-encoded or hashed project path

  // For now, return a path that the user can configure or that matches common patterns
  return `${home}/.claude/projects/${encodeProjectPath(workingDir)}/conversations/${sessionId}.jsonl`;
}

/**
 * Encode project path to match Claude Code's directory naming.
 * Claude uses the project path with slashes replaced by dashes.
 */
function encodeProjectPath(projectPath: string): string {
  // Remove leading slash and replace remaining slashes with dashes
  // e.g., /home/user/projects/myapp -> home-user-projects-myapp
  return projectPath.replace(/^\//, '').replace(/\//g, '-');
}

/**
 * Hook to monitor Claude Code subagent lifecycle events.
 *
 * Subscribes to WebSocket messages for subagent-start and subagent-end events,
 * tracking active subagents and their conversation file paths.
 *
 * @example
 * ```tsx
 * const { activeSubagents, count, connected } = useSubagentWatcher({
 *   enabled: true,
 *   onSubagentStart: (subagent) => {
 *     // Auto-open the conversation in a new tab
 *     openTab(subagent.conversationPath, { preview: true });
 *   },
 *   onSubagentEnd: (sessionId) => {
 *     // Optionally close the tab
 *   },
 * });
 * ```
 */
export function useSubagentWatcher({
  enabled,
  onSubagentStart,
  onSubagentEnd,
}: UseSubagentWatcherOptions): UseSubagentWatcherResult {
  const [activeSubagents, setActiveSubagents] = useState<ActiveSubagent[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxReconnectAttempts = 5;
  const mountedRef = useRef(true);

  // Use refs for callbacks to avoid re-connecting when callbacks change
  const onSubagentStartRef = useRef(onSubagentStart);
  onSubagentStartRef.current = onSubagentStart;
  const onSubagentEndRef = useRef(onSubagentEnd);
  onSubagentEndRef.current = onSubagentEnd;

  // Subscribe to subagent watching
  const subscribe = useCallback((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subagent-watch', enabled: true }));
    }
  }, []);

  // Unsubscribe from subagent watching
  const unsubscribe = useCallback((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subagent-watch', enabled: false }));
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    if (!mountedRef.current) return;

    try {
      const message = JSON.parse(event.data) as SubagentMessage;

      if (message.type === 'subagent-start') {
        const conversationPath = buildConversationPath(message.workingDir, message.sessionId);

        const newSubagent: ActiveSubagent = {
          sessionId: message.sessionId,
          workingDir: message.workingDir,
          pane: message.pane,
          conversationPath,
          taskDescription: message.taskDescription,
          startTime: Date.now(),
        };

        setActiveSubagents((prev) => {
          // Avoid duplicates
          if (prev.some((s) => s.sessionId === message.sessionId)) {
            return prev;
          }
          return [...prev, newSubagent];
        });

        // Notify callback
        onSubagentStartRef.current?.(newSubagent);
      }

      if (message.type === 'subagent-end') {
        setActiveSubagents((prev) =>
          prev.filter((s) => s.sessionId !== message.sessionId)
        );

        // Notify callback
        onSubagentEndRef.current?.(message.sessionId);
      }
    } catch {
      // Ignore parse errors for non-subagent messages
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      subscribe(wsRef.current);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      const ws = await createWebSocket();
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }

        setConnected(true);
        reconnectAttemptRef.current = 0;
        subscribe(ws);
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (!mountedRef.current) return;

        wsRef.current = null;
        setConnected(false);

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current++;

          setTimeout(() => {
            if (mountedRef.current && enabled) {
              connect();
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        clearAuthToken();
      };
    } catch {
      if (!mountedRef.current) return;

      setConnected(false);
      clearAuthToken();

      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
        reconnectAttemptRef.current++;

        setTimeout(() => {
          if (mountedRef.current && enabled) {
            connect();
          }
        }, delay);
      }
    }
  }, [enabled, handleMessage, subscribe]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        unsubscribe(wsRef.current);
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, [unsubscribe]);

  // Effect: Handle enabled state changes
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      // Disabled, unsubscribe but don't disconnect (may share connection)
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        unsubscribe(wsRef.current);
      }
      return;
    }

    // Enabled, connect and subscribe
    reconnectAttemptRef.current = 0;
    connect();

    return () => {
      // Cleanup handled by unmount effect
    };
  }, [enabled, connect, unsubscribe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    activeSubagents,
    connected,
    count: activeSubagents.length,
  };
}
