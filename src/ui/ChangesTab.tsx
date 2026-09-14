import React from 'react';
import type { MuseDeskBridge } from '../shared/bridge';
import { classifyDiffLine } from '../shared/diff';

type GitStatusView = Awaited<ReturnType<MuseDeskBridge['gitStatus']>>;

function badgeFor(staged: string, unstaged: string): string {
  if (staged === '?' && unstaged === '?') return '??';
  return `${staged === ' ' ? '' : staged}${unstaged === ' ' ? '' : unstaged}`;
}

export function ChangesTab({ folder, nonce }: { folder: string | null; nonce: number }) {
  const [status, setStatus] = React.useState<GitStatusView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [openPath, setOpenPath] = React.useState<string | null>(null);
  const [diff, setDiff] = React.useState<string | null>(null);
  const [diffError, setDiffError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    if (!folder) return;
    setError(null);
    window.musedesk.gitStatus(folder).then(
      (s) => setStatus(s),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [folder]);

  React.useEffect(() => {
    setStatus(null);
    setOpenPath(null);
    setDiff(null);
    setDiffError(null);
    refresh();
  }, [refresh, nonce]);

  if (!folder) {
    return <div className="side-note">Select a session with a working folder.</div>;
  }

  const toggleFile = (filePath: string) => {
    if (openPath === filePath) {
      setOpenPath(null);
      setDiff(null);
      return;
    }
    setOpenPath(filePath);
    setDiff(null);
    setDiffError(null);
    window.musedesk.gitDiff(folder, filePath).then(
      (d) => setDiff(d),
      (e: unknown) => setDiffError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <div className="changes">
      <div className="changes-head">
        <span className="changes-branch">
          {status ? (status.isRepo ? (status.branch ?? '(no branch)') : 'Not a git repository') : 'Loading…'}
        </span>
        <button className="btn icon" onClick={refresh} title="Refresh git status">
          ⟳
        </button>
      </div>
      {error && <div className="side-note">{error}</div>}
      {status?.isRepo && status.files.length === 0 && (
        <div className="side-note">Clean tree — no changes.</div>
      )}
      {status?.files.map((f) => (
        <div key={f.path} className="change-file">
          <button className="change-row" onClick={() => toggleFile(f.path)}>
            <span className="change-badge">{badgeFor(f.staged, f.unstaged)}</span>
            <span className="change-path">{f.path}</span>
          </button>
          {openPath === f.path && (
            <div className="diff-wrap">
              {diffError && <div className="side-note">{diffError}</div>}
              {diff === null && !diffError && <div className="side-note">Loading diff…</div>}
              {diff !== null && (
                <pre className="diff">
                  {diff.split('\n').map((line, i) => (
                    <div key={i} className={`dl-${classifyDiffLine(line)}`}>
                      {line === '' ? ' ' : line}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
