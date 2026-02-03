import { Link } from 'react-router-dom';

export function Prompts() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2
          className="text-xl font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Prompt Notebook
        </h2>
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          Coming soon - Organize and manage your AI prompts
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
