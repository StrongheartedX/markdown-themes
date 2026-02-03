import { Download, Upload, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { BulkOperationProgress, BulkOperationType } from '../../hooks/useBulkGitOperations';

interface BulkActionsBarProps {
  repoCount: number;
  onFetchAll: () => void;
  onPullAll: () => void;
  onPushAll: () => void;
  progress: BulkOperationProgress | null;
  isRunning: boolean;
}

const operationLabels: Record<BulkOperationType, string> = {
  fetch: 'Fetching',
  pull: 'Pulling',
  push: 'Pushing',
};

export function BulkActionsBar({
  repoCount,
  onFetchAll,
  onPullAll,
  onPushAll,
  progress,
  isRunning,
}: BulkActionsBarProps) {
  const successCount = progress?.results.filter((r) => r.success).length ?? 0;
  const failedCount = progress?.results.filter((r) => !r.success).length ?? 0;
  const failedRepos = progress?.results.filter((r) => !r.success) ?? [];

  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)',
      }}
    >
      {/* Actions row */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {repoCount} repo{repoCount !== 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onFetchAll}
            disabled={isRunning}
            className="min-w-[100px] h-10 px-4 flex items-center justify-center gap-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            title="Fetch from remote for all repos"
          >
            <RefreshCw
              className={`w-5 h-5 ${isRunning && progress?.operation === 'fetch' ? 'animate-spin' : ''}`}
            />
            Fetch All
          </button>

          <button
            onClick={onPullAll}
            disabled={isRunning}
            className="min-w-[100px] h-10 px-4 flex items-center justify-center gap-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            title="Pull changes for all repos"
          >
            <Download
              className={`w-5 h-5 ${isRunning && progress?.operation === 'pull' ? 'animate-bounce' : ''}`}
            />
            Pull All
          </button>

          <button
            onClick={onPushAll}
            disabled={isRunning}
            className="min-w-[100px] h-10 px-4 flex items-center justify-center gap-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            title="Push changes for all repos"
          >
            <Upload
              className={`w-5 h-5 ${isRunning && progress?.operation === 'push' ? 'animate-bounce' : ''}`}
            />
            Push All
          </button>
        </div>
      </div>

      {/* Progress row */}
      {progress && (
        <div className="flex flex-col gap-2">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
            ) : failedCount > 0 ? (
              <AlertCircle className="w-4 h-4" style={{ color: '#f87171' }} />
            ) : (
              <CheckCircle className="w-4 h-4" style={{ color: '#34d399' }} />
            )}
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isRunning
                ? `${operationLabels[progress.operation]} ${progress.completed}/${progress.total} repos...`
                : `${operationLabels[progress.operation]} complete: ${successCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}`}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                  backgroundColor:
                    failedCount > 0 && !isRunning ? '#eab308' : 'var(--accent)',
                }}
              />
            </div>
          </div>

          {/* Failed repos list */}
          {failedRepos.length > 0 && !isRunning && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span style={{ color: '#f87171' }}>Failed:</span>
              {failedRepos.map((r) => (
                <span
                  key={r.repoName}
                  className="px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)',
                    color: '#f87171',
                  }}
                  title={r.error}
                >
                  {r.repoName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
