import React from 'react';
import { visibleTranscriptItems, type TranscriptSnapshot } from '../msp/transcript';
import { MessageItem } from './MessageItem';

export function ChatView({
  snapshot,
  shotsFor,
}: {
  snapshot: TranscriptSnapshot;
  shotsFor: (commandId?: string) => string[];
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      el.scrollTop = el.scrollHeight;
    }
  });

  const turnList = Object.values(snapshot.turns);
  const lastTurn = turnList.length > 0 ? turnList[turnList.length - 1] : null;
  const rows = visibleTranscriptItems(snapshot.items);

  return (
    <div className="chat" ref={scrollRef}>
      {snapshot.gap && <div className="banner warn">Catching up with missed updates…</div>}
      {rows.map((item) => (
        <MessageItem key={item.itemId} item={item} shotsFor={shotsFor} />
      ))}
      {snapshot.activeTurnId && (
        <div className="turn-status running">
          <span className="spinner" /> Working…
        </div>
      )}
      {!snapshot.activeTurnId && lastTurn?.phase === 'failed' && (
        <div className="turn-status failed">
          Turn failed: {lastTurn.error?.message ?? 'unknown error'}
          {lastTurn.error?.retryable ? ' (retryable — send again to retry)' : ''}
        </div>
      )}
      {!snapshot.activeTurnId && lastTurn?.phase === 'cancelled' && (
        <div className="turn-status cancelled">Turn stopped.</div>
      )}
    </div>
  );
}
