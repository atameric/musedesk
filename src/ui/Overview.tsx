import React from 'react';
import type { Session } from '../msp/msp';
import { formatTokens, type SessionTokenTotals, type TodoView } from '../shared/sessionStats';
import { timeAgo } from './Sidebar';

export interface OverviewSession {
  session: Session;
  title: string;
  folderName: string;
  running: boolean;
  pending: number;
  tokens: SessionTokenTotals | null;
  todos: TodoView[];
}

export function Overview({
  cards,
  onOpen,
  onStop,
  onBack,
}: {
  cards: OverviewSession[];
  onOpen: (sessionId: string) => void;
  onStop: (sessionId: string) => void;
  onBack: () => void;
}) {
  const running = cards.filter((c) => c.running).length;
  return (
    <div className="overview">
      <header className="ov-head">
        <span className="brand">Mission control</span>
        <span className="ov-sub">
          {cards.length} session{cards.length === 1 ? '' : 's'} · {running} running
        </span>
        <button className="btn small" onClick={onBack}>
          Back to chat
        </button>
      </header>
      {cards.length === 0 && <div className="side-note">No sessions yet.</div>}
      <div className="ov-grid">
        {cards.map((c) => {
          const doneTodos = c.todos.filter((t) => t.status === 'completed').length;
          return (
            <div key={c.session.sessionId} className="ov-card">
              <button className="ov-open" onClick={() => onOpen(c.session.sessionId)}>
                <span className="ov-title">
                  {c.running && <span className="dot running" />}
                  {c.title}
                  {c.pending > 0 && <span className="badge">{c.pending}</span>}
                </span>
                <span className="ov-meta">
                  {c.folderName} · {c.session.turnCount} turn{c.session.turnCount === 1 ? '' : 's'}
                  {c.tokens ? ` · tok ${formatTokens(c.tokens.totalTokens)}` : ''}
                  {c.todos.length > 0 ? ` · ✓ ${doneTodos}/${c.todos.length}` : ''} ·{' '}
                  {timeAgo(c.session.updatedAt)}
                </span>
              </button>
              {c.running && (
                <button className="btn small" onClick={() => onStop(c.session.sessionId)}>
                  Stop
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
