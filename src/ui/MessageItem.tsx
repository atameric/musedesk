import React from 'react';
import { Icon } from './Icons';
import type { FoldedItem } from '../msp/transcript';
import { renderMarkdown } from '../shared/markdown';

export function Markdown({ text }: { text: string }) {
  const html = React.useMemo(() => renderMarkdown(text), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function ToolCallItem({ item }: { item: FoldedItem }) {
  const [open, setOpen] = React.useState(false);
  const icon = item.status === 'completed' ? 'check' : item.status === 'cancelled' ? 'stop' : 'warning';
  return (
    <div className={`tool status-${item.status}`}>
      <button className="tool-head" onClick={() => setOpen((v) => !v)} aria-expanded={open} title={item.args ?? ''}>
        <span className="tool-icon">{item.terminal ? <Icon name={icon} size={14} /> : <span className="spinner" />}</span>
        <span className="tool-name">{item.tool ?? 'tool'}</span>
        <code className="tool-args">{truncate(item.args, 100)}</code>
        <span className="tool-state">{item.status}</span>
      </button>
      {item.failureReason && <div className="tool-failure">{item.failureReason}</div>}
      {open && <div className="tool-detail">{item.args && <><div className="detail-label">Arguments</div><pre className="tool-output">{item.args}</pre></>}<div className="detail-label">Output</div><pre className="tool-output">{item.outputText || '(no output)'}</pre></div>}
    </div>
  );
}

export function ToolGroup({ items, duration }: { items: FoldedItem[]; duration: string | null }) {
  // Running groups stay open; settled ones collapse to one summary row.
  const [open, setOpen] = React.useState(() => items.some((i) => !i.terminal));
  const failed = items.some((i) => i.status === 'failed' || i.status === 'rejected');
  const settled = items.every((i) => i.terminal);
  return (
    <div className="toolgroup">
      <button className="toolgroup-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="toolgroup-chevron">{open ? '▾' : '▸'}</span>
        <span className="toolgroup-label">
          {items.length} tool call{items.length === 1 ? '' : 's'}
          {duration ? ` · ${duration}` : ''}
        </span>
        {settled ? (
          <span className={`toolgroup-status${failed ? ' bad' : ' ok'}`}>{failed ? '✕' : '✓'}</span>
        ) : (
          <span className="spinner" />
        )}
      </button>
      {open && (
        <div className="toolgroup-body">
          {items.map((item) => (
            <ToolCallItem key={item.itemId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentBlock({ items, time }: { items: FoldedItem[]; time: string | null }) {
  const last = items[items.length - 1];
  return (
    <div className="msg agent">
      <div className="agent-head">
        <span className="avatar">M</span>
        <span className="agent-name">Muse</span>
        {time && <span className="agent-time">{time}</span>}
      </div>
      {items.map((item) => (
        <Markdown key={item.itemId} text={item.text} />
      ))}
      {last && !last.terminal && <span className="cursor">▍</span>}
    </div>
  );
}

function GenericItem({ item }: { item: FoldedItem }) {
  const body = item.text || item.summary.join('\n') || item.outputText || item.fallbackText || '';
  return (
    <div className="msg generic">
      <div className="msg-kind">
        {item.kind} · {item.status}
      </div>
      {body !== '' && <Markdown text={body} />}
    </div>
  );
}

export function MessageItem({
  item,
  shotsFor,
  time,
  flag,
}: {
  item: FoldedItem;
  shotsFor: (commandId?: string) => string[];
  /** Client-observed clock label (null when the item predates this run). */
  time: string | null;
  /** Extra status line under the bubble (e.g. server-queued submits). */
  flag?: string;
}) {
  switch (item.kind) {
    case 'userMessage': {
      const shots = shotsFor(item.commandId);
      return (
        <div className={`msg user${item.retracted ? ' retracted' : ''}`}>
          {shots.length > 0 && (
            <div className="shots">
              {shots.map((src, i) => (
                <img key={i} src={src} className="shot" alt="attached screenshot" />
              ))}
            </div>
          )}
          {item.text !== '' && <div className="bubble">{item.text}</div>}
          {time && <div className="msg-meta">{time}</div>}
          {item.retracted && <div className="msg-flag">retracted</div>}
          {flag && <div className="msg-flag">{flag}</div>}
        </div>
      );
    }
    case 'agentMessage':
      // Rendered via AgentBlock by the ChatView; a lone item still renders alone.
      return <AgentBlock items={[item]} time={time} />;
    case 'reasoning': {
      const body = item.summary.join('\n');
      if (body === '') return null;
      return (
        <details className="msg reasoning">
          <summary>Reasoning</summary>
          <Markdown text={body} />
        </details>
      );
    }
    case 'toolCall':
      return <ToolGroup items={[item]} duration={null} />;
    case 'userShell':
      return (
        <div className="msg shell">
          <pre>{item.outputText || '(no output)'}</pre>
        </div>
      );
    case 'subagent':
    case 'workflow':
    case 'reminderChild':
    case 'compaction':
      return <GenericItem item={item} />;
    default:
      // Unknown kinds render generically per spec (kind + status + fallback text).
      return <GenericItem item={item} />;
  }
}
