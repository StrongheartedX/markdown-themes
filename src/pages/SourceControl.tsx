import { Link } from 'react-router-dom';

export function SourceControl() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2
          className="text-xl font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Source Control
        </h2>
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          Coming soon - Git integration and version control
        </p>
        <Link
          to="/"
          className="text-sm underline"
          style={{ color: 'var(--accent)' }}
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
