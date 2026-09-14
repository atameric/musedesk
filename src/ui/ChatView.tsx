import React from 'react';
import { visibleTranscriptItems, type TranscriptSnapshot } from '../msp/transcript';
import { infraTurnErrorGuidance, isInfraTurnError } from '../shared/errors';
import { MessageItem } from './MessageItem';

export function ChatView({
  snapshot,
  shotsFor,
  busy,
  onRestartHost,
}: {
  snapshot: TranscriptSnapshot;
  shotsFor: (commandId?: string) => string[];
  busy: boolean;
  onRestartHost: (() => void) | null;
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
  const failedTurn = !snapshot.activeTurnId && lastTurn?.phase === 'failed' ? lastTurn : null;
  const failedKind = failedTurn?.error?.kind ?? '';
  const guidance = failedTurn?.error ? infraTurnErrorGuidance(failedKind) : null;
  const showRestart = onRestartHost !== null && failedKind !== '' && isInfraTurnError(failedKind);

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
      {failedTurn && (
        <div className="turn-status failed">
          <span>
            Turn failed: {failedTurn.error?.message ?? 'unknown error'}
            {failedTurn.error?.retryable ? ' (retryable — send again to retry)' : ''}
          </span>
          {guidance && <span className="fail-guide">{guidance}</span>}
          {showRestart && (
            <button className="btn small" onClick={() => onRestartHost?.()} disabled={busy}>
              Restart host
            </button>
          )}
        </div>
      )}
      {!snapshot.activeTurnId && lastTurn?.phase === 'cancelled' && (
        <div className="turn-status cancelled">Turn stopped.</div>
      )}
    </div>
  );
}
