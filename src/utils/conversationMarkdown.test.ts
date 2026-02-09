import { describe, it, expect } from 'vitest';
import { jsonlToMarkdown } from './conversationMarkdown';

describe('jsonlToMarkdown', () => {
  describe('basic parsing', () => {
    it('returns empty string for empty input', () => {
      expect(jsonlToMarkdown('')).toBe('');
    });

    it('returns empty string for null/undefined input', () => {
      expect(jsonlToMarkdown(null as unknown as string)).toBe('');
      expect(jsonlToMarkdown(undefined as unknown as string)).toBe('');
    });

    it('returns empty string when no valid entries', () => {
      expect(jsonlToMarkdown('invalid json\nalso invalid')).toBe('');
    });

    it('skips non-user/assistant/summary entries', () => {
      const input = `{"type":"system","message":"ignored"}
{"type":"user","message":{"content":"Hello"}}`;
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<div class="user-prompt">');
      expect(result).toContain('Hello');
    });

    it('handles malformed JSON lines gracefully', () => {
      const input = `{"type":"user","message":{"content":"Before"}}
{malformed json here
{"type":"user","message":{"content":"After"}}`;
      const result = jsonlToMarkdown(input);
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });
  });

  describe('user messages', () => {
    it('formats user message in styled div', () => {
      const input = '{"type":"user","message":{"content":"What is the bug?"}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<div class="user-prompt">');
      expect(result).toContain('What is the bug?');
      expect(result).toContain('</div>');
      expect(result).not.toContain('## User');
    });

    it('formats user message with array content', () => {
      const input = '{"type":"user","message":{"content":[{"type":"text","text":"First part"},{"type":"text","text":"Second part"}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<div class="user-prompt">');
      expect(result).toContain('First part');
      expect(result).toContain('Second part');
    });

    it('preserves markdown in user message', () => {
      const input = '{"type":"user","message":{"content":"# Heading\\n\\n- Item 1\\n- Item 2"}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('# Heading');
      expect(result).toContain('- Item 1');
    });
  });

  describe('assistant messages', () => {
    it('formats assistant message without header', () => {
      const input = '{"type":"assistant","message":{"content":"Here is the answer."}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('Here is the answer.');
      expect(result).not.toContain('## Assistant');
    });

    it('formats assistant message with text block', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"text","text":"Looking at the code..."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('Looking at the code...');
      expect(result).not.toContain('## Assistant');
    });

    it('formats multiple text blocks', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"text","text":"First"},{"type":"text","text":"Second"}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });
  });

  describe('thinking blocks', () => {
    it('formats thinking block as collapsed details element', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Let me analyze this..."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details>');
      expect(result).toContain('<summary>Thinking</summary>');
      expect(result).toContain('Let me analyze this...');
      expect(result).toContain('</details>');
      // Should NOT be open — IntersectionObserver handles expansion
      expect(result).not.toContain('<details open>');
    });

    it('formats mixed text and thinking blocks', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Hmm..."},{"type":"text","text":"The answer is 42."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details>');
      expect(result).toContain('Hmm...');
      expect(result).toContain('The answer is 42.');
    });

    it('all thinking blocks start collapsed', () => {
      const input = `{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"First thought"}]}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Second thought"}]}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Third thought"}]}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Fourth thought"}]}}`;
      const result = jsonlToMarkdown(input);

      // All thinking blocks should be collapsed (no open attribute)
      expect(result).not.toContain('<details open>');
      // But all should exist
      const detailsCount = (result.match(/<details>/g) || []).length;
      expect(detailsCount).toBe(4);
    });
  });

  describe('tool_use blocks', () => {
    it('formats tool_use block as collapsible details', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"read_file","input":{"path":"/test.ts"}}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details class="tool-use-block">');
      expect(result).toContain('<summary>Tool: read_file</summary>');
      expect(result).toContain('```json');
      expect(result).toContain('"path": "/test.ts"');
      expect(result).not.toContain('### Tool:');
    });

    it('formats tool_use with complex input', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"edit_file","input":{"path":"/test.ts","changes":[{"line":1,"content":"new"}]}}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<summary>Tool: edit_file</summary>');
      expect(result).toContain('"changes"');
    });
  });

  describe('tool_result blocks', () => {
    it('formats tool_result with string content', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"123","content":"File contents here"}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details>');
      expect(result).toContain('<summary>Tool Result</summary>');
      expect(result).toContain('File contents here');
      expect(result).toContain('</details>');
    });

    it('formats tool_result with array content', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"123","content":[{"text":"Result text"}]}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('Result text');
    });

    it('truncates very long tool results', () => {
      const longContent = 'x'.repeat(3000);
      const input = `{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"123","content":"${longContent}"}]}}`;
      const result = jsonlToMarkdown(input);
      expect(result).toContain('... (truncated)');
      expect(result.length).toBeLessThan(longContent.length);
    });
  });

  describe('summary messages', () => {
    it('formats summary message with horizontal rules', () => {
      const input = '{"type":"summary","summary":"User asked about a bug in the login flow."}';
      const result = jsonlToMarkdown(input);
      expect(result).toBe('---\n\n*Summary: User asked about a bug in the login flow.*\n\n---');
    });
  });

  describe('conversation flow', () => {
    it('separates with --- only before user messages', () => {
      const input = `{"type":"user","message":{"content":"Question"}}
{"type":"assistant","message":{"content":"Answer"}}`;
      const result = jsonlToMarkdown(input);
      // No separator between first user and assistant (separator only BEFORE user, and first user has nothing before it)
      expect(result).not.toContain('---');
      expect(result).toContain('user-prompt');
      expect(result).toContain('Answer');
    });

    it('adds --- separator before second user message', () => {
      const input = `{"type":"user","message":{"content":"First question"}}
{"type":"assistant","message":{"content":"First answer"}}
{"type":"user","message":{"content":"Second question"}}`;
      const result = jsonlToMarkdown(input);

      // Should have exactly one --- separator (before second user message)
      const parts = result.split('\n\n---\n\n');
      expect(parts.length).toBe(2);
    });

    it('handles full conversation with multiple exchanges', () => {
      const input = `{"type":"user","message":{"content":"What is 2+2?"}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Simple math..."},{"type":"text","text":"The answer is 4."}]}}
{"type":"user","message":{"content":"Thanks!"}}
{"type":"assistant","message":{"content":"You're welcome!"}}`;
      const result = jsonlToMarkdown(input);

      expect(result).toContain('user-prompt');
      expect(result).toContain('What is 2+2?');
      expect(result).toContain('<summary>Thinking</summary>');
      expect(result).toContain('The answer is 4.');
      expect(result).toContain('Thanks!');
      expect(result).toContain("You're welcome!");
      expect(result).not.toContain('## Assistant');
      expect(result).not.toContain('## User');

      // Only one --- separator (before second user message)
      const separatorCount = (result.match(/\n\n---\n\n/g) || []).length;
      expect(separatorCount).toBe(1);
    });

    it('no separator between consecutive assistant messages', () => {
      const input = `{"type":"assistant","message":{"content":"First response"}}
{"type":"assistant","message":{"content":"Second response"}}`;
      const result = jsonlToMarkdown(input);
      expect(result).not.toContain('---');
      expect(result).toContain('First response');
      expect(result).toContain('Second response');
    });

    it('handles realistic Claude Code conversation', () => {
      const input = `{"type":"user","message":{"content":"Fix the bug in auth.ts"}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"I need to read the file first..."},{"type":"tool_use","name":"read_file","input":{"path":"src/auth.ts"}}]}}
{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"abc123","content":"export function login() { ... }"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"I found the issue. The login function is missing error handling."}]}}`;

      const result = jsonlToMarkdown(input);

      expect(result).toContain('user-prompt');
      expect(result).toContain('Fix the bug in auth.ts');
      expect(result).toContain('<summary>Thinking</summary>');
      expect(result).toContain('<details class="tool-use-block">');
      expect(result).toContain('<summary>Tool: read_file</summary>');
      expect(result).toContain('<summary>Tool Result</summary>');
      expect(result).toContain('missing error handling');
      expect(result).not.toContain('## Assistant');
      expect(result).not.toContain('### Tool:');
    });
  });
});
