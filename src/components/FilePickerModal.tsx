import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchFileTree, type FileTreeNode } from '../lib/api';
import { useAppStore } from '../hooks/useAppStore';

export interface FilePickerModalProps {
  mode: 'file' | 'folder' | 'both';
  onSelect: (path: string) => void;
  onCancel: () => void;
  initialPath?: string;
  filter?: string[]; // e.g., ['.md', '.txt']
  title?: string;
}

interface BreadcrumbSegment {
  name: string;
  path: string;
}

export function FilePickerModal({
  mode,
  onSelect,
  onCancel,
  initialPath,
  filter,
  title,
}: FilePickerModalProps) {
  const { state: appState } = useAppStore();
  const [currentPath, setCurrentPath] = useState(initialPath ?? '/home');
  const [entries, setEntries] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Fetch directory contents
  const fetchDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSearchQuery('');
    setSelectedIndex(0);
    setSelectedPath(null);

    try {
      const tree = await fetchFileTree(path, 1, false);
      const children = tree.children ?? [];
      // Sort: directories first, then alphabetically
      const sorted = [...children].sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchDirectory(currentPath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter entries based on mode and file extension filter
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Filter by mode
    if (mode === 'file') {
      // Show all directories (for navigation) and files
      result = result;
    } else if (mode === 'folder') {
      // Show only directories
      result = result.filter((e) => e.type === 'directory');
    }
    // mode === 'both' shows everything

    // Apply file extension filter
    if (filter && filter.length > 0) {
      result = result.filter((e) => {
        if (e.type === 'directory') return true;
        return filter.some((ext) => e.name.toLowerCase().endsWith(ext.toLowerCase()));
      });
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(query));
    }

    return result;
  }, [entries, mode, filter, searchQuery]);

  // Reset selected index when filtered entries change
  useEffect(() => {
    setSelectedIndex(0);
    setSelectedPath(null);
  }, [filteredEntries]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedItem = itemRefs.current.get(selectedIndex);
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Build breadcrumb segments
  const breadcrumbs = useMemo((): BreadcrumbSegment[] => {
    const segments = currentPath.split('/').filter(Boolean);
    const crumbs: BreadcrumbSegment[] = [{ name: '/', path: '/' }];
    let accumulated = '';
    for (const seg of segments) {
      accumulated += '/' + seg;
      crumbs.push({ name: seg, path: accumulated });
    }
    return crumbs;
  }, [currentPath]);

  // Handle item click
  const handleItemClick = (entry: FileTreeNode) => {
    if (entry.type === 'directory') {
      // Navigate into directory
      fetchDirectory(entry.path);
    } else {
      // Select file
      setSelectedPath(entry.path);
    }
  };

  // Handle item double-click
  const handleItemDoubleClick = (entry: FileTreeNode) => {
    if (entry.type === 'directory') {
      if (mode === 'folder' || mode === 'both') {
        onSelect(entry.path);
      } else {
        fetchDirectory(entry.path);
      }
    } else {
      if (mode === 'file' || mode === 'both') {
        onSelect(entry.path);
      }
    }
  };

  // Handle select button
  const handleSelect = () => {
    if (mode === 'folder') {
      onSelect(currentPath);
    } else if (selectedPath) {
      onSelect(selectedPath);
    } else if (mode === 'both') {
      // In 'both' mode, selecting without a file selected returns the folder
      onSelect(currentPath);
    }
  };

  // Can we select with current state?
  const canSelect = mode === 'folder' || mode === 'both' || selectedPath !== null;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredEntries.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredEntries[selectedIndex]) {
            const entry = filteredEntries[selectedIndex];
            if (entry.type === 'directory') {
              if (e.shiftKey && (mode === 'folder' || mode === 'both')) {
                onSelect(entry.path);
              } else {
                fetchDirectory(entry.path);
              }
            } else {
              onSelect(entry.path);
            }
          }
          break;
        case 'Backspace':
          // Navigate up if search is empty
          if (!searchQuery && currentPath !== '/') {
            e.preventDefault();
            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
            fetchDirectory(parentPath);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;
      }
    },
    [filteredEntries, selectedIndex, searchQuery, currentPath, mode, onSelect, onCancel, fetchDirectory]
  );

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Get modal title
  const modalTitle = title ?? (mode === 'folder' ? 'Select Folder' : mode === 'file' ? 'Select File' : 'Select File or Folder');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-xl flex flex-col shadow-xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            {modalTitle}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Recent locations */}
        {appState.recentFolders.length > 0 && (
          <div
            className="px-4 py-2 flex items-center gap-2 text-xs overflow-x-auto"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }} className="shrink-0">Recent:</span>
            {appState.recentFolders.slice(0, 4).map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => fetchDirectory(folder)}
                className="px-2 py-1 text-xs rounded truncate max-w-[150px] transition-colors"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
                title={folder}
              >
                {folder.split('/').pop() || folder}
              </button>
            ))}
          </div>
        )}

        {/* Breadcrumb */}
        <div
          className="px-4 py-2 flex items-center gap-1 text-sm overflow-x-auto"
          style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-1 shrink-0">
              {index > 0 && <ChevronRightIcon className="w-3 h-3" />}
              <button
                type="button"
                onClick={() => fetchDirectory(crumb.path)}
                className="hover:underline transition-colors"
                style={{ color: index === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = index === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)';
                }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span style={{ color: 'var(--text-secondary)' }}>Loading...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <span style={{ color: 'var(--text-secondary)' }}>{error}</span>
              <button
                type="button"
                onClick={() => fetchDirectory(currentPath)}
                className="mt-2 text-sm hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Retry
              </button>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span style={{ color: 'var(--text-secondary)' }}>
                {searchQuery ? 'No matches found' : 'Empty directory'}
              </span>
            </div>
          ) : (
            <div className="py-1">
              {filteredEntries.map((entry, index) => {
                const isDirectory = entry.type === 'directory';
                const isSelected = index === selectedIndex;
                const isFileSelected = entry.path === selectedPath;

                return (
                  <button
                    key={entry.path}
                    ref={(el) => {
                      if (el) itemRefs.current.set(index, el);
                      else itemRefs.current.delete(index);
                    }}
                    type="button"
                    onClick={() => {
                      setSelectedIndex(index);
                      handleItemClick(entry);
                    }}
                    onDoubleClick={() => handleItemDoubleClick(entry)}
                    className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors"
                    style={{
                      backgroundColor: isFileSelected
                        ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                        : isSelected
                          ? 'var(--bg-secondary)'
                          : 'transparent',
                      color: isFileSelected ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isFileSelected) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isFileSelected && !isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      } else if (isSelected && !isFileSelected) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      }
                    }}
                  >
                    {isDirectory ? (
                      <FolderIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    ) : (
                      <FileIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    )}
                    <span className="truncate">{entry.name}</span>
                    {isDirectory && (
                      <ChevronRightIcon className="w-3 h-3 ml-auto shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'folder' ? (
              <span>Current: {currentPath}</span>
            ) : selectedPath ? (
              <span className="truncate max-w-[300px] block">{selectedPath}</span>
            ) : (
              <span>Arrow keys to navigate, Enter to select</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary px-4 py-1.5 text-sm"
              style={{ borderRadius: 'var(--radius)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSelect}
              disabled={!canSelect}
              className="btn-accent px-4 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderRadius: 'var(--radius)' }}
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function SearchIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function ChevronRightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function FolderIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function FileIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
