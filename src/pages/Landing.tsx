import { Link } from 'react-router-dom';

export function Landing() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-lg">
        <h1
          className="text-3xl font-bold mb-4"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
        >
          Markdown Themes
        </h1>
        <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
          A themed markdown viewer for AI-assisted writing. Watch Claude edit files in real-time
          with beautiful style guide themes.
        </p>
        <nav className="flex flex-col gap-3">
          <Link
            to="/files"
            className="px-6 py-3 rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg-primary)',
            }}
          >
            Files
          </Link>
          <Link
            to="/source-control"
            className="px-6 py-3 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            Source Control
          </Link>
          <Link
            to="/prompts"
            className="px-6 py-3 rounded-lg border transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            Prompt Notebook
          </Link>
        </nav>
      </div>
    </div>
  );
}
