import { useState } from 'react';
import { type Frontmatter, formatDate } from '../utils/frontmatter';

interface MetadataBarProps {
  frontmatter: Frontmatter;
}

export function MetadataBar({ frontmatter }: MetadataBarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { title, model, type, date, tags } = frontmatter;
  const formattedDate = formatDate(date);

  // Don't render if no meaningful metadata
  if (!title && !model && !type && !date && (!tags || tags.length === 0)) {
    return null;
  }

  if (isCollapsed) {
    return (
      <div className="metadata-bar metadata-bar-collapsed">
        <button
          onClick={() => setIsCollapsed(false)}
          className="metadata-toggle"
          aria-label="Expand metadata"
        >
          <ChevronDownIcon />
          {title && <span className="metadata-title-collapsed">{title}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="metadata-bar">
      <div className="metadata-content">
        <div className="metadata-row metadata-main">
          {title && (
            <div className="metadata-item metadata-title">
              <DocumentIcon />
              <span>{title}</span>
            </div>
          )}

          <div className="metadata-details">
            {model && (
              <div className="metadata-item">
                <ModelIcon />
                <span>{model}</span>
              </div>
            )}

            {type && (
              <div className="metadata-item">
                <TypeIcon />
                <span>{type}</span>
              </div>
            )}

            {formattedDate && (
              <div className="metadata-item">
                <CalendarIcon />
                <span>{formattedDate}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsCollapsed(true)}
            className="metadata-toggle"
            aria-label="Collapse metadata"
          >
            <ChevronUpIcon />
          </button>
        </div>

        {tags && tags.length > 0 && (
          <div className="metadata-row metadata-tags">
            {tags.map((tag, index) => (
              <span key={index} className="metadata-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Simple SVG icons
function DocumentIcon() {
  return (
    <svg className="metadata-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}

function ModelIcon() {
  return (
    <svg className="metadata-icon" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg className="metadata-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="metadata-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg className="metadata-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="metadata-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}
