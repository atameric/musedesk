import React from 'react';
import { visibleTranscriptItems, type FoldedItem, type TranscriptSnapshot } from '../msp/transcript';
import { infraTurnErrorGuidance, isInfraTurnError } from '../shared/errors';
import type { QueuedTurn } from '../shared/outbox';
import { MessageItem } from './MessageItem';

function queuedRow(q: QueuedTurn): FoldedItem {
  return {
    itemId: `queued-${q.turnId}`,
    kind: 'userMessage',
    status: 'queued',
    turnId: q.turnId,
    commandId: q.commandId,
    revision: 0,
    text: q.text,
    summary: [],
    outputText: '',
    retracted: false,
    terminal: false,
  };
}

export function ChatView({
  snapshot,
  shotsFor,
  busy,
  queued,
  onRestartHost,
}: {
  snapshot: TranscriptSnapshot;
  shotsFor: (commandId?: string) => string[];
  busy: boolean;
  /** Server-acked submits still waiting for their launch boundary. */
  queued: QueuedTurn[];
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
      {queued.map((q) => (
        <div key={q.turnId} className="queued-row">
          <MessageItem item={queuedRow(q)} shotsFor={shotsFor} flag="queued — starts when the running turn ends" />
        </div>
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
