import React from 'react';
import { Icon } from './Icons';
import { IconButton } from './Primitives';
import { FileList, useGitStatus } from './FileChanges';

export function ChangesTab({ folder, nonce }: { folder: string | null; nonce: number }) {
  const { status, error, refresh } = useGitStatus(folder, nonce);
  // Manual refresh also drops loaded diffs (the tree may have changed).
  const [epoch, setEpoch] = React.useState(0);

  if (!folder) {
    return <div className="side-note">Select a session with a working folder.</div>;
  }

  return (
    <div className="changes">
      <div className="changes-head">
        <span className="changes-branch">
          <Icon name="branch" size={15} />{status ? (status.isRepo ? (status.branch ?? '(no branch)') : 'Not a git repository') : 'Loading…'}
        </span>
        <IconButton icon="refresh" label="Refresh git status" onClick={() => { setEpoch((e) => e + 1); refresh(); }} />
      </div>
      {error && <div className="side-note">{error}</div>}
      {status?.isRepo && status.files.length === 0 && (
        <div className="side-note">Clean tree — no changes.</div>
      )}
      {status && <FileList folder={folder} files={status.files} eagerCounts={false} cacheKey={`${nonce}:${epoch}`} />}
    </div>
  );
}
