import { useState, useEffect, useCallback, useMemo } from 'react';
import { themes, type ThemeId } from './themes';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useWorkspace } from './hooks/useWorkspace';
import { useAppStore } from './hooks/useAppStore';
import { Toolbar } from './components/Toolbar';
import { MarkdownViewer } from './components/MarkdownViewer';
import { MetadataBar } from './components/MetadataBar';
import { Sidebar } from './components/Sidebar';
import { parseFrontmatter } from './utils/frontmatter';
import './index.css';

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  const {
    state: appState,
    isLoading: storeLoading,
    saveTheme,
    addRecentFile,
    saveLastWorkspace,
  } = useAppStore();

  const { content, error, loading, isStreaming } = useFileWatcher({ path: currentFile });
  const { workspacePath, fileTree, openWorkspace, closeWorkspace } = useWorkspace();

  const themeClass = themes.find(t => t.id === appState.theme)?.className ?? '';

  // Parse frontmatter from content
  const { frontmatter, content: markdownContent } = useMemo(
    () => parseFrontmatter(content),
    [content]
  );

  // Restore last workspace on mount
  useEffect(() => {
    if (!storeLoading && appState.lastWorkspace && !workspacePath) {
      openWorkspace(appState.lastWorkspace);
    }
  }, [storeLoading, appState.lastWorkspace, workspacePath, openWorkspace]);

  // Handle theme change with persistence
  const handleThemeChange = useCallback((theme: ThemeId) => {
    saveTheme(theme);
  }, [saveTheme]);

  // Handle file selection with recent files tracking
  const handleFileSelect = useCallback((path: string) => {
    setCurrentFile(path);
    addRecentFile(path);
  }, [addRecentFile]);

  // Handle folder selection with workspace persistence
  const handleFolderSelect = useCallback((path: string) => {
    openWorkspace(path);
    saveLastWorkspace(path);
  }, [openWorkspace, saveLastWorkspace]);

  const handleCloseWorkspace = useCallback(() => {
    closeWorkspace();
    setCurrentFile(null);
    saveLastWorkspace(null);
  }, [closeWorkspace, saveLastWorkspace]);

  return (
    <div className={`min-h-screen flex flex-col bg-bg-primary ${themeClass}`}>
      <Toolbar
        currentFile={currentFile}
        currentTheme={appState.theme}
        isStreaming={isStreaming}
        hasWorkspace={!!workspacePath}
        recentFiles={appState.recentFiles}
        onThemeChange={handleThemeChange}
        onFileSelect={handleFileSelect}
        onFolderSelect={handleFolderSelect}
      />

      <div className="flex-1 flex overflow-hidden">
        {workspacePath && (
          <Sidebar
            fileTree={fileTree}
            currentFile={currentFile}
            workspacePath={workspacePath}
            onFileSelect={handleFileSelect}
            onClose={handleCloseWorkspace}
          />
        )}

        <main className="flex-1 flex flex-col overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-secondary">Loading...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <p className="text-red-500">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {frontmatter && <MetadataBar frontmatter={frontmatter} />}
              <div className="flex-1 overflow-auto">
                <MarkdownViewer content={markdownContent} isStreaming={isStreaming} themeClassName={themeClass} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
