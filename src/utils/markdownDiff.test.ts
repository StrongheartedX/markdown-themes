import { describe, it, expect } from 'vitest';
import { findFirstChangedBlock, getScrollPercentage, findFirstChangedLine } from './markdownDiff';

describe('findFirstChangedBlock', () => {
  it('returns -1 when content is identical', () => {
    const content = '# Hello\n\nWorld';
    const result = findFirstChangedBlock(content, content);
    expect(result.firstChangedBlock).toBe(-1);
  });

  it('detects change in first block', () => {
    const old = '# Hello\n\nWorld';
    const newContent = '# Hello World\n\nWorld';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(0);
  });

  it('detects change in second block', () => {
    const old = '# Hello\n\nWorld';
    const newContent = '# Hello\n\nWorld!';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(1);
  });

  it('detects added block at end', () => {
    const old = '# Hello\n\nWorld';
    const newContent = '# Hello\n\nWorld\n\nNew paragraph';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(2);
    expect(result.isAddition).toBe(true);
  });

  it('detects deleted block at end', () => {
    const old = '# Hello\n\nWorld\n\nExtra';
    const newContent = '# Hello\n\nWorld';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(1); // Last block of new content
    expect(result.isAddition).toBe(false);
  });

  it('handles code blocks as single blocks', () => {
    const old = '# Hello\n\n```js\nconst x = 1;\n```\n\nWorld';
    const newContent = '# Hello\n\n```js\nconst x = 2;\n```\n\nWorld';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(1); // Code block is block 1
  });

  it('handles empty old content', () => {
    const result = findFirstChangedBlock('', '# Hello');
    expect(result.firstChangedBlock).toBe(0);
    expect(result.isAddition).toBe(true);
  });

  it('handles empty new content', () => {
    const result = findFirstChangedBlock('# Hello', '');
    expect(result.totalBlocks).toBe(0);
  });
});

describe('getScrollPercentage', () => {
  it('returns -1 when no change', () => {
    const result = getScrollPercentage({
      firstChangedBlock: -1,
      totalBlocks: 5,
      charOffset: 0,
      isAddition: false,
    });
    expect(result).toBe(-1);
  });

  it('returns 0 for first block change', () => {
    const result = getScrollPercentage({
      firstChangedBlock: 0,
      totalBlocks: 5,
      charOffset: 0,
      isAddition: true,
    });
    expect(result).toBe(0);
  });

  it('returns correct percentage for middle block', () => {
    const result = getScrollPercentage({
      firstChangedBlock: 2,
      totalBlocks: 4,
      charOffset: 100,
      isAddition: true,
    });
    expect(result).toBe(0.5);
  });

  it('returns percentage close to 1 for last block', () => {
    const result = getScrollPercentage({
      firstChangedBlock: 4,
      totalBlocks: 5,
      charOffset: 400,
      isAddition: true,
    });
    expect(result).toBe(0.8);
  });
});

describe('findFirstChangedLine', () => {
  it('returns -1 when content is identical', () => {
    const content = 'const x = 1;\nconst y = 2;';
    const result = findFirstChangedLine(content, content);
    expect(result.firstChangedLine).toBe(-1);
  });

  it('detects change in first line', () => {
    const old = 'const x = 1;\nconst y = 2;';
    const newContent = 'const x = 100;\nconst y = 2;';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(1);
  });

  it('detects change in second line', () => {
    const old = 'const x = 1;\nconst y = 2;';
    const newContent = 'const x = 1;\nconst y = 200;';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(2);
  });

  it('detects change in middle of file', () => {
    const old = 'line1\nline2\nline3\nline4\nline5';
    const newContent = 'line1\nline2\nline3-modified\nline4\nline5';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(3);
  });

  it('detects added line at end', () => {
    const old = 'line1\nline2';
    const newContent = 'line1\nline2\nline3';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(3);
    expect(result.isAddition).toBe(true);
  });

  it('detects deleted line at end', () => {
    const old = 'line1\nline2\nline3';
    const newContent = 'line1\nline2';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(2);
    expect(result.isAddition).toBe(false);
  });

  it('handles empty old content', () => {
    const result = findFirstChangedLine('', 'line1\nline2');
    expect(result.firstChangedLine).toBe(1);
    expect(result.isAddition).toBe(true);
  });

  it('handles empty new content', () => {
    const result = findFirstChangedLine('line1\nline2', '');
    expect(result.totalLines).toBe(1); // empty string splits to ['']
    expect(result.firstChangedLine).toBe(1);
  });

  it('handles Windows line endings', () => {
    const old = 'line1\r\nline2';
    const newContent = 'line1\r\nline2-modified';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(2);
  });

  it('returns correct total lines', () => {
    const old = 'line1\nline2';
    const newContent = 'line1\nline2\nline3\nline4';
    const result = findFirstChangedLine(old, newContent);
    expect(result.totalLines).toBe(4);
  });
});
