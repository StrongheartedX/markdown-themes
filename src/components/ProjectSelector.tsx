import { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, ChevronDown, X } from 'lucide-react';
import { FilePickerModal } from './FilePickerModal';

interface ProjectSelectorProps {
  currentPath: string | null;
  recentFolders: string[];
  onFolderSelect: (path: string) => void;
  onClose: () => void;
}

export function ProjectSelector({
  currentPath,
  recentFolders,
  onFolderSelect,
  onClose,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRecentFolderClick = (path: string) => {
    onFolderSelect(path);
    setIsOpen(false);
  };

  const handleOpenFolderClick = () => {
    setIsOpen(false);
    setShowFilePicker(true);
  };

  const handleFilePickerSelect = (path: string) => {
    onFolderSelect(path);
    setShowFilePicker(false);
  };

  const handleCloseWorkspace = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    setIsOpen(false);
  };

  // Get display name: last 2 path segments
  const getDisplayName = (path: string) => {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 2) {
      return '/' + segments.join('/');
    }
    return '.../' + segments.slice(-2).join('/');
  };

  const getFolderName = (path: string) => path.split('/').pop() ?? path.split('\\').pop() ?? path;

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm transition-colors"
          style={{
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          {currentPath ? (
            <FolderOpen className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          ) : (
            <Folder className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <span
            className="max-w-[180px] truncate"
            title={currentPath ?? 'No project open'}
          >
            {currentPath ? getDisplayName(currentPath) : 'Open Project'}
          </span>
          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          {currentPath && (
            <button
              type="button"
              onClick={handleCloseWorkspace}
              className="ml-1 p-0.5 rounded transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Close project"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </button>

        {isOpen && (
          <div
            className="absolute top-full right-0 mt-1 z-[100] min-w-[280px] max-w-[400px] py-1 overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
            }}
          >
            {/* Current project indicator */}
            {currentPath && (
              <>
                <div
                  className="px-3 py-1.5 text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}
                >
                  Current Project
                </div>
                <div
                  className="px-3 py-2 text-sm flex items-center gap-2"
                  style={{ color: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="truncate" title={currentPath}>
                    {currentPath}
                  </span>
                </div>
                <div style={{ borderBottom: '1px solid var(--border)' }} className="my-1" />
              </>
            )}

            {/* Recent folders */}
            {recentFolders.length > 0 && (
              <>
                <div
                  className="px-3 py-1.5 text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Recent Projects
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {recentFolders
                    .filter((path) => path !== currentPath)
                    .map((path) => (
                      <button
                        type="button"
                        key={path}
                        onClick={() => handleRecentFolderClick(path)}
                        className="w-full px-3 py-2 text-left text-sm transition-colors flex flex-col gap-0.5 hover:bg-[var(--bg-primary)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span className="font-medium truncate flex items-center gap-2">
                          <Folder className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                          {getFolderName(path)}
                        </span>
                        <span className="text-xs truncate pl-6" style={{ color: 'var(--text-secondary)' }}>
                          {path}
                        </span>
                      </button>
                    ))}
                </div>
                <div style={{ borderBottom: '1px solid var(--border)' }} className="my-1" />
              </>
            )}

            {/* Open folder button */}
            <button
              type="button"
              onClick={handleOpenFolderClick}
              className="w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 hover:bg-[var(--bg-primary)]"
              style={{ color: 'var(--text-primary)' }}
            >
              <FolderOpen className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              Open Folder...
            </button>
          </div>
        )}
      </div>

      {/* File Picker Modal */}
      {showFilePicker && (
        <FilePickerModal
          mode="folder"
          onSelect={handleFilePickerSelect}
          onCancel={() => setShowFilePicker(false)}
          initialPath={currentPath ?? '/home'}
          title="Open Project Folder"
        />
      )}
    </>
  );
}
