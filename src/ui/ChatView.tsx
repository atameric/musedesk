import React from 'react';
import { visibleTranscriptItems, type FoldedItem, type TranscriptSnapshot } from '../msp/transcript';
import { conversationRows, formatClock, formatDuration } from '../shared/turnMeta';
import { dayLabel, likeKey } from '../shared/uiState';
import { infraTurnErrorGuidance, isInfraTurnError } from '../shared/errors';
import type { QueuedTurn } from '../shared/outbox';
import { Markdown, MessageItem } from './MessageItem';
import { ActivityGroup } from './ActivityGroup';
import { MessageActions } from './MessageActions';
import { BrandMark, Icon } from './Icons';

function queuedRow(q: QueuedTurn): FoldedItem {
  return { itemId: `queued-${q.turnId}`, kind: 'userMessage', status: 'queued', turnId: q.turnId,
    commandId: q.commandId, revision: 0, text: q.text, summary: [], outputText: '', retracted: false, terminal: false };
}
export function ChatView({ sessionId, snapshot, shotsFor, timeFor, durFor, busy, connected, queued, onRestartHost }: {
  sessionId?: string; snapshot: TranscriptSnapshot; shotsFor: (commandId?: string) => string[];
  timeFor: (itemId: string) => string | null; durFor: (turnId: string | null) => string | null;
  busy: boolean; connected: boolean; queued: QueuedTurn[]; onRestartHost: (() => void) | null;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const follow = React.useRef(true);
  const scrollIntentUntil = React.useRef(0);
  const [away, setAway] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return;
    if (follow.current) el.scrollTop = el.scrollHeight;
    setAway(!follow.current && el.scrollHeight - el.scrollTop - el.clientHeight >= 100);
  }, [snapshot, queued]);
  React.useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) el.scrollTop = el.scrollHeight;
      setAway(!follow.current && el.scrollHeight - el.scrollTop - el.clientHeight >= 100);
    });
    observer.observe(el); if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  const turnList = Object.values(snapshot.turns);
  const lastTurn = turnList.at(-1);
  const rows = React.useMemo(() => conversationRows(visibleTranscriptItems(snapshot.items)), [snapshot.items]);
  const failedTurn = !snapshot.activeTurnId && lastTurn?.phase === 'failed' ? lastTurn : null;
  const failedKind = failedTurn?.error?.kind ?? '';
  const guidance = failedTurn?.error ? infraTurnErrorGuidance(failedKind) : null;
  let previousDay: string | null = null;
  return <div className="chat-frame"><div className="chat" ref={scrollRef}
    onWheel={() => { scrollIntentUntil.current = Date.now() + 1500; }}
    onPointerDown={(e) => { scrollIntentUntil.current = Date.now() + 1500; if ((e.target as Element).closest('.activity-head, .tool-head')) follow.current = false; }}
    onPointerMove={(e) => { if (e.buttons) scrollIntentUntil.current = Date.now() + 1500; }}
    onKeyDown={(e) => { if (['Enter',' '].includes(e.key) && (e.target as Element).closest('.activity-head, .tool-head')) follow.current = false; if (['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(e.key)) scrollIntentUntil.current = Date.now() + 1500; }}
    onScroll={() => {
    const el = scrollRef.current; if (!el) return;
    if (Date.now() < scrollIntentUntil.current) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setAway(!follow.current && el.scrollHeight - el.scrollTop - el.clientHeight >= 100);
  }}><div className="chat-inner">
    {snapshot.gap && <div className="banner warn">Catching up with missed updates…</div>}
    {rows.map((row) => {
      const first = row.type === 'single' ? row.item : row.items[0] ?? row.activity[0];
      const date = first?.recordedAt ? dayLabel(first.recordedAt) : null;
      const showDay = date !== null && date !== previousDay;
      if (date) previousDay = date;
      const time = first?.recordedAt ? formatClock(Date.parse(first.recordedAt)) : timeFor(first?.itemId ?? '');
      if (row.type === 'single') return <React.Fragment key={row.item.itemId}>
        {showDay && <div className="date-divider"><span>{date}</span></div>}
        <MessageItem item={row.item} shotsFor={shotsFor} time={time} />
      </React.Fragment>;
      const turn = row.turnId ? snapshot.turns[row.turnId] : undefined;
      const duration = turn?.durationMs !== undefined ? formatDuration(Math.round(turn.durationMs / 1000)) : durFor(row.turnId);
      const text = row.items.filter((i) => i.kind === 'agentMessage').map((i) => i.text).filter(Boolean).join('\n\n');
      const settled = row.turnId !== snapshot.activeTurnId && row.items.every((i) => i.terminal);
      return <React.Fragment key={'response-' + row.id}>
        {showDay && <div className="date-divider"><span>{date}</span></div>}
        <article className="msg agent">
          <div className="agent-head"><span className="avatar"><BrandMark /></span><span className="agent-name">Muse</span>{time && <span className="agent-time">{time}</span>}</div>
          <ActivityGroup items={row.activity} phase={!connected && row.turnId === snapshot.activeTurnId ? 'offline' : turn?.phase} duration={duration} />
          {row.items.map((item) => item.kind === 'agentMessage' ? <Markdown key={item.itemId} text={item.text} /> : <MessageItem key={item.itemId} item={item} shotsFor={shotsFor} time={null} />)}
          {!settled && connected && row.items.some((i) => !i.terminal) && <span className="cursor">▍</span>}
          {text && settled && <MessageActions key={likeKey(sessionId ?? '', row.id)} sessionId={sessionId ?? ''} responseId={row.id} text={text} />}
        </article>
      </React.Fragment>;
    })}
    {queued.map((q) => <div key={q.turnId} className="queued-row"><MessageItem item={queuedRow(q)} shotsFor={shotsFor} time={null} flag="Queued · starts when the running turn ends" /></div>)}
    {snapshot.activeTurnId && connected && <div className="turn-status running"><span className="spinner" /> Working…</div>}
    {snapshot.activeTurnId && !connected && <div className="turn-status cancelled">Connection lost. Restart host to recover this session.</div>}
    {failedTurn && <div className="turn-status failed"><span>Turn failed: {failedTurn.error?.message ?? 'unknown error'}{failedTurn.error?.retryable ? ' (send again to retry)' : ''}</span>{guidance && <span className="fail-guide">{guidance}</span>}{onRestartHost && isInfraTurnError(failedKind) && <button className="btn small" onClick={onRestartHost} disabled={busy}>Restart host</button>}</div>}
    {!snapshot.activeTurnId && lastTurn?.phase === 'cancelled' && <div className="turn-status cancelled">Turn stopped.</div>}
  </div></div>{away && <button className="btn jump-latest" onClick={() => { follow.current = true; scrollIntentUntil.current = 0; setAway(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }}><Icon name="arrowDown" size={16} /> Latest messages</button>}</div>;
}
