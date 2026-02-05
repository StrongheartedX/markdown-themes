import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { MarkdownViewer } from '../MarkdownViewer';
import { jsonlToMarkdown } from '../../utils/conversationMarkdown';

interface ConversationMetadata {
  messageCount: number;
  hasThinking: boolean;
  hasTool: boolean;
}

interface ConversationMarkdownViewerProps {
  content: string;
  filePath?: string;
  fontSize?: number;
  themeClassName?: string;
  isStreaming?: boolean;
}

/**
 * Custom hook to throttle content updates during streaming.
 * This prevents expensive re-parsing of large JSONL files on every WebSocket message.
 */
function useThrottledContent(content: string, isStreaming: boolean, throttleMs: number = 1000): string {
  const [throttledContent, setThrottledContent] = useState(content);
  const lastUpdateRef = useRef<number>(0);
  const pendingContentRef = useRef<string>(content);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    pendingContentRef.current = content;

    // If not streaming, update immediately
    if (!isStreaming) {
      setThrottledContent(content);
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // If enough time has passed, update immediately
    if (timeSinceLastUpdate >= throttleMs) {
      lastUpdateRef.current = now;
      setThrottledContent(content);
    } else {
      // Schedule an update for the remaining time
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThrottledContent(pendingContentRef.current);
      }, throttleMs - timeSinceLastUpdate);
    }

    return () => clearTimeout(timeoutRef.current);
  }, [content, isStreaming, throttleMs]);

  // Final update when streaming stops
  useEffect(() => {
    if (!isStreaming && pendingContentRef.current !== throttledContent) {
      setThrottledContent(pendingContentRef.current);
    }
  }, [isStreaming, throttledContent]);

  return throttledContent;
}

/**
 * Extract metadata from conversation JSONL content.
 * Looks for the first few entries to get session info.
 */
function extractMetadata(content: string): ConversationMetadata | null {
  if (!content || !content.trim()) {
    return null;
  }

  const lines = content.split('\n').filter(line => line.trim());
  let messageCount = 0;
  let hasThinking = false;
  let hasTool = false;

  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line.trim());

      // Type guard: ensure parsed is an object with a type property
      if (
        parsed &&
        typeof parsed === 'object' &&
        'type' in parsed &&
        typeof (parsed as { type: unknown }).type === 'string'
      ) {
        const entry = parsed as { type: string; message?: unknown };

        if (entry.type === 'user' || entry.type === 'assistant') {
          messageCount++;

          // Check for thinking/tool blocks in assistant messages
          if (
            entry.type === 'assistant' &&
            entry.message &&
            typeof entry.message === 'object' &&
            'content' in entry.message &&
            Array.isArray((entry.message as { content: unknown }).content)
          ) {
            const content = (entry.message as { content: unknown[] }).content;
            for (const block of content) {
              if (
                block &&
                typeof block === 'object' &&
                'type' in block &&
                typeof (block as { type: unknown }).type === 'string'
              ) {
                const blockType = (block as { type: string }).type;
                if (blockType === 'thinking') hasThinking = true;
                if (blockType === 'tool_use') hasTool = true;
              }
            }
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messageCount > 0 ? { messageCount, hasThinking, hasTool } : null;
}

/**
 * ConversationMarkdownViewer - Renders Claude Code conversation JSONL as themed markdown.
 *
 * Transforms JSONL conversation logs from ~/.claude/projects/ into readable
 * markdown with User/Assistant headers, thinking blocks, and tool calls.
 */
export function ConversationMarkdownViewer({
  content,
  filePath,
  fontSize = 100,
  themeClassName,
  isStreaming = false,
}: ConversationMarkdownViewerProps) {
  // Throttle content updates during streaming to prevent expensive re-parsing
  // Only update at most once per second when streaming
  const throttledContent = useThrottledContent(content, isStreaming, 1000);

  // Transform JSONL to markdown (now using throttled content)
  // Wrapped in try-catch to handle malformed JSONL gracefully
  const markdown = useMemo(() => {
    try {
      return jsonlToMarkdown(throttledContent);
    } catch (err) {
      console.error('Failed to parse conversation JSONL:', err);
      return '';
    }
  }, [throttledContent]);

  // Cache metadata to avoid re-parsing during streaming
  // Only re-extract when content length decreases (new file) or streaming stops
  const metadataCache = useRef<{ content: string; metadata: ConversationMetadata | null } | null>(null);
  const prevContentLengthRef = useRef<number>(0);

  const getMetadata = useCallback((content: string, streaming: boolean): ConversationMetadata | null => {
    const contentLength = content.length;

    // If content length decreased, it's a new file - clear cache
    if (contentLength < prevContentLengthRef.current) {
      metadataCache.current = null;
    }
    prevContentLengthRef.current = contentLength;

    // During streaming, reuse cached metadata if available
    if (streaming && metadataCache.current) {
      return metadataCache.current.metadata;
    }

    // Extract fresh metadata when not streaming or no cache
    const metadata = extractMetadata(content);
    metadataCache.current = { content, metadata };
    return metadata;
  }, []);

  // Extract metadata for header (optimized with caching)
  const metadata = useMemo(
    () => getMetadata(throttledContent, isStreaming),
    [throttledContent, isStreaming, getMetadata]
  );

  // Scroll to bottom on initial load (conversations are chronological)
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    // Only scroll once on initial content load, not during streaming updates
    if (markdown && !hasScrolledRef.current && containerRef.current) {
      hasScrolledRef.current = true;
      // Double rAF ensures layout is complete before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        });
      });
    }
  }, [markdown]);

  // Handle empty content
  if (!markdown) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>No conversation content to display</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="conversation-viewer h-full overflow-auto">
      {/* Metadata header */}
      {metadata && (
        <div
          className="px-8 py-3 border-b flex items-center gap-4 text-sm"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>{metadata.messageCount} messages</span>
          {metadata.hasThinking && (
            <span
              className="px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--accent)', color: 'white', opacity: 0.8 }}
            >
              thinking
            </span>
          )}
          {metadata.hasTool && (
            <span
              className="px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--accent)', color: 'white', opacity: 0.8 }}
            >
              tools
            </span>
          )}
          {filePath && (
            <span className="ml-auto truncate max-w-md" title={filePath}>
              {filePath.split('/').slice(-2).join('/')}
            </span>
          )}
        </div>
      )}

      {/* Rendered markdown content */}
      <MarkdownViewer
        content={markdown}
        isStreaming={isStreaming}
        themeClassName={themeClassName}
        fontSize={fontSize}
      />
    </div>
  );
}
