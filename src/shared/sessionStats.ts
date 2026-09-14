import type { SessionHistory } from '../msp/msp';

/** Session running token totals (server-accumulated, never backward). */
export interface SessionTokenTotals {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** One rendered todo row. */
export interface TodoView {
  text: string;
  status: string;
  activeForm?: string;
}

function validCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Take the `cumulative` block from a `session/tokenUsage` frame. */
export function parseTokenUsage(params: unknown): SessionTokenTotals | null {
  const c = (params as { cumulative?: unknown } | null)?.cumulative as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return null;
  if (!validCount(c.promptTokens) || !validCount(c.outputTokens) || !validCount(c.totalTokens)) {
    return null;
  }
  return { promptTokens: c.promptTokens, outputTokens: c.outputTokens, totalTokens: c.totalTokens };
}

/** Adopt the snapshot cumulative block when a snapshot history serves one. */
export function snapshotTokenUsage(history: SessionHistory): SessionTokenTotals | null {
  if (
    (history.mode === 'snapshot' || history.mode === 'anchoredSnapshot') &&
    history.snapshot?.state
  ) {
    const block = (history.snapshot.state as { tokenUsage?: unknown }).tokenUsage;
    if (block !== undefined) return parseTokenUsage({ cumulative: block });
  }
  return null;
}

function validTodo(v: unknown): TodoView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.text !== 'string' || typeof o.status !== 'string') return null;
  const todo: TodoView = { text: o.text, status: o.status };
  if (typeof o.activeForm === 'string') todo.activeForm = o.activeForm;
  return todo;
}

/**
 * Replace-wholesale parse of a `session/todoListChanged` frame. An empty
 * `items` array is a cleared list (returns []); malformed frames are null.
 */
export function parseTodoList(params: unknown): TodoView[] | null {
  const items = (params as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const out: TodoView[] = [];
  for (const item of items) {
    const todo = validTodo(item);
    if (!todo) return null;
    out.push(todo);
  }
  return out;
}

/** Adopt the snapshot todo block when a snapshot history serves one. */
export function snapshotTodoList(history: SessionHistory): TodoView[] | null {
  if (
    (history.mode === 'snapshot' || history.mode === 'anchoredSnapshot') &&
    history.snapshot?.state
  ) {
    const block = (history.snapshot.state as { todoList?: unknown }).todoList as {
      items?: unknown;
    } | null;
    if (block !== undefined && block !== null) return parseTodoList(block);
  }
  return null;
}

/** Compact token count: 999, 245K, 1.2M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.floor(n)));
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  const m = n / 1_000_000;
  return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
}
