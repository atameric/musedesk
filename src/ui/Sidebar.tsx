import React from 'react';
import { BrandMark, Icon } from './Icons';
import { Dropdown, IconButton } from './Primitives';
import { dayLabel, shortCliVersion } from '../shared/uiState';
import { formatClock } from '../shared/turnMeta';
import type { Session } from '../msp/msp';
import type { HostStatus } from '../shared/bridge';
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
  const t = (s.name || s.title || firstUserText || s.firstUserPrompt || '').trim().split('\n')[0];
  if (t !== '') return t.length > 512 ? `${t.slice(0, 512)}…` : t;
  return fallbackTitle(s);
}

interface SidebarProps {
  projects: ProjectGroup[] | null;
  activeId: string | null;
  busy: boolean;
  pendingCounts: Record<string, number>;
  collapsed: Record<string, boolean>;
  titleFor: (s: Session) => string;
  status: HostStatus | null;
  connectionLabel: string;
  onPalette: () => void;
  onSelect: (sessionId: string) => void;
  onToggle: (projectId: string) => void;
  onHide: (folder: string | null, name: string) => void;
  onNewProject: () => void;
  onNewChat: () => void;
  onNewChatIn: (folder: string | null) => void;
  onOverview: () => void;
  onSettings: () => void;
  onCollapse: () => void;
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
      title={title}
    >
      <Icon name="chat" size={15} /><span className="sess-content"><span className="sess-title">
        {title}
        {pending > 0 && <span className="badge">{pending}</span>}
      </span>
      <span className="sess-meta">
        {s.status === 'running' && <span className="dot running" />}
        {dayLabel(s.lastActivityAt ?? s.updatedAt) ?? ''} · {formatClock(Date.parse(s.lastActivityAt ?? s.updatedAt))}
      </span></span>
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
  status,
  connectionLabel,
  onPalette,
  onSelect,
  onToggle,
  onHide,
  onNewProject,
  onNewChat,
  onNewChatIn,
  onOverview,
  onSettings,
  onCollapse,
  onRefresh,
}: SidebarProps) {
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const connected = status?.state === 'ready';

  const visible = React.useMemo(() => {
    if (!projects) return null;
    if (q === '') return projects;
    return projects
      .map((p) => ({
        ...p,
        sessions: p.sessions.filter(
          (s) =>
            titleFor(s).toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.folder ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.sessions.length > 0);
  }, [projects, q, titleFor]);

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <span className="side-logo"><BrandMark />MuseDesk</span>
        <IconButton icon="sidebar" label="Hide sidebar" onClick={onCollapse} />
      </div>
      <button className="side-new" onClick={onNewChat} disabled={busy}>
        <Icon name="plus" size={17} /> New chat
      </button>
      <div className="side-search">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
          placeholder="Search chats"
          aria-label="Search chats"
        />
        <button className="kbd" onClick={onPalette} title="Open command palette (⌘K)" aria-label="Open command palette">⌘K</button>
      </div>
      <nav className="side-nav">
        <button className="side-nav-item" onClick={onOverview} disabled={busy}>
          <Icon name="home" size={17} /> Overview
        </button>
      </nav>
      <div className="side-projects-head">
        <span>PROJECTS</span>
        <IconButton icon="plus" label="Add a project folder" onClick={onNewProject} disabled={busy} />
      </div>
      <div className="sess-list">
        {visible === null && <div className="side-note">Loading sessions…</div>}
        {visible !== null && visible.length === 0 && (
          <div className="side-note">
            {q === '' ? 'No projects yet — add one with + above.' : `No chats match "${query.trim()}".`}
          </div>
        )}
        {visible?.map((p) => {
          // While searching, every match stays visible regardless of collapse.
          const isCollapsed = q === '' && collapsed[p.id] === true;
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
                  <Icon name={isCollapsed ? 'chevron' : 'down'} size={13} /><Icon name="folder" size={17} />
                  <span className="proj-name">{p.name}</span>
                  {isCollapsed && running && <span className="dot running" />}
                  {isCollapsed && pending > 0 && <span className="badge">{pending}</span>}
                </button>
                <Dropdown label={'Project actions: ' + p.name} className="btn icon proj-menu" disabled={busy}
                  options={[{ value: 'new', label: 'New chat', description: p.folder ?? 'Default folder', icon: 'plus' },
                    { value: 'hide', label: 'Hide project', description: 'Chats are kept. Add the folder to restore.', icon: 'close' }]}
                  onChange={(value) => value === 'new' ? onNewChatIn(p.folder) : onHide(p.folder, p.name)}><Icon name="more" size={16} /></Dropdown>
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
      <div className="side-footer">
        <nav className="side-nav">
          <button className="side-nav-item" onClick={onSettings}>
            <Icon name="settings" size={17} /> Settings
          </button>
        </nav>
        <div className="side-conn">
          <span className={`pill ${connected ? 'ok' : status?.state === 'starting' ? 'neutral' : 'error'}`}><span className="dot" />{connectionLabel}</span>
          <IconButton icon="refresh" label="Refresh session list" onClick={onRefresh} disabled={busy} />
          <span className="side-ver" title={status?.cliVersion ?? ''}>{shortCliVersion(status?.cliVersion)}</span>
        </div>
      </div>
    </aside>
  );
}
