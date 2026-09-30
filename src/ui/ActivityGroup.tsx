import React from 'react';
import type { FoldedItem } from '../msp/transcript';
import { activitySummary } from '../shared/turnMeta';
import { Icon } from './Icons';
import { Markdown, ToolCallItem } from './MessageItem';

export function ActivityGroup({ items, phase, duration }: { items: FoldedItem[]; phase?: string; duration: string | null }) {
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  const summary = activitySummary(items, phase);
  const open = manualOpen ?? summary.state === 'error';
  const id = React.useId();
  if (items.length === 0) return null;
  return <div className={'activity-group ' + summary.state}>
    <button className="activity-head" aria-expanded={open} aria-controls={id} onClick={() => setManualOpen(!open)}>
      <Icon name={open ? 'down' : 'chevron'} size={15} />
      {summary.state === 'running' ? <span className="spinner" /> : <span className={'activity-status ' + summary.state}>
        <Icon name={summary.state === 'error' || summary.state === 'unknown' || summary.state === 'offline' ? 'warning' : summary.state === 'stopped' ? 'stop' : 'check'} size={12} />
      </span>}
      <span>{summary.label}{duration ? ' · ' + duration : ''}</span>
    </button>
    {open && <div id={id} className="activity-body">
      {items.map((item) => item.kind === 'toolCall' ? <ToolCallItem key={item.itemId} item={item} /> :
        <div key={item.itemId} className="reasoning-detail">
          <div className="detail-label">Reasoning{!item.terminal ? ' · in progress' : ''}</div>
          <Markdown text={item.summary.join('\n') || item.text || 'No reasoning summary was provided.'} />
        </div>)}
    </div>}
  </div>;
}
