import React from 'react';
import type { HostStatus } from '../shared/bridge';
import type { SessionContextUsage } from '../shared/contextUsage';
import type { SessionTokenTotals } from '../shared/sessionStats';
import { Icon } from './Icons';
import { IconButton } from './Primitives';
import { OverflowMenu } from './OverflowMenu';
import type { PanelTab } from './SidePanel';

export function ChatHeader({ title, project, status, busy, sidebarHidden, context, contextPct, tokens, panel, sessionId,
  onSidebar, onAccess, onPanel, onResync, onRestart, onCopyId }: {
  title: string; project: string | null; status: HostStatus | null; busy: boolean; sidebarHidden: boolean;
  context: SessionContextUsage | null; contextPct: number | null; tokens: SessionTokenTotals | null;
  panel: { open: boolean; tab: PanelTab }; sessionId: string | null;
  onSidebar: () => void; onAccess: () => void; onPanel: (tab: PanelTab) => void;
  onResync: () => void; onRestart: () => void; onCopyId: () => void;
}) {
  const [contextOpen, setContextOpen] = React.useState(false);
  const contextRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!contextOpen) return;
    const dismiss = (e: PointerEvent) => { if (!contextRef.current?.contains(e.target as Node)) setContextOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setContextOpen(false); contextRef.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [contextOpen]);
  React.useEffect(() => setContextOpen(false), [sessionId]);
  return <header className="topbar">
    {sidebarHidden && <IconButton icon="showSidebar" label="Show sidebar" onClick={onSidebar} />}
    <div className="title-block">
      {project && <div className="crumbs" title={project}>{project}</div>}
      <h1 className="conv-title" title={title}>{title}</h1>
    </div>
    <div className="top-actions">
      <button className={'access-toggle' + (status?.fullAccess ? ' on' : '')} disabled={busy || status?.state !== 'ready'}
        aria-label={status?.fullAccess ? 'Disable full access' : 'Enable full access'} aria-pressed={status?.fullAccess === true}
        onClick={onAccess} title="Full access disables the shell sandbox for every session.">
        <Icon name="shield" /><span>{status?.fullAccess ? 'Full access' : 'Sandboxed'}</span>
      </button>
      <div className="context-anchor" ref={contextRef}>
        <button className="ctx" onClick={() => setContextOpen((v) => !v)} aria-expanded={contextOpen} aria-label="Context and token usage">
          <svg className={'ctx-ring ' + (context?.pressure ?? '')} width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" className="ctx-track" />
            <circle cx="10" cy="10" r="7.5" className="ctx-progress" pathLength="100" strokeDasharray={String(contextPct ?? 0) + ' 100'} transform="rotate(-90 10 10)" />
          </svg>
          <span>Context {contextPct === null ? '—' : contextPct + '%'}</span>
        </button>
        {contextOpen && <div className="context-popover" role="region" aria-label="Usage details">
          <strong>Context window</strong>
          <p>{context ? context.usedTokens.toLocaleString() + ' / ' + (context.windowTokens?.toLocaleString() ?? 'unknown') + ' tokens' : 'No context usage reported yet.'}</p>
          {context && <small>Pressure: {context.pressure}</small>}
          <div className="menu-sep" />
          <strong>Session tokens</strong>
          <p>{tokens ? tokens.totalTokens.toLocaleString() + ' total' : 'No token usage reported yet.'}</p>
          {tokens && <small>{tokens.promptTokens.toLocaleString()} prompt · {tokens.outputTokens.toLocaleString()} output</small>}
        </div>}
      </div>
      <span className="header-sep" />
      <button className={'btn panel-toggle' + (panel.open && panel.tab === 'tasks' ? ' on' : '')}
        aria-label="Tasks" aria-expanded={panel.open && panel.tab === 'tasks'} onClick={() => onPanel('tasks')}>
        <Icon name="tasks" /><span>Tasks</span>
      </button>
      <button className={'btn ghost changes-toggle' + (panel.open && panel.tab === 'changes' ? ' on' : '')}
        aria-label="Changes" aria-expanded={panel.open && panel.tab === 'changes'} onClick={() => onPanel('changes')}>
        <Icon name="file" /><span>Changes</span>
      </button>
      <OverflowMenu sessionId={sessionId} busy={busy || status?.state === 'starting'}
        canResync={!busy && !!sessionId && status?.state === 'ready'} onResync={onResync} onRestart={onRestart} onCopyId={onCopyId} />
    </div>
  </header>;
}
