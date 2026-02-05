import { useState } from 'react';
import { Archive, Folder, X, Check, Loader2 } from 'lucide-react';
import { FilePickerModal } from './FilePickerModal';
import { archiveConversation, ensureDirectory } from '../lib/api';
import type { ArchivedConversation } from '../context/AppStoreContext';

interface ArchiveModalProps {
  /** The path of the conversation file to archive */
  conversationPath: string;
  /** Current archive location from settings */
  archiveLocation: string;
  /** Callback when archive location is changed */
  onArchiveLocationChange: (location: string) => void;
  /** Callback when archive is successful */
  onArchiveComplete: (archive: ArchivedConversation) => void;
  /** Callback to close the modal */
  onClose: () => void;
}

export function ArchiveModal({
  conversationPath,
  archiveLocation,
  onArchiveLocationChange,
  onArchiveComplete,
  onClose,
}: ArchiveModalProps) {
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [tags, setTags] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileName = conversationPath.split('/').pop() || 'conversation';

  const handleArchive = async () => {
    setIsArchiving(true);
    setError(null);

    try {
      // Ensure the archive directory exists
      await ensureDirectory(archiveLocation);

      // Archive the conversation
      const archivedPath = await archiveConversation(conversationPath, archiveLocation);

      // Parse tags
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Create archive metadata
      const archive: ArchivedConversation = {
        originalPath: conversationPath,
        archivedPath,
        archivedAt: Date.now(),
        tags: tagList.length > 0 ? tagList : undefined,
      };

      // Notify parent
      onArchiveComplete(archive);
      setSuccess(true);

      // Close after a short delay to show success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive conversation');
      setIsArchiving(false);
    }
  };

  const handleFolderSelect = (path: string) => {
    onArchiveLocationChange(path);
    setShowFilePicker(false);
  };

  if (showFilePicker) {
    return (
      <FilePickerModal
        mode="folder"
        onSelect={handleFolderSelect}
        onCancel={() => setShowFilePicker(false)}
        initialPath={archiveLocation}
        title="Select Archive Location"
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md shadow-xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Archive Conversation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            disabled={isArchiving}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Success state */}
          {success && (
            <div
              className="flex items-center gap-2 p-3 rounded"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                color: 'rgb(34, 197, 94)',
              }}
            >
              <Check className="w-5 h-5" />
              <span>Conversation archived successfully!</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              className="p-3 rounded"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'rgb(239, 68, 68)',
              }}
            >
              {error}
            </div>
          )}

          {!success && (
            <>
              {/* File being archived */}
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Conversation
                </label>
                <div
                  className="px-3 py-2 rounded text-sm truncate"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  title={conversationPath}
                >
                  {fileName}
                </div>
              </div>

              {/* Archive location */}
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Archive Location
                </label>
                <div className="flex gap-2">
                  <div
                    className="flex-1 px-3 py-2 rounded text-sm truncate"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    title={archiveLocation}
                  >
                    {archiveLocation}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilePicker(true)}
                    className="px-3 py-2 rounded text-sm flex items-center gap-1 transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    disabled={isArchiving}
                    title="Change archive location"
                  >
                    <Folder className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Tags (optional)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="project, feature, bug-fix..."
                  className="w-full px-3 py-2 text-sm outline-none rounded"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  disabled={isArchiving}
                />
                <p
                  className="text-xs mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Separate multiple tags with commas
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div
            className="flex items-center justify-end gap-2 px-4 py-3"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-4 py-1.5 text-sm"
              style={{ borderRadius: 'var(--radius)' }}
              disabled={isArchiving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={isArchiving}
              className="btn-accent px-4 py-1.5 text-sm flex items-center gap-2"
              style={{ borderRadius: 'var(--radius)' }}
            >
              {isArchiving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Archiving...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4" />
                  Archive
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
