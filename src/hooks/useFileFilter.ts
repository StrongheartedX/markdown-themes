import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FileTreeNode } from '../context/WorkspaceContext';
import { fetchFileTree, type FileTreeNode as APIFileTreeNode } from '../lib/api';
import { FILTERS, filterFiles, countMatches, type FilterId, type FileScope } from '../lib/filters';

/**
 * A scoped file tree node - wraps regular nodes with scope information
 */
export interface ScopedFileTreeNode extends FileTreeNode {
  /** The scope this file belongs to */
  scope?: FileScope;
  /** Whether this is a scope header node (virtual node for "Project" or "User (~)") */
  isScopeHeader?: boolean;
}

interface UseFileFilterResult {
  /** Currently active filter ID, or null if no filter is active */
  activeFilter: FilterId | null;
  /** Apply a predefined filter by ID */
  setFilter: (filterId: FilterId | null) => void;
  /** Clear the active filter (show all files) */
  clearFilter: () => void;
  /** The filtered file tree (or original if no filter active) */
  filteredFiles: ScopedFileTreeNode[];
  /** Number of files matching the current filter in project scope */
  projectMatchCount: number;
  /** Number of files matching the current filter in user scope */
  userMatchCount: number;
  /** Total number of files matching the current filter */
  matchCount: number;
  /** Whether a filter is currently active */
  isFiltered: boolean;
  /** Whether home files are currently loading */
  homeLoading: boolean;
}

interface UseFileFilterOptions {
  /** The project file tree */
  files: FileTreeNode[];
  /** The user's home directory path (e.g., "/home/marci") */
  homePath?: string;
}

// Files/folders to exclude from the tree
const excludedNames = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.DS_Store',
  'Thumbs.db',
  '.idea',
  '.vscode',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
]);

function shouldIncludeForFilter(name: string, allowedHiddenNames: Set<string>): boolean {
  if (excludedNames.has(name)) {
    return false;
  }
  if (name.startsWith('.')) {
    return allowedHiddenNames.has(name);
  }
  return true;
}

/**
 * Convert API file tree to our format
 */
function convertApiTree(node: APIFileTreeNode, allowedHiddenNames: Set<string>): FileTreeNode | null {
  if (!shouldIncludeForFilter(node.name, allowedHiddenNames)) {
    return null;
  }

  if (node.type === 'directory') {
    const children = (node.children || [])
      .map((child) => convertApiTree(child, allowedHiddenNames))
      .filter((child): child is FileTreeNode => child !== null);

    if (children.length > 0) {
      return {
        name: node.name,
        path: node.path,
        isDirectory: true,
        children,
      };
    }
    return null;
  } else {
    return {
      name: node.name,
      path: node.path,
      isDirectory: false,
    };
  }
}

/**
 * Sort nodes: directories first, then files, both alphabetically
 */
function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortTree(node.children) : undefined,
    }))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Create a scope header node
 */
function createScopeHeader(scope: FileScope, children: FileTreeNode[]): ScopedFileTreeNode {
  const label = scope === 'project' ? 'Project' : 'User (~)';
  return {
    name: label,
    path: `__scope__${scope}`,
    isDirectory: true,
    children,
    scope,
    isScopeHeader: true,
  };
}

/**
 * Tag all nodes in a tree with a scope
 */
function tagWithScope(nodes: FileTreeNode[], scope: FileScope): ScopedFileTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    scope,
    children: node.children ? tagWithScope(node.children, scope) : undefined,
  }));
}

/**
 * Hook for managing file filter state in the Sidebar.
 * Supports merging files from both project and home directories.
 *
 * @param options - Filter options including files and homePath
 * @returns Filter state and actions
 */
export function useFileFilter({ files, homePath }: UseFileFilterOptions): UseFileFilterResult {
  const [activeFilter, setActiveFilter] = useState<FilterId | null>(null);
  const [homeFiles, setHomeFiles] = useState<FileTreeNode[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);

  const setFilter = useCallback((filterId: FilterId | null) => {
    setActiveFilter(filterId);
  }, []);

  const clearFilter = useCallback(() => {
    setActiveFilter(null);
  }, []);

  const activeFilterDef = useMemo(
    () => FILTERS.find((f) => f.id === activeFilter) ?? null,
    [activeFilter]
  );

  // Fetch home directory files when filter with homePaths is active
  useEffect(() => {
    if (!activeFilterDef?.homePaths || !homePath) {
      setHomeFiles([]);
      return;
    }

    const fetchHomeFiles = async () => {
      setHomeLoading(true);
      const allHomeFiles: FileTreeNode[] = [];

      // Build allowed hidden names set from filter patterns
      const allowedHiddenNames = new Set<string>();
      for (const pattern of activeFilterDef.patterns) {
        if (pattern.endsWith('/')) {
          allowedHiddenNames.add(pattern.slice(0, -1));
        } else if (pattern.startsWith('.')) {
          // For extension patterns, we need to allow any file with that extension
          // This is handled by the filter function, not here
        }
      }
      // Also add the home paths as allowed
      // Guard against race condition where activeFilterDef might change
      if (!activeFilterDef.homePaths) {
        setHomeLoading(false);
        return;
      }
      for (const relPath of activeFilterDef.homePaths.relativePaths) {
        allowedHiddenNames.add(relPath);
      }

      for (const relativePath of activeFilterDef.homePaths.relativePaths) {
        const fullPath = `${homePath}/${relativePath}`;
        try {
          const apiTree = await fetchFileTree(fullPath, 5, true);
          const converted = convertApiTree(apiTree, allowedHiddenNames);
          if (converted?.children) {
            allHomeFiles.push(...converted.children);
          } else if (converted && !converted.isDirectory) {
            allHomeFiles.push(converted);
          }
        } catch (err) {
          // Directory might not exist - that's OK
          const message = err instanceof Error ? err.message : '';
          if (!message.includes('ENOENT') && !message.includes('not found') && !message.includes('does not exist')) {
            console.warn(`Failed to fetch home files from ${fullPath}:`, err);
          }
        }
      }

      setHomeFiles(sortTree(allHomeFiles));
      setHomeLoading(false);
    };

    fetchHomeFiles();
  }, [activeFilterDef, homePath]);

  // Filter project files
  const filteredProjectFiles = useMemo(() => {
    if (!activeFilterDef) {
      return files;
    }
    return filterFiles(files, activeFilterDef.patterns);
  }, [files, activeFilterDef]);

  // Filter home files (already filtered by fetch, but apply pattern filter for safety)
  const filteredHomeFiles = useMemo(() => {
    if (!activeFilterDef || homeFiles.length === 0) {
      return [];
    }
    return filterFiles(homeFiles, activeFilterDef.patterns);
  }, [homeFiles, activeFilterDef]);

  // Merge into scoped tree when filter is active and has home paths
  const filteredFiles = useMemo((): ScopedFileTreeNode[] => {
    if (!activeFilterDef) {
      return files;
    }

    // If filter doesn't have home paths, just return filtered project files
    if (!activeFilterDef.homePaths) {
      return filteredProjectFiles;
    }

    const result: ScopedFileTreeNode[] = [];

    // Add project scope if has files
    if (filteredProjectFiles.length > 0) {
      result.push(createScopeHeader('project', tagWithScope(filteredProjectFiles, 'project')));
    }

    // Add user scope if has files
    if (filteredHomeFiles.length > 0) {
      result.push(createScopeHeader('user', tagWithScope(filteredHomeFiles, 'user')));
    }

    return result;
  }, [activeFilterDef, filteredProjectFiles, filteredHomeFiles]);

  const projectMatchCount = useMemo(() => {
    if (!activeFilterDef) {
      return 0;
    }
    return countMatches(files, activeFilterDef.patterns);
  }, [files, activeFilterDef]);

  const userMatchCount = useMemo(() => {
    if (!activeFilterDef || homeFiles.length === 0) {
      return 0;
    }
    return countMatches(homeFiles, activeFilterDef.patterns);
  }, [homeFiles, activeFilterDef]);

  return {
    activeFilter,
    setFilter,
    clearFilter,
    filteredFiles,
    projectMatchCount,
    userMatchCount,
    matchCount: projectMatchCount + userMatchCount,
    isFiltered: activeFilter !== null,
    homeLoading,
  };
}
