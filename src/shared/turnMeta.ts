import type { FoldedItem } from '../msp/transcript';

/**
 * Chat-row grouping for the transcript view (pure, renderer-side only):
 * - consecutive tool calls of one turn fold into a single collapsible run
 * - consecutive agent messages of one turn share one agent block + header
 * - everything else renders as its own row
 */
export type ChatRow =
  | { type: 'tools'; turnId: string | null; items: FoldedItem[] }
  | { type: 'agent'; turnId: string | null; items: FoldedItem[] }
  | { type: 'single'; item: FoldedItem };

export function groupChatRows(items: FoldedItem[]): ChatRow[] {
  const rows: ChatRow[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (item.kind === 'toolCall' && last?.type === 'tools' && last.turnId === item.turnId) {
      last.items.push(item);
    } else if (item.kind === 'toolCall') {
      rows.push({ type: 'tools', turnId: item.turnId, items: [item] });
    } else if (
      item.kind === 'agentMessage' &&
      last?.type === 'agent' &&
      last.turnId === item.turnId
    ) {
      last.items.push(item);
    } else if (item.kind === 'agentMessage') {
      rows.push({ type: 'agent', turnId: item.turnId, items: [item] });
    } else {
      rows.push({ type: 'single', item });
    }
  }
  return rows;
}

export function rowTurnId(row: ChatRow): string | null {
  return row.type === 'single' ? row.item.turnId : row.turnId;
}

/** Local HH:MM clock label for a client-observed timestamp. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Compact turn duration: 5s, 1m, 2m 5s. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.max(0, totalSeconds)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Copy source for a turn footer: its non-empty agent texts joined. */
export function turnAgentText(items: FoldedItem[], turnId: string): string {
  return items
    .filter((i) => i.turnId === turnId && i.kind === 'agentMessage' && i.text !== '')
    .map((i) => i.text)
    .join('\n\n');
}

export type ConversationRow =
  | { type: 'single'; item: FoldedItem }
  | { type: 'response'; id: string; turnId: string | null; items: FoldedItem[]; activity: FoldedItem[]; lastResponse: boolean };

/**
 * Group an assistant turn's reasoning/tools into one disclosure while retaining
 * every visible message in order. A mid-turn user steer is a hard boundary:
 * assistant text after it must never move above that user message.
 */
export function conversationRows(items: FoldedItem[]): ConversationRow[] {
  const rows: ConversationRow[] = [];
  const activity = new Map<string, FoldedItem[]>();
  const responses = new Map<string, Extract<ConversationRow, { type: 'response' }>[]>();
  for (const item of items) {
    if (item.kind === 'userMessage' || item.kind === 'userShell') {
      rows.push({ type: 'single', item });
      continue;
    }
    const key = item.turnId ?? item.itemId;
    const last = rows[rows.length - 1];
    let row: Extract<ConversationRow, { type: 'response' }>;
    if (last?.type === 'response' && item.turnId !== null && last.turnId === item.turnId) row = last;
    else {
      row = { type: 'response', id: item.itemId, turnId: item.turnId, items: [], activity: [], lastResponse: false };
      rows.push(row);
      const list = responses.get(key) ?? [];
      list.push(row);
      responses.set(key, list);
    }
    if (item.kind === 'reasoning' || item.kind === 'toolCall') {
      const list = activity.get(key) ?? [];
      list.push(item);
      activity.set(key, list);
    } else row.items.push(item);
  }
  for (const [key, list] of responses) {
    list[0].activity = activity.get(key) ?? [];
    list[list.length - 1].lastResponse = true;
  }
  return rows.filter((row) => row.type === 'single' || row.items.length > 0 || row.activity.length > 0);
}

export function activitySummary(items: FoldedItem[], phase?: string) {
  const tools = items.filter((item) => item.kind === 'toolCall');
  const completed = tools.filter((item) => item.status === 'completed').length;
  const failed = tools.filter((item) => ['failed', 'rejected', 'timedOut'].includes(item.status)).length;
  const stopped = phase === 'cancelled' || phase === 'retracted' || phase === 'unqueued' || tools.some((item) => item.status === 'cancelled');
  const pending = items.some((item) => !item.terminal) || phase === 'running';
  const unknown = tools.some((item) => item.terminal && !['completed', 'failed', 'rejected', 'timedOut', 'cancelled'].includes(item.status));
  const state = failed > 0 || phase === 'failed' ? 'error' : phase === 'offline' ? 'offline' : stopped ? 'stopped' : pending ? 'running' : unknown ? 'unknown' : 'completed';
  const label = failed > 0 ? String(failed) + ' işlem hata verdi'
    : phase === 'failed' ? 'İşlem başarısız oldu'
    : phase === 'offline' ? 'Bağlantı kesildi'
    : stopped ? 'İşlem durduruldu'
    : unknown ? 'İşlem durumu bilinmiyor'
    : tools.length === 0 ? 'Düşünme ayrıntıları'
    : pending ? String(completed) + '/' + tools.length + ' işlem tamamlandı'
    : String(tools.length) + ' işlem tamamlandı';
  return { state, label, completed, failed, toolCount: tools.length };
}
