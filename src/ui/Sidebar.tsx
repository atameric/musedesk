import React from 'react';
import type { Session } from '../msp/msp';

export function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fallbackTitle(s: Session): string {
  const ws = s.workspaceRoot ? s.workspaceRoot.split('/').filter(Boolean).pop() : null;
  return ws ?? `session ${s.sessionId.slice(0, 8)}`;
}

export function sessionTitle(s: Session, firstUserText?: string): string {
  const t = (firstUserText ?? '').trim().split('\n')[0];
  if (t !== '') return t.length > 42 ? `${t.slice(0, 42)}…` : t;
  return fallbackTitle(s);
}

interface SidebarProps {
  sessions: Session[] | null;
  activeId: string | null;
  busy: boolean;
  pendingCounts: Record<string, number>;
  newChatFolder: string | null;
  titleFor: (s: Session) => string;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onNewHere: () => void;
  onRefresh: () => void;
}

export function Sidebar({ sessions, activeId, busy, pendingCounts, newChatFolder, titleFor, onSelect, onNew, onNewHere, onRefresh }: SidebarProps) {
  const folderBase = (newChatFolder ?? '').split('/').filter(Boolean).pop() ?? null;
  return (
    <aside className="sidebar">
      <div className="side-head">
        <button className="btn new-chat" onClick={onNew} disabled={busy}>
          + New chat
        </button>
        <button className="btn icon" onClick={onRefresh} disabled={busy} title="Refresh list">
          ⟳
        </button>
      </div>
      <div className="sess-list">
        {sessions === null && <div className="side-note">Loading sessions…</div>}
        {sessions !== null && sessions.length === 0 && (
          <div className="side-note">No sessions yet.</div>
        )}
        {sessions?.map((s) => (
          <button
            key={s.sessionId}
            className={`sess-row${s.sessionId === activeId ? ' active' : ''}`}
            onClick={() => onSelect(s.sessionId)}
            disabled={busy}
          >
            <span className="sess-title">
              {titleFor(s)}
              {(pendingCounts[s.sessionId] ?? 0) > 0 && (
                <span className="badge">{pendingCounts[s.sessionId]}</span>
              )}
            </span>
            <span className="sess-meta">
              {s.status === 'running' && <span className="dot running" />}
              {s.turnCount} turn{s.turnCount === 1 ? '' : 's'} · {timeAgo(s.updatedAt)}
            </span>
          </button>
        ))}
      </div>
      <div className="side-foot">
        <button
          className="btn folder"
          onClick={onNewHere}
          disabled={busy}
          title={newChatFolder ? `Start a new chat in ${newChatFolder} right away` : 'Start a new chat in the server default folder'}
        >
          {folderBase ? `+ New chat in ${folderBase}` : '+ New chat in folder…'}
        </button>
      </div>
    </aside>
  );
}
