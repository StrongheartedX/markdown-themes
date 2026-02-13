import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, RotateCcw, ChevronDown, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { useNotepad } from '../hooks/useNotepad';

interface NotepadPanelProps {
  workspacePath: string | null;
  /** Called when a conversation JSONL is ready to view */
  onOpenConversation: (path: string, sessionId: string) => void;
}

const MODEL_OPTIONS = [
  { value: 'haiku', label: 'Haiku' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
];

export function NotepadPanel({ workspacePath, onOpenConversation }: NotepadPanelProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const {
    sessionId,
    conversationPath,
    isLoading,
    error,
    usage,
    model,
    messageCount,
    send,
    stop,
    reset,
    setModel,
  } = useNotepad({
    workspacePath,
    onConversationReady: onOpenConversation,
  });

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-open conversation in viewer when sending subsequent messages
  useEffect(() => {
    if (conversationPath && sessionId && messageCount > 1) {
      onOpenConversation(conversationPath, sessionId);
    }
  }, [messageCount, conversationPath, sessionId, onOpenConversation]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    const message = input.trim();
    setInput('');
    send(message);
  }, [input, isLoading, send]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleNewSession = useCallback(() => {
    reset();
    setInput('');
    inputRef.current?.focus();
  }, [reset]);

  // Context usage bar color
  const getUsageColor = (percent: number) => {
    if (percent >= 90) return '#e74c3c';
    if (percent >= 70) return '#e67e22';
    if (percent >= 50) return '#f39c12';
    return '#27ae60';
  };

  return (
    <div className="notepad-panel">
      {/* Top edge — torn paper look + status bar */}
      <div className="notepad-header">
        <div className="notepad-torn-edge" />
        <div className="notepad-status-bar">
          {/* Left: session info */}
          <div className="notepad-status-left">
            <BookOpen size={14} />
            <span className="notepad-title">
              {sessionId ? `Session ${messageCount} msg${messageCount !== 1 ? 's' : ''}` : 'New Notepad'}
            </span>
          </div>

          {/* Center: usage indicator */}
          {usage && (
            <div className="notepad-usage" title={`${usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens} input tokens / ${usage.contextWindow} context window`}>
              <div className="notepad-usage-bar">
                <div
                  className="notepad-usage-fill"
                  style={{
                    width: `${usage.percent}%`,
                    backgroundColor: getUsageColor(usage.percent),
                  }}
                />
              </div>
              <span className="notepad-usage-text">{usage.percent}%</span>
            </div>
          )}

          {/* Right: model picker + actions */}
          <div className="notepad-status-right">
            <div className="notepad-model-picker">
              <button
                className="notepad-model-btn"
                onClick={() => setShowModelPicker(!showModelPicker)}
                disabled={isLoading}
              >
                {MODEL_OPTIONS.find(m => m.value === model)?.label || model}
                <ChevronDown size={12} />
              </button>
              {showModelPicker && (
                <div className="notepad-model-dropdown">
                  {MODEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`notepad-model-option ${model === opt.value ? 'active' : ''}`}
                      onClick={() => {
                        setModel(opt.value);
                        setShowModelPicker(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="notepad-action-btn"
              onClick={handleNewSession}
              disabled={isLoading}
              title="New session"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="notepad-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Input area — styled like notebook lines */}
      <div className="notepad-input-area">
        {/* Red margin line */}
        <div className="notepad-margin-line" />

        <div className="notepad-input-wrapper">
          <textarea
            ref={inputRef}
            className="notepad-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'Claude is thinking...' : 'Write something...'}
            disabled={isLoading}
            rows={1}
          />

          <div className="notepad-input-actions">
            {isLoading ? (
              <button className="notepad-send-btn loading" onClick={stop} title="Stop">
                <Square size={16} />
              </button>
            ) : (
              <button
                className="notepad-send-btn"
                onClick={handleSubmit}
                disabled={!input.trim()}
                title="Send (Enter)"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="notepad-loading">
            <Loader2 size={14} className="animate-spin" />
            <span>Claude is writing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
