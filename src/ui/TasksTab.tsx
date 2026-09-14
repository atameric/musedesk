import React from 'react';
import type { TodoView } from '../shared/sessionStats';

const GLYPH: Record<string, string> = {
  pending: '○',
  inProgress: '◉',
  completed: '✓',
  cancelled: '✕',
};

export function TasksTab({ todos }: { todos: TodoView[] }) {
  if (todos.length === 0) {
    return <div className="side-note">No tasks yet — the agent&apos;s plan appears here.</div>;
  }
  return (
    <div className="task-list">
      {todos.map((t, i) => (
        <div key={`${i}-${t.text}`} className={`task-row ${t.status}`}>
          <span className="task-glyph">{GLYPH[t.status] ?? '·'}</span>
          <span className="task-text">
            {t.status === 'inProgress' && t.activeForm ? t.activeForm : t.text}
          </span>
        </div>
      ))}
    </div>
  );
}
