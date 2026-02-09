import { ChevronLeft, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { BeadsIssue } from '../../lib/api';

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'P0 Critical', color: '#ef4444' },
  1: { label: 'P1 High', color: '#f97316' },
  2: { label: 'P2 Medium', color: '#eab308' },
  3: { label: 'P3 Low', color: '#3b82f6' },
  4: { label: 'P4 Backlog', color: '#6b7280' },
};

const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6',
  in_progress: '#f59e0b',
  closed: '#22c55e',
};

interface BeadsDetailProps {
  issue: BeadsIssue;
  onBack?: () => void;
  fontSize?: number;
}

export function BeadsDetail({ issue, onBack, fontSize = 100 }: BeadsDetailProps) {
  const [copied, setCopied] = useState(false);
  const scale = fontSize / 100;
  const priority = PRIORITY_LABELS[issue.priority] ?? PRIORITY_LABELS[4];
  const statusColor = STATUS_COLORS[issue.status] ?? 'var(--text-secondary)';

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(issue.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="h-full flex flex-col" style={{ fontSize: `${scale}rem` }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            title="Back to board"
          >
            <ChevronLeft size={16} />
            <span>Board</span>
          </button>
        )}
        <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {issue.title}
        </span>
        <button
          onClick={handleCopyId}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          title="Copy issue ID"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {issue.id}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        {/* Meta badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{
              color: statusColor,
              backgroundColor: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
            }}
          >
            {issue.status.replace('_', ' ')}
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{
              color: priority.color,
              backgroundColor: `color-mix(in srgb, ${priority.color} 15%, transparent)`,
            }}
          >
            {priority.label}
          </span>
          {issue.issue_type && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded uppercase tracking-wider"
              style={{
                color: 'var(--accent)',
                backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              }}
            >
              {issue.issue_type}
            </span>
          )}
          {(issue.labels ?? []).map((label) => (
            <span
              key={label}
              className="text-xs px-2 py-0.5 rounded"
              style={{
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Description */}
        {issue.description && (
          <Section title="Description">
            <MarkdownBlock content={issue.description} />
          </Section>
        )}

        {/* Design */}
        {issue.design && (
          <Section title="Design">
            <MarkdownBlock content={issue.design} />
          </Section>
        )}

        {/* Notes */}
        {issue.notes && (
          <Section title="Notes">
            <MarkdownBlock content={issue.notes} />
          </Section>
        )}

        {/* Close reason */}
        {issue.close_reason && (
          <Section title="Close Reason">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{issue.close_reason}</p>
          </Section>
        )}

        {/* Timestamps */}
        <div
          className="text-xs space-y-1 pt-2 border-t"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          {issue.created_at && <p>Created: {formatDate(issue.created_at)}</p>}
          {issue.updated_at && <p>Updated: {formatDate(issue.updated_at)}</p>}
          {issue.closed_at && <p>Closed: {formatDate(issue.closed_at)}</p>}
          {issue.owner && <p>Owner: {issue.owner}</p>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-1.5"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Render markdown-ish content as preformatted text with basic styling */
function MarkdownBlock({ content }: { content: string }) {
  return (
    <pre
      className="text-sm whitespace-pre-wrap break-words leading-relaxed"
      style={{
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '0.75rem',
        margin: 0,
      }}
    >
      {content}
    </pre>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
