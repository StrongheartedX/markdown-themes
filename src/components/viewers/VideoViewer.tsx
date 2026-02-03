import { useState, useEffect } from 'react';

interface VideoViewerProps {
  filePath: string;
  fontSize?: number;
}

const API_BASE = 'http://localhost:8129';

export function VideoViewer({ filePath, fontSize = 100 }: VideoViewerProps) {
  const [error, setError] = useState<string | null>(null);

  const videoUrl = `${API_BASE}/api/files/content?path=${encodeURIComponent(filePath)}&raw=true`;
  const fileName = filePath.split('/').pop() || 'Video file';

  useEffect(() => {
    // Reset state when file changes
    setError(null);
  }, [filePath]);

  const handleError = () => {
    setError('Failed to load video file');
  };

  if (error) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div
      className="video-viewer h-full flex flex-col"
      style={{
        backgroundColor: 'var(--bg-primary)',
        zoom: fontSize / 100,
      }}
    >
      {/* Toolbar with file name */}
      <div
        className="px-4 py-2 flex items-center border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <h2
          className="text-sm font-medium truncate"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
          title={fileName}
        >
          {fileName}
        </h2>
      </div>

      {/* Video container */}
      <div className="flex-1 flex items-center justify-center p-4">
        <video
          key={filePath}
          src={videoUrl}
          controls
          className="max-w-full max-h-full"
          style={{
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--bg-secondary)',
          }}
          onError={handleError}
        />
      </div>
    </div>
  );
}
