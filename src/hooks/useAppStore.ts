import { useState, useEffect, useCallback, useRef } from 'react';
import { LazyStore } from '@tauri-apps/plugin-store';
import type { ThemeId } from '../themes';

const MAX_RECENT_FILES = 10;
const STORE_FILE = 'app-settings.json';

export interface AppState {
  theme: ThemeId;
  recentFiles: string[];
  lastWorkspace?: string;
}

const DEFAULT_STATE: AppState = {
  theme: 'dark-academia',
  recentFiles: [],
  lastWorkspace: undefined,
};

interface UseAppStoreResult {
  state: AppState;
  isLoading: boolean;
  saveTheme: (theme: ThemeId) => Promise<void>;
  addRecentFile: (filePath: string) => Promise<void>;
  saveLastWorkspace: (workspacePath: string | null) => Promise<void>;
  clearRecentFiles: () => Promise<void>;
}

export function useAppStore(): UseAppStoreResult {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const storeRef = useRef<LazyStore | null>(null);

  // Initialize store and load state
  useEffect(() => {
    let mounted = true;

    async function initStore() {
      try {
        const store = new LazyStore(STORE_FILE);
        storeRef.current = store;

        // Load saved state
        const [savedTheme, savedRecentFiles, savedLastWorkspace] = await Promise.all([
          store.get<ThemeId>('theme'),
          store.get<string[]>('recentFiles'),
          store.get<string>('lastWorkspace'),
        ]);

        if (mounted) {
          setState({
            theme: savedTheme ?? DEFAULT_STATE.theme,
            recentFiles: savedRecentFiles ?? DEFAULT_STATE.recentFiles,
            lastWorkspace: savedLastWorkspace ?? DEFAULT_STATE.lastWorkspace,
          });
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to initialize app store:', err);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initStore();

    return () => {
      mounted = false;
    };
  }, []);

  const saveTheme = useCallback(async (theme: ThemeId) => {
    const store = storeRef.current;
    if (!store) return;

    try {
      await store.set('theme', theme);
      setState(prev => ({ ...prev, theme }));
    } catch (err) {
      console.error('Failed to save theme:', err);
    }
  }, []);

  const addRecentFile = useCallback(async (filePath: string) => {
    const store = storeRef.current;
    if (!store) return;

    try {
      // Get current recent files
      const currentFiles = (await store.get<string[]>('recentFiles')) ?? [];

      // Remove the file if it already exists (to move it to the front)
      const filteredFiles = currentFiles.filter(f => f !== filePath);

      // Add to front and limit to max
      const newRecentFiles = [filePath, ...filteredFiles].slice(0, MAX_RECENT_FILES);

      await store.set('recentFiles', newRecentFiles);
      setState(prev => ({ ...prev, recentFiles: newRecentFiles }));
    } catch (err) {
      console.error('Failed to add recent file:', err);
    }
  }, []);

  const saveLastWorkspace = useCallback(async (workspacePath: string | null) => {
    const store = storeRef.current;
    if (!store) return;

    try {
      if (workspacePath) {
        await store.set('lastWorkspace', workspacePath);
      } else {
        await store.delete('lastWorkspace');
      }
      setState(prev => ({ ...prev, lastWorkspace: workspacePath ?? undefined }));
    } catch (err) {
      console.error('Failed to save last workspace:', err);
    }
  }, []);

  const clearRecentFiles = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;

    try {
      await store.set('recentFiles', []);
      setState(prev => ({ ...prev, recentFiles: [] }));
    } catch (err) {
      console.error('Failed to clear recent files:', err);
    }
  }, []);

  return {
    state,
    isLoading,
    saveTheme,
    addRecentFile,
    saveLastWorkspace,
    clearRecentFiles,
  };
}
