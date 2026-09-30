import React from 'react';
import type { MuseDeskBridge } from '../shared/bridge';
import { classifyDiffLine, countDiffLines } from '../shared/diff';

export type GitStatusView = Awaited<ReturnType<MuseDeskBridge['gitStatus']>>;
export type ChangedFile = GitStatusView['files'][number];

/** Live git status for a folder; refreshes on folder/nonce change. Never throws. */
export function useGitStatus(folder: string | null, nonce: number) {
  const [status, setStatus] = React.useState<GitStatusView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    if (!folder) return;
    if (typeof window.musedesk.gitStatus !== 'function') {
      setError('git status unavailable');
      return;
    }
    setError(null);
    window.musedesk.gitStatus(folder).then(
      (s) => setStatus(s),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [folder]);

  React.useEffect(() => {
    setStatus(null);
    setError(null);
    refresh();
  }, [refresh, nonce]);

  return { status, error, refresh };
}

function badgeFor(staged: string, unstaged: string): string {
  if (staged === '?' && unstaged === '?') return '??';
  return `${staged === ' ' ? '' : staged}${unstaged === ' ' ? '' : unstaged}`;
}

/** Bound on eager diff fetches (each is a capped read-only git call). */
const EAGER_DIFF_LIMIT = 12;

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="diff">
      {diff.split('\n').map((line, i) => (
        <div key={i} className={`dl-${classifyDiffLine(line)}`}>
          {line === '' ? ' ' : line}
        </div>
      ))}
    </pre>
  );
}

/**
 * Shared file list with per-file counts (from loaded diff text) and an
 * expandable diff viewer. `cacheKey` invalidates loaded diffs on refresh.
 */
export function FileList({
  folder,
  files,
  eagerCounts,
  cacheKey,
}: {
  folder: string;
  files: ChangedFile[];
  eagerCounts: boolean;
  cacheKey: string;
}) {
  const [openPath, setOpenPath] = React.useState<string | null>(null);
  const [diffs, setDiffs] = React.useState<Record<string, string>>({});
  const [diffErrors, setDiffErrors] = React.useState<Record<string, string>>({});

  const loadDiff = React.useCallback(
    (filePath: string) => {
      if (typeof window.musedesk.gitDiff !== 'function') {
        setDiffErrors((prev) => ({ ...prev, [filePath]: 'diff unavailable' }));
        return;
      }
      window.musedesk.gitDiff(folder, filePath).then(
        (d) => setDiffs((prev) => ({ ...prev, [filePath]: d })),
        (e: unknown) =>
          setDiffErrors((prev) => ({ ...prev, [filePath]: e instanceof Error ? e.message : String(e) })),
      );
    },
    [folder],
  );

  React.useEffect(() => {
    setOpenPath(null);
    setDiffs({});
    setDiffErrors({});
  }, [cacheKey, folder]);

  React.useEffect(() => {
    if (!eagerCounts) return;
    for (const f of files.slice(0, EAGER_DIFF_LIMIT)) loadDiff(f.path);
  }, [files, eagerCounts, loadDiff]);

  const toggleFile = (filePath: string) => {
    if (openPath === filePath) {
      setOpenPath(null);
      return;
    }
    setOpenPath(filePath);
    if (diffs[filePath] === undefined && diffErrors[filePath] === undefined) loadDiff(filePath);
  };

  return (
    <>
      {files.map((f) => {
        const counts = diffs[f.path] !== undefined ? countDiffLines(diffs[f.path]) : null;
        return (
          <div key={f.path} className="change-file">
            <button className="change-row" aria-expanded={openPath === f.path} title={f.path} onClick={() => toggleFile(f.path)}>
              <span className="change-badge">{badgeFor(f.staged, f.unstaged)}</span>
              <span className="change-path">{f.path}</span>
              {counts && (counts.add > 0 || counts.del > 0) && (
                <span className="change-counts">
                  {counts.add > 0 && <span className="count-add">+{counts.add}</span>}
                  {counts.del > 0 && <span className="count-del">−{counts.del}</span>}
                </span>
              )}
            </button>
            {openPath === f.path && (
              <div className="diff-wrap">
                {diffErrors[f.path] && <div className="side-note">{diffErrors[f.path]}</div>}
                {diffs[f.path] === undefined && diffErrors[f.path] === undefined && (
                  <div className="side-note">Loading diff…</div>
                )}
                {diffs[f.path] !== undefined && <DiffView diff={diffs[f.path]} />}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
