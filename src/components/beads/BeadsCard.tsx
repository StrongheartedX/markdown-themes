import { AlertTriangle } from 'lucide-react';
import type { BeadsIssue } from '../../lib/api';

// Priority colors (P0=critical red, P1=orange, P2=yellow, P3=blue, P4=gray)
const PRIORITY_COLORS: Record<number, string> = {
  0: '#ef4444',
  1: '#f97316',
  2: '#eab308',
  3: '#3b82f6',
  4: '#6b7280',
};

// Issue type badge colors
const TYPE_COLORS: Record<string, string> = {
  bug: '#ef4444',
  feature: '#8b5cf6',
  task: 'var(--accent)',
  epic: '#f59e0b',
};

interface BeadsCardProps {
  issue: BeadsIssue;
  blockedByIds?: string[];
  onSelect?: (issue: BeadsIssue) => void;
}

export function BeadsCard({ issue, blockedByIds, onSelect }: BeadsCardProps) {
  const priorityColor = PRIORITY_COLORS[issue.priority] ?? PRIORITY_COLORS[4];
  const typeColor = (issue.issue_type ? TYPE_COLORS[issue.issue_type] : undefined) ?? 'var(--text-secondary)';
  const displayLabels = (issue.labels ?? []).filter(l => l !== 'ready').slice(0, 3);

  return (
    <div
      className="beads-card"
      onClick={() => onSelect?.(issue)}
      title={issue.title}
      style={{ borderLeftColor: priorityColor }}
    >
      {/* Header: type badge + priority */}
      <div className="flex items-center justify-between gap-1 mb-1">
        {issue.issue_type && (
          <span
            className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              color: typeColor,
              backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
            }}
          >
            {issue.issue_type}
          </span>
        )}
        <span
          className="text-[9px] font-bold opacity-50 flex-shrink-0"
          style={{ color: priorityColor }}
        >
          P{issue.priority}
        </span>
      </div>

      {/* Title (2-line clamp) */}
      <p
        className="text-sm font-medium leading-snug"
        style={{
          color: 'var(--text-primary)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {issue.title}
      </p>

      {/* Bottom row: labels + blocked indicator */}
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {displayLabels.map((label) => (
          <span key={label} className="beads-card-label">
            {label}
          </span>
        ))}
        {blockedByIds && blockedByIds.length > 0 && (
          <span
            className="flex items-center gap-0.5 text-[10px]"
            style={{ color: '#f97316' }}
            title={`Blocked by: ${blockedByIds.join(', ')}`}
          >
            <AlertTriangle size={10} />
            {blockedByIds.length}
          </span>
        )}
      </div>
    </div>
  );
}
