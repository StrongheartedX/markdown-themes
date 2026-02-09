import { useRef, useEffect, useCallback } from 'react';
import { findFirstChangedBlock, findFirstChangedLine, findAllChangedBlocks, findAllChangedLinesList } from '../utils/markdownDiff';

/**
 * useDiffAutoScroll - Auto-scroll to content changes during AI streaming
 *
 * This hook enables a "watch Claude code" experience by automatically
 * scrolling the viewport to show where changes are happening in real-time.
 *
 * Features:
 * - Block-level diffing for markdown (paragraphs, headings, code blocks)
 * - Percentage-based fallback for code files
 * - User interruption detection (pauses if you scroll manually)
 * - Works at any zoom/font-size level via DOM-based positioning
 * - Sequential mode: walks through ALL changed blocks with dwell time
 */

interface UseDiffAutoScrollOptions {
  /** Current content to render */
  content: string;
  /** Whether AI is currently streaming/editing */
  isStreaming: boolean;
  /** Ref to the scroll container element */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** File path for determining diff mode (optional) */
  filePath?: string;
  /** Whether auto-scroll is enabled (default: true) */
  enabled?: boolean;
  /** Debounce delay in ms before scrolling (default: 150) */
  debounceMs?: number;
  /** Scroll to bottom on initial content load while streaming (default: false) */
  scrollToBottomOnInitial?: boolean;
  /** Enable sequential mode: walk through ALL changed blocks instead of just the first (default: false) */
  sequential?: boolean;
}

/**
 * Small buffer (in pixels) added to scroll calculations to handle
 * zoom/font-size rounding issues. At non-100% zoom levels, scrollHeight
 * and clientHeight may have fractional values that cause the scroll
 * position to be slightly off from the visual bottom.
 */
const SCROLL_BUFFER_PX = 10;

/** Dwell time per change in sequential mode (ms) */
const SEQUENTIAL_DWELL_MS = 1000;

/** Max queue depth before skipping older items */
const MAX_QUEUE_DEPTH = 5;

/** File extensions that should use line-level diffing */
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'php', 'java', 'kt', 'kts', 'scala', 'go', 'rs', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'swift',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'xml',
  'sql', 'graphql', 'gql', 'lua', 'r', 'perl', 'pl', 'hs', 'elm', 'clj', 'ex', 'exs', 'erl',
  'css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte', 'astro',
  'dockerfile', 'makefile', 'cmake', 'vim', 'tex', 'diff', 'prisma',
]);

/**
 * Determine if a file should use line-level diffing based on extension.
 */
function isCodeFile(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const fileName = filePath.split('/').pop() || '';
  // Handle special filenames
  if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) return true;
  if (fileName === 'Makefile' || fileName === 'makefile') return true;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return CODE_EXTENSIONS.has(ext);
}

/**
 * CSS selectors for block-level elements in rendered content.
 *
 * For markdown: paragraphs, headings, lists, code blocks, etc.
 * For code viewers: .line classes or data-line attributes from syntax highlighters
 */
const BLOCK_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, pre, ul, ol, blockquote, table, hr, .line, [data-line]';

/** A scroll target in the sequential queue */
interface ScrollTarget {
  /** For markdown: block index. For code: line number (1-based). */
  index: number;
  /** Whether this is an addition (appended content) */
  isAddition: boolean;
  /** Whether this is a code line (vs markdown block) */
  isLine: boolean;
}

/**
 * Hook that auto-scrolls to changed content during AI streaming.
 *
 * How it works:
 * 1. Tracks previous content in a ref
 * 2. When content changes during streaming, diffs old vs new
 * 3. Finds the first changed block index (or all blocks in sequential mode)
 * 4. Queries the DOM for block elements and scrolls to the matching one
 *
 * Sequential mode:
 * - Finds ALL changed blocks/lines on each content update
 * - Enqueues them and walks through with ~1s dwell per change
 * - Skips older items if queue grows beyond 5
 * - User scroll pauses the queue; resumes when streaming resumes
 *
 * User interruption: If user manually scrolls during streaming,
 * auto-scroll is paused until streaming stops.
 */
export function useDiffAutoScroll({
  content,
  isStreaming,
  scrollContainerRef,
  filePath,
  enabled = true,
  debounceMs = 50,
  scrollToBottomOnInitial = false,
  sequential = false,
}: UseDiffAutoScrollOptions) {
  const useLineDiff = isCodeFile(filePath);
  const prevContentRef = useRef<string>('');
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTimeRef = useRef(0);
  const hasScrolledInitialRef = useRef(false);

  // Sequential mode refs
  const scrollQueueRef = useRef<ScrollTarget[]>([]);
  const isProcessingQueueRef = useRef(false);
  const queueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which targets we've already queued to avoid duplicates within a streaming session
  const queuedTargetsRef = useRef<Set<string>>(new Set());

  // Detect user scroll to pause auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isStreaming) return;

    const handleScroll = () => {
      // If this scroll happened very recently after we programmatically scrolled,
      // ignore it (it's probably our scroll, not user's)
      const timeSinceOurScroll = Date.now() - lastScrollTimeRef.current;
      if (timeSinceOurScroll < 200) return;

      userScrolledRef.current = true;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef, isStreaming]);

  // Reset user scroll flag, initial scroll flag, and sequential queue when streaming stops
  useEffect(() => {
    if (!isStreaming) {
      userScrolledRef.current = false;
      hasScrolledInitialRef.current = false;
      // Clear sequential queue
      scrollQueueRef.current = [];
      isProcessingQueueRef.current = false;
      queuedTargetsRef.current.clear();
      if (queueTimerRef.current) {
        clearTimeout(queueTimerRef.current);
        queueTimerRef.current = null;
      }
    }
  }, [isStreaming]);

  // Reset initial scroll flag and sequential queue when file changes
  useEffect(() => {
    hasScrolledInitialRef.current = false;
    prevContentRef.current = '';
    // Reset sequential queue for new file
    scrollQueueRef.current = [];
    isProcessingQueueRef.current = false;
    queuedTargetsRef.current.clear();
    if (queueTimerRef.current) {
      clearTimeout(queueTimerRef.current);
      queueTimerRef.current = null;
    }
  }, [filePath]);

  /**
   * Scroll to a specific target element in the container.
   * Shared by both sequential queue processing and single-block mode.
   */
  const scrollToTarget = useCallback((target: ScrollTarget, container: HTMLElement) => {
    if (target.isLine) {
      // Code file: scroll to line
      const targetLine = container.querySelector(`[data-line="${target.index}"]`);
      if (targetLine) {
        const containerRect = container.getBoundingClientRect();
        const lineRect = targetLine.getBoundingClientRect();
        const isAboveViewport = lineRect.bottom < containerRect.top;
        const isBelowViewport = lineRect.top > containerRect.bottom;
        const isVisible = !isAboveViewport && !isBelowViewport;

        if (!isVisible) {
          lastScrollTimeRef.current = Date.now();
          targetLine.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      } else {
        // Fallback: percentage-based scroll
        const scrollHeight = container.scrollHeight - container.clientHeight;
        // We don't have totalLines here, but we can estimate from container
        lastScrollTimeRef.current = Date.now();
        container.scrollTo({
          top: scrollHeight * 0.8,
          behavior: 'smooth',
        });
      }
    } else {
      // Markdown file: scroll to block
      const blocks = container.querySelectorAll(BLOCK_SELECTORS);

      if (target.isAddition) {
        // For additions, scroll to the last block (content appended at end)
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock) {
          lastScrollTimeRef.current = Date.now();
          lastBlock.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
          requestAnimationFrame(() => {
            container.scrollTo({
              top: container.scrollTop + SCROLL_BUFFER_PX,
              behavior: 'smooth',
            });
          });
        } else {
          lastScrollTimeRef.current = Date.now();
          container.scrollTo({
            top: container.scrollHeight + SCROLL_BUFFER_PX,
            behavior: 'smooth',
          });
        }
      } else {
        // For modifications, scroll to the specific block
        const targetBlock = blocks[target.index];
        if (targetBlock) {
          const containerRect = container.getBoundingClientRect();
          const blockRect = targetBlock.getBoundingClientRect();
          const isAboveViewport = blockRect.bottom < containerRect.top;
          const isBelowViewport = blockRect.top > containerRect.bottom;
          const isVisible = !isAboveViewport && !isBelowViewport;

          if (!isVisible) {
            lastScrollTimeRef.current = Date.now();
            targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        } else {
          // Fallback: percentage-based
          const scrollHeight = container.scrollHeight - container.clientHeight;
          lastScrollTimeRef.current = Date.now();
          container.scrollTo({
            top: scrollHeight * 0.8,
            behavior: 'smooth',
          });
        }
      }
    }
  }, []);

  /**
   * Process the next item in the sequential scroll queue.
   * Scrolls to the target, then waits SEQUENTIAL_DWELL_MS before advancing.
   */
  const processQueue = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || userScrolledRef.current || !isProcessingQueueRef.current) {
      isProcessingQueueRef.current = false;
      return;
    }

    const queue = scrollQueueRef.current;
    if (queue.length === 0) {
      isProcessingQueueRef.current = false;
      return;
    }

    // If queue is too deep, skip to stay current - keep only the last MAX_QUEUE_DEPTH items
    if (queue.length > MAX_QUEUE_DEPTH) {
      const skip = queue.length - MAX_QUEUE_DEPTH;
      queue.splice(0, skip);
    }

    // Take the next target from the front of the queue
    const target = queue.shift()!;

    // Scroll to it
    scrollToTarget(target, container);

    // Schedule next item after dwell time
    queueTimerRef.current = setTimeout(() => {
      processQueue();
    }, SEQUENTIAL_DWELL_MS);
  }, [scrollContainerRef, scrollToTarget]);

  // Sequential mode effect: detect changes, enqueue ALL changed blocks/lines
  useEffect(() => {
    if (!sequential) return; // Only active in sequential mode
    if (!enabled || !isStreaming || !scrollContainerRef.current) {
      prevContentRef.current = content;
      return;
    }

    if (userScrolledRef.current) {
      prevContentRef.current = content;
      return;
    }

    // Ignore empty content transitions
    if (!content && prevContentRef.current) {
      return;
    }

    const prevContent = prevContentRef.current;
    prevContentRef.current = content;

    // Handle initial content load
    if (!prevContent) {
      if (scrollToBottomOnInitial && !hasScrolledInitialRef.current && content) {
        hasScrolledInitialRef.current = true;
        setTimeout(() => {
          const container = scrollContainerRef.current;
          if (container) {
            lastScrollTimeRef.current = Date.now();
            container.scrollTo({
              top: container.scrollHeight + SCROLL_BUFFER_PX,
              behavior: 'smooth',
            });
          }
        }, 100);
      }
      return;
    }

    if (prevContent === content) return;

    // Clear the debounce timeout (we use our own scheduling)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Find ALL changes and enqueue new ones
    scrollTimeoutRef.current = setTimeout(() => {
      if (useLineDiff) {
        const changedLines = findAllChangedLinesList(prevContent, content);
        for (const change of changedLines) {
          const key = `line:${change.line}`;
          if (!queuedTargetsRef.current.has(key)) {
            queuedTargetsRef.current.add(key);
            scrollQueueRef.current.push({
              index: change.line,
              isAddition: change.isAddition,
              isLine: true,
            });
          }
        }
      } else {
        const changedBlocks = findAllChangedBlocks(prevContent, content);
        for (const change of changedBlocks) {
          const key = `block:${change.blockIndex}`;
          if (!queuedTargetsRef.current.has(key)) {
            queuedTargetsRef.current.add(key);
            scrollQueueRef.current.push({
              index: change.blockIndex,
              isAddition: change.isAddition,
              isLine: false,
            });
          }
        }
      }

      // Start processing the queue if not already running
      if (!isProcessingQueueRef.current && scrollQueueRef.current.length > 0) {
        isProcessingQueueRef.current = true;
        processQueue();
      }
    }, debounceMs);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [content, isStreaming, enabled, scrollContainerRef, debounceMs, useLineDiff, sequential, scrollToBottomOnInitial, processQueue]);

  // Single-block mode effect: original behavior (only active when NOT sequential)
  useEffect(() => {
    if (sequential) return; // Skip in sequential mode
    if (!enabled || !isStreaming || !scrollContainerRef.current) {
      // Update prev content even when disabled so we don't scroll on re-enable
      prevContentRef.current = content;
      return;
    }

    // Don't auto-scroll if user manually scrolled
    if (userScrolledRef.current) {
      prevContentRef.current = content;
      return;
    }

    // Ignore empty content transitions (truncation artifacts from atomic writes)
    // Don't update prevContentRef so the diff chain is preserved
    if (!content && prevContentRef.current) {
      return;
    }

    const prevContent = prevContentRef.current;
    prevContentRef.current = content;

    // Handle initial content load
    if (!prevContent) {
      // If scrollToBottomOnInitial is enabled and we haven't scrolled yet, scroll to bottom
      if (scrollToBottomOnInitial && !hasScrolledInitialRef.current && content) {
        hasScrolledInitialRef.current = true;
        // Small delay to let DOM render
        setTimeout(() => {
          const container = scrollContainerRef.current;
          if (container) {
            lastScrollTimeRef.current = Date.now();
            container.scrollTo({
              top: container.scrollHeight + SCROLL_BUFFER_PX,
              behavior: 'smooth',
            });
          }
        }, 100);
      }
      return;
    }

    // Skip if content unchanged
    if (prevContent === content) return;

    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Debounce the scroll to avoid thrashing and let DOM update
    scrollTimeoutRef.current = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      if (useLineDiff) {
        // Line-level diffing for code files
        const lineDiff = findFirstChangedLine(prevContent, content);
        if (lineDiff.firstChangedLine < 0) return; // No change found

        // Only scroll to bottom if change is in the last 10% of the file
        // (i.e., actually adding content at the end, not just modifying a line)
        const isNearEnd = lineDiff.firstChangedLine > lineDiff.totalLines * 0.9;
        if (lineDiff.isAddition && isNearEnd) {
          lastScrollTimeRef.current = Date.now();
          // Add buffer to handle zoom/font-size rounding issues
          // At non-100% zoom, scrollHeight may have fractional values
          container.scrollTo({
            top: container.scrollHeight + SCROLL_BUFFER_PX,
            behavior: 'smooth',
          });
          return;
        }

        // For modifications or additions not at end, find the line element
        const targetLine = container.querySelector(`[data-line="${lineDiff.firstChangedLine}"]`);

        if (targetLine) {
          // Check if line is currently visible using getBoundingClientRect
          // which correctly handles zoom/font-size transformations
          const containerRect = container.getBoundingClientRect();
          const lineRect = targetLine.getBoundingClientRect();

          // Check visibility using visual viewport coordinates (handles zoom correctly)
          const isAboveViewport = lineRect.bottom < containerRect.top;
          const isBelowViewport = lineRect.top > containerRect.bottom;
          const isVisible = !isAboveViewport && !isBelowViewport;

          if (!isVisible) {
            lastScrollTimeRef.current = Date.now();
            // Use scrollIntoView which handles zoom/font-size correctly
            // 'center' keeps changed content visible with context above and below
            targetLine.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        } else {
          // Fallback: percentage-based scroll for code files without data-line
          const scrollHeight = container.scrollHeight - container.clientHeight;
          const scrollPercent = lineDiff.totalLines > 0
            ? lineDiff.firstChangedLine / lineDiff.totalLines
            : 1;

          lastScrollTimeRef.current = Date.now();
          container.scrollTo({
            top: scrollHeight * Math.max(scrollPercent, 0.5),
            behavior: 'smooth',
          });
        }
      } else {
        // Block-level diffing for markdown files
        const diff = findFirstChangedBlock(prevContent, content);
        if (diff.firstChangedBlock < 0) return; // No change found

        // For additions (content added at end), scroll to the last block element
        // This is more reliable than trying to match markdown blocks to DOM elements
        if (diff.isAddition) {
          const blocks = container.querySelectorAll(BLOCK_SELECTORS);
          const lastBlock = blocks[blocks.length - 1];

          if (lastBlock) {
            lastScrollTimeRef.current = Date.now();
            // Use scrollIntoView for reliable positioning at any zoom level
            // 'end' alignment with 'nearest' inline prevents horizontal scrolling
            lastBlock.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
            // Then nudge a bit more to ensure we're truly at the bottom
            // This handles zoom/font-size rounding issues
            requestAnimationFrame(() => {
              container.scrollTo({
                top: container.scrollTop + SCROLL_BUFFER_PX,
                behavior: 'smooth',
              });
            });
          } else {
            // Fallback: scroll to bottom with buffer for zoom handling
            lastScrollTimeRef.current = Date.now();
            container.scrollTo({
              top: container.scrollHeight + SCROLL_BUFFER_PX,
              behavior: 'smooth',
            });
          }
          return;
        }

        // For modifications, try to find the changed block
        const blocks = container.querySelectorAll(BLOCK_SELECTORS);
        const targetBlock = blocks[diff.firstChangedBlock];

        if (targetBlock) {
          // Check if block is currently visible using getBoundingClientRect
          // which correctly handles zoom/font-size transformations
          const containerRect = container.getBoundingClientRect();
          const blockRect = targetBlock.getBoundingClientRect();

          // Check visibility using visual viewport coordinates (handles zoom correctly)
          const isAboveViewport = blockRect.bottom < containerRect.top;
          const isBelowViewport = blockRect.top > containerRect.bottom;
          const isVisible = !isAboveViewport && !isBelowViewport;

          if (!isVisible) {
            lastScrollTimeRef.current = Date.now();
            // Use scrollIntoView which handles zoom/font-size correctly
            // 'center' keeps changed content visible with context above and below
            targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        } else {
          // Couldn't find specific block - use percentage-based fallback
          const scrollHeight = container.scrollHeight - container.clientHeight;
          const scrollPercent = diff.totalBlocks > 0
            ? diff.firstChangedBlock / diff.totalBlocks
            : 1; // Default to bottom if no blocks

          lastScrollTimeRef.current = Date.now();
          container.scrollTo({
            top: scrollHeight * Math.max(scrollPercent, 0.5), // At least scroll halfway
            behavior: 'smooth',
          });
        }
      }
    }, debounceMs);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [content, isStreaming, enabled, scrollContainerRef, debounceMs, useLineDiff, sequential, scrollToBottomOnInitial]);

  // Manual scroll function for external use
  const scrollToChange = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !prevContentRef.current) return;

    if (useLineDiff) {
      const lineDiff = findFirstChangedLine(prevContentRef.current, content);
      if (lineDiff.firstChangedLine < 0) return;

      const targetLine = container.querySelector(`[data-line="${lineDiff.firstChangedLine}"]`);
      if (targetLine) {
        lastScrollTimeRef.current = Date.now();
        targetLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      const diff = findFirstChangedBlock(prevContentRef.current, content);
      if (diff.firstChangedBlock < 0) return;

      const blocks = container.querySelectorAll(BLOCK_SELECTORS);
      const targetBlock = blocks[diff.firstChangedBlock];

      if (targetBlock) {
        lastScrollTimeRef.current = Date.now();
        targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [content, scrollContainerRef, useLineDiff]);

  // Reset user scroll flag manually
  const resetUserScroll = useCallback(() => {
    userScrolledRef.current = false;
  }, []);

  return {
    /** Whether user has manually scrolled (auto-scroll paused) */
    userScrolled: userScrolledRef.current,
    /** Manually trigger scroll to current change */
    scrollToChange,
    /** Reset user scroll flag to re-enable auto-scroll */
    resetUserScroll,
  };
}
