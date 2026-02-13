import { useState, useCallback, useRef } from 'react';

const API_BASE = 'http://localhost:8130';

export interface NotepadUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  contextWindow: number;
  percent: number;
}

interface NotepadState {
  sessionId: string | null;
  conversationPath: string | null;
  isLoading: boolean;
  error: string | null;
  usage: NotepadUsage | null;
  model: string;
  messageCount: number;
}

interface UseNotepadOptions {
  workspacePath: string | null;
  onConversationReady?: (path: string, sessionId: string) => void;
}

function extractUsage(result: Record<string, unknown>): NotepadUsage | null {
  // Claude JSON output has a "usage" field at top level
  const usage = result.usage as Record<string, unknown> | undefined;
  if (!usage) return null;

  const inputTokens = (usage.input_tokens as number) || 0;
  const outputTokens = (usage.output_tokens as number) || 0;
  const cacheRead = (usage.cache_read_input_tokens as number) || 0;
  const cacheCreation = (usage.cache_creation_input_tokens as number) || 0;

  // Context window from model info or default
  const contextWindow = 200_000;
  const totalInput = inputTokens + cacheRead + cacheCreation;
  const percent = Math.min(Math.round((totalInput / contextWindow) * 100), 100);

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheCreation,
    contextWindow,
    percent,
  };
}

export function useNotepad({ workspacePath, onConversationReady }: UseNotepadOptions) {
  const [state, setState] = useState<NotepadState>({
    sessionId: null,
    conversationPath: null,
    isLoading: false,
    error: null,
    usage: null,
    model: 'haiku',
    messageCount: 0,
  });

  const abortRef = useRef<AbortController | null>(null);
  const onConversationReadyRef = useRef(onConversationReady);
  onConversationReadyRef.current = onConversationReady;

  const send = useCallback(async (message: string) => {
    if (!message.trim()) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const body: Record<string, unknown> = {
        message: message.trim(),
        model: state.model,
        cwd: workspacePath || undefined,
        maxTurns: 3,
        permissionMode: 'bypassPermissions',
      };

      if (state.sessionId) {
        body.sessionId = state.sessionId;
      }

      abortRef.current = new AbortController();

      const res = await fetch(`${API_BASE}/api/notepad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      const data = await res.json();

      if (data.error) {
        setState(prev => ({ ...prev, isLoading: false, error: data.error }));
        return;
      }

      const sessionId = data.sessionId || state.sessionId;
      const usage = data.result ? extractUsage(data.result) : null;

      setState(prev => ({
        ...prev,
        sessionId,
        isLoading: false,
        error: null,
        usage: usage || prev.usage,
        messageCount: prev.messageCount + 1,
      }));

      // Look up the JSONL path for this session
      if (sessionId && !state.conversationPath) {
        try {
          const sessionRes = await fetch(`${API_BASE}/api/claude/session/${sessionId}`);
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            const path = sessionData.ConversationPath || sessionData.conversationPath;
            if (path) {
              setState(prev => ({ ...prev, conversationPath: path }));
              onConversationReadyRef.current?.(path, sessionId);
            }
          }
        } catch {
          // Session lookup failed, not critical
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to send message',
      }));
    }
  }, [state.sessionId, state.model, state.conversationPath, workspacePath]);

  const stop = useCallback(async () => {
    abortRef.current?.abort();
    if (state.sessionId) {
      try {
        await fetch(`${API_BASE}/api/notepad?sessionId=${state.sessionId}`, {
          method: 'DELETE',
        });
      } catch {
        // Best effort
      }
    }
    setState(prev => ({ ...prev, isLoading: false }));
  }, [state.sessionId]);

  const reset = useCallback(() => {
    setState({
      sessionId: null,
      conversationPath: null,
      isLoading: false,
      error: null,
      usage: null,
      model: state.model,
      messageCount: 0,
    });
  }, [state.model]);

  const setModel = useCallback((model: string) => {
    setState(prev => ({ ...prev, model }));
  }, []);

  return {
    ...state,
    send,
    stop,
    reset,
    setModel,
  };
}
