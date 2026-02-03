import { useState } from 'react';
import { themes, type ThemeId } from './themes';
import { useFileWatcher } from './hooks/useFileWatcher';
import { Toolbar } from './components/Toolbar';
import { MarkdownViewer } from './components/MarkdownViewer';
import './index.css';

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('dark-academia');

  const { content, error, loading, isStreaming } = useFileWatcher({ path: currentFile });

  const themeClass = themes.find(t => t.id === currentTheme)?.className ?? '';

  return (
    <div className={`min-h-screen flex flex-col bg-bg-primary ${themeClass}`}>
      <Toolbar
        currentFile={currentFile}
        currentTheme={currentTheme}
        isStreaming={isStreaming}
        onThemeChange={setCurrentTheme}
        onFileSelect={setCurrentFile}
      />

      <main className="flex-1 overflow-auto">
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
          <MarkdownViewer content={content} isStreaming={isStreaming} themeClassName={themeClass} />
        )}
      </main>
    </div>
  );
}

export default App;
