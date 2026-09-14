import React from 'react';
import type { TodoView } from '../shared/sessionStats';
import { TasksTab } from './TasksTab';
import { ChangesTab } from './ChangesTab';

export type PanelTab = 'tasks' | 'changes';

export function SidePanel({
  tab,
  onTab,
  todos,
  folder,
  gitNonce,
}: {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  todos: TodoView[];
  folder: string | null;
  gitNonce: number;
}) {
  const openCount = todos.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;
  return (
    <aside className="sidepanel">
      <div className="panel-tabs">
        <button
          className={`panel-tab${tab === 'tasks' ? ' active' : ''}`}
          onClick={() => onTab('tasks')}
        >
          Tasks{openCount > 0 ? ` (${openCount})` : ''}
        </button>
        <button
          className={`panel-tab${tab === 'changes' ? ' active' : ''}`}
          onClick={() => onTab('changes')}
        >
          Changes
        </button>
      </div>
      <div className="panel-body">
        {tab === 'tasks' ? (
          <TasksTab todos={todos} />
        ) : (
          <ChangesTab folder={folder} nonce={gitNonce} />
        )}
      </div>
    </aside>
  );
}
