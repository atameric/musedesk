import React from 'react';
import { IconButton } from './Primitives';
import type { TodoView } from '../shared/sessionStats';
import { TasksTab } from './TasksTab';
import { ChangesTab } from './ChangesTab';

export type PanelTab = 'tasks' | 'changes';

export function SidePanel({
  onClose,
  tab,
  onTab,
  todos,
  folder,
  gitNonce,
}: {
  onClose: () => void;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  todos: TodoView[];
  folder: string | null;
  gitNonce: number;
}) {
  const panelRef = React.useRef<HTMLElement>(null);
  const closeRef = React.useRef(onClose); closeRef.current = onClose;
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const media = window.matchMedia('(max-width: 1240px)');
    const blocked = [...document.querySelectorAll<HTMLElement>('.sidebar, .main')];
    const old = blocked.map(el => el.inert);
    const update = () => { blocked.forEach((el, i) => { el.inert = media.matches || old[i]; }); if (media.matches) panelRef.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus(); };
    update(); media.addEventListener('change', update);
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('[role=dialog], .popup-menu')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key !== 'Tab' || !media.matches) return;
      const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), [tabindex="0"]') ?? [])];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { media.removeEventListener('change', update); document.removeEventListener('keydown', key); blocked.forEach((el, i) => { el.inert = old[i]; }); previous?.focus(); };
  }, []);
  const openCount = todos.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;
  return (
    <aside ref={panelRef} className="sidepanel" aria-label="Session inspector">
      <div className="panel-tabs" role="tablist" aria-label="Inspector tabs" onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); const next = e.key === 'Home' ? 'tasks' : e.key === 'End' ? 'changes' : tab === 'tasks' ? 'changes' : 'tasks';
        onTab(next); const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'); buttons[next === 'tasks' ? 0 : 1]?.focus();
      }}>
        <button
          className={`panel-tab${tab === 'tasks' ? ' active' : ''}`}
          role="tab" tabIndex={tab === 'tasks' ? 0 : -1} aria-selected={tab === 'tasks'} onClick={() => onTab('tasks')}
        >
          Tasks{openCount > 0 ? ` (${openCount})` : ''}
        </button>
        <button
          className={`panel-tab${tab === 'changes' ? ' active' : ''}`}
          role="tab" tabIndex={tab === 'changes' ? 0 : -1} aria-selected={tab === 'changes'} onClick={() => onTab('changes')}
        >
          Changes
        </button>
        <IconButton icon="close" label="Close inspector" onClick={onClose} />
      </div>
      <div className="panel-body" role="tabpanel">
        {tab === 'tasks' ? (
          <TasksTab todos={todos} />
        ) : (
          <ChangesTab folder={folder} nonce={gitNonce} />
        )}
      </div>
    </aside>
  );
}
