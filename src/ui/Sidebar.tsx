import React from 'react';
import type { Session } from '../msp/msp';
import type { ProjectGroup } from '../shared/projects';

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
  projects: ProjectGroup[] | null;
  activeId: string | null;
  busy: boolean;
  pendingCounts: Record<string, number>;
  collapsed: Record<string, boolean>;
  titleFor: (s: Session) => string;
  onSelect: (sessionId: string) => void;
  onToggle: (projectId: string) => void;
  onHide: (folder: string | null, name: string) => void;
  onNewProject: () => void;
  onNewChatIn: (folder: string | null) => void;
  onRefresh: () => void;
}

function SessionRow({
  s,
  active,
  busy,
  pending,
  title,
  onSelect,
}: {
  s: Session;
  active: boolean;
  busy: boolean;
  pending: number;
  title: string;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <button
      className={`sess-row${active ? ' active' : ''}`}
      onClick={() => onSelect(s.sessionId)}
      disabled={busy}
    >
      <span className="sess-title">
        {title}
        {pending > 0 && <span className="badge">{pending}</span>}
      </span>
      <span className="sess-meta">
        {s.status === 'running' && <span className="dot running" />}
        {s.turnCount} turn{s.turnCount === 1 ? '' : 's'} · {timeAgo(s.updatedAt)}
      </span>
    </button>
  );
}

export function Sidebar({
  projects,
  activeId,
  busy,
  pendingCounts,
  collapsed,
  titleFor,
  onSelect,
  onToggle,
  onHide,
  onNewProject,
  onNewChatIn,
  onRefresh,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="side-head">
        <button className="btn new-project" onClick={onNewProject} disabled={busy}>
          + New Project
        </button>
        <button className="btn icon" onClick={onRefresh} disabled={busy} title="Refresh list">
          ⟳
        </button>
      </div>
      <div className="sess-list">
        {projects === null && <div className="side-note">Loading sessions…</div>}
        {projects !== null && projects.length === 0 && (
          <div className="side-note">No projects yet — start one with + New Project.</div>
        )}
        {projects?.map((p) => {
          const isCollapsed = collapsed[p.id] === true;
          // Aggregates stay on the collapsed row so running turns and
          // approval badges are never hidden inside a closed folder.
          const pending = p.sessions.reduce((n, s) => n + (pendingCounts[s.sessionId] ?? 0), 0);
          const running = p.sessions.some((s) => s.status === 'running');
          return (
            <div key={p.id} className="proj">
              <div className="proj-row">
                <button
                  className="proj-toggle"
                  onClick={() => onToggle(p.id)}
                  disabled={busy}
                  title={p.folder ?? 'Sessions without a working folder'}
                  aria-expanded={!isCollapsed}
                >
                  <span className="proj-chevron">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="proj-name">{p.name}</span>
                  {isCollapsed && running && <span className="dot running" />}
                  {isCollapsed && pending > 0 && <span className="badge">{pending}</span>}
                </button>
                <button
                  className="btn icon proj-add"
                  onClick={() => onNewChatIn(p.folder)}
                  disabled={busy}
                  title={
                    p.folder
                      ? `Start a new chat in ${p.folder}`
                      : 'Start a new chat in the server default folder'
                  }
                >
                  +
                </button>
                <button
                  className="btn icon proj-hide"
                  onClick={() => onHide(p.folder, p.name)}
                  disabled={busy}
                  title={`Hide ${p.name} from the sidebar (its chats are kept)`}
                >
                  ×
                </button>
              </div>
              {!isCollapsed && (
                <div className="proj-sess">
                  {p.sessions.map((s) => (
                    <SessionRow
                      key={s.sessionId}
                      s={s}
                      active={s.sessionId === activeId}
                      busy={busy}
                      pending={pendingCounts[s.sessionId] ?? 0}
                      title={titleFor(s)}
                      onSelect={onSelect}
                    />
                  ))}
                  {p.sessions.length === 0 && (
                    <div className="side-note">No chats yet — press + to start one.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
