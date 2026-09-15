import React from 'react';
import type { FoldedItem } from '../msp/transcript';
import { renderMarkdown } from '../shared/markdown';

function Markdown({ text }: { text: string }) {
  const html = React.useMemo(() => renderMarkdown(text), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function ToolCallItem({ item }: { item: FoldedItem }) {
  const [open, setOpen] = React.useState(false);
  const icon = item.status === 'inProgress' ? '…' : item.status === 'completed' ? '✓' : '✕';
  return (
    <div className={`tool status-${item.status}`}>
      <button className="tool-head" onClick={() => setOpen((v) => !v)} title={item.args ?? ''}>
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{item.tool ?? 'tool'}</span>
        <code className="tool-args">{truncate(item.args, 100)}</code>
        {!item.terminal && <span className="spinner" />}
      </button>
      {item.failureReason && <div className="tool-failure">{item.failureReason}</div>}
      {open && <pre className="tool-output">{item.outputText || '(no output)'}</pre>}
    </div>
  );
}

function GenericItem({ item }: { item: FoldedItem }) {
  const body = item.text || item.summary.join('\n') || item.outputText || item.fallbackText || '';
  return (
    <div className="msg agent">
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
  flag,
}: {
  item: FoldedItem;
  shotsFor: (commandId?: string) => string[];
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
          {item.retracted && <div className="msg-flag">retracted</div>}
          {flag && <div className="msg-flag">{flag}</div>}
        </div>
      );
    }
    case 'agentMessage':
      return (
        <div className="msg agent">
          <Markdown text={item.text} />
          {!item.terminal && <span className="cursor">▍</span>}
        </div>
      );
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
      return <ToolCallItem item={item} />;
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
