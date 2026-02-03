/**
 * Frontmatter parsing utility for markdown files
 * Parses YAML frontmatter and returns metadata + content
 */

export interface Frontmatter {
  title?: string;
  model?: string;
  type?: string;
  date?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface ParsedMarkdown {
  frontmatter: Frontmatter | null;
  content: string;
}

/**
 * Parse YAML frontmatter from markdown content
 * Frontmatter must be at the start of the file, delimited by ---
 */
export function parseFrontmatter(markdown: string): ParsedMarkdown {
  if (!markdown || typeof markdown !== 'string') {
    return { frontmatter: null, content: markdown || '' };
  }

  // Match frontmatter: starts with ---, ends with ---, at beginning of file
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, content: markdown };
  }

  const yamlContent = match[1];
  const content = markdown.slice(match[0].length);

  try {
    const frontmatter = parseYaml(yamlContent);
    return { frontmatter, content };
  } catch {
    // If YAML parsing fails, return original content
    return { frontmatter: null, content: markdown };
  }
}

/**
 * Simple YAML parser for frontmatter
 * Handles basic key: value pairs, arrays, and quoted strings
 */
function parseYaml(yaml: string): Frontmatter {
  const result: Frontmatter = {};
  const lines = yaml.split(/\r?\n/);

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    // Match key: value pattern
    const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue] = keyValueMatch;
    const value = rawValue.trim();

    // Handle inline array: [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1);
      result[key] = arrayContent
        .split(',')
        .map(item => item.trim())
        .map(item => stripQuotes(item))
        .filter(item => item.length > 0);
      continue;
    }

    // Handle quoted string
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      result[key] = value.slice(1, -1);
      continue;
    }

    // Handle boolean
    if (value.toLowerCase() === 'true') {
      result[key] = true;
      continue;
    }
    if (value.toLowerCase() === 'false') {
      result[key] = false;
      continue;
    }

    // Handle number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      result[key] = parseFloat(value);
      continue;
    }

    // Handle null/empty
    if (value === '' || value.toLowerCase() === 'null') {
      result[key] = null;
      continue;
    }

    // Default: treat as string
    result[key] = value;
  }

  return result;
}

/**
 * Remove surrounding quotes from a string
 */
function stripQuotes(str: string): string {
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * Format a date string for display
 */
export function formatDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
