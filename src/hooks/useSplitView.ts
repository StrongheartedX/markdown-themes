import { useState, useCallback, useEffect, useRef } from 'react';

interface SplitViewState {
  isSplit: boolean;
  splitRatio: number;
  rightFile: string | null;
}

interface UseSplitViewOptions {
  initialState?: Partial<SplitViewState>;
  onStateChange?: (state: SplitViewState) => void;
}

interface UseSplitViewResult {
  isSplit: boolean;
  splitRatio: number;
  leftFile: string | null;
  rightFile: string | null;
  toggleSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  setLeftFile: (path: string | null) => void;
  setRightFile: (path: string | null) => void;
}

export function useSplitView(options: UseSplitViewOptions = {}): UseSplitViewResult {
  const { initialState, onStateChange } = options;

  const [isSplit, setIsSplit] = useState(initialState?.isSplit ?? false);
  const [splitRatio, setSplitRatioState] = useState(initialState?.splitRatio ?? 0.5);
  const [leftFile, setLeftFile] = useState<string | null>(null);
  const [rightFile, setRightFileState] = useState<string | null>(initialState?.rightFile ?? null);

  // Track if this is the initial mount to avoid triggering onStateChange
  const isInitialMount = useRef(true);

  // Notify parent of state changes (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onStateChange?.({ isSplit, splitRatio, rightFile });
  }, [isSplit, splitRatio, rightFile, onStateChange]);

  const toggleSplit = useCallback(() => {
    setIsSplit((prev) => !prev);
  }, []);

  const setSplitRatio = useCallback((ratio: number) => {
    // Clamp ratio between 0.2 and 0.8 for usability
    const clampedRatio = Math.max(0.2, Math.min(0.8, ratio));
    setSplitRatioState(clampedRatio);
  }, []);

  const setRightFile = useCallback((path: string | null) => {
    setRightFileState(path);
  }, []);

  return {
    isSplit,
    splitRatio,
    leftFile,
    rightFile,
    toggleSplit,
    setSplitRatio,
    setLeftFile,
    setRightFile,
  };
}
