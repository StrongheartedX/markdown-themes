import { open } from '@tauri-apps/plugin-dialog';
import { ThemeSelector } from './ThemeSelector';
import type { ThemeId } from '../themes';

interface ToolbarProps {
  currentFile: string | null;
  currentTheme: ThemeId;
  isStreaming?: boolean;
  onThemeChange: (theme: ThemeId) => void;
  onFileSelect: (path: string) => void;
}

export function Toolbar({ currentFile, currentTheme, isStreaming, onThemeChange, onFileSelect }: ToolbarProps) {
  const handleOpenFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    });

    if (selected && typeof selected === 'string') {
      onFileSelect(selected);
    }
  };

  const fileName = currentFile?.split('/').pop() ?? currentFile?.split('\\').pop();

  return (
    <header className="
      flex items-center justify-between
      px-4 py-3
      bg-bg-secondary border-b border-border
      select-none
    ">
      <div className="flex items-center gap-4">
        <button
          onClick={handleOpenFile}
          className="
            px-4 py-1.5 rounded-[var(--radius)]
            bg-accent text-white
            hover:bg-accent-hover
            transition-colors
            font-medium text-sm
          "
        >
          Open File
        </button>
        {fileName && (
          <span className="text-sm text-text-secondary truncate max-w-[300px]" title={currentFile ?? ''}>
            {fileName}
          </span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-2 text-sm text-accent">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            AI writing...
          </span>
        )}
      </div>

      <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
    </header>
  );
}
