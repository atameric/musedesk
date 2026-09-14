import type {
  Item,
  ItemCompletedParams,
  ItemDeltaParams,
  ItemStartedParams,
  ItemUpdatedParams,
  TurnCompletedParams,
  TurnStartedParams,
} from './msp';

/** One replayable view frame: live notifications and view/page elements alike. */
export interface ViewFrame {
  method: string;
  params: unknown;
}

/**
 * Pure view-event fold shared by main, renderer, and tests (no node imports).
 *
 * Rules follow the MSP spec comments in msp.d.ts:
 * - item/started opens an entry; item/delta appends to a field buffer.
 * - item/updated replaces the base iff its revision is higher (deltas that
 *   arrived before it are already folded in, so buffers reset).
 * - item/completed is the authoritative terminal object: always replaces.
 * - A turn is running between turn/started and its turn/completed.
 * - Unknown methods are ignored (forward-compatible with new lanes).
 */

export interface FoldedItem {
  itemId: string;
  kind: string;
  status: string;
  turnId: string | null;
  /** Set on userMessage/userShell: keys optimistic client state (e.g. shot previews). */
  commandId?: string;
  revision: number;
  /** userMessage/agentMessage text incl. streamed deltas. */
  text: string;
  /** reasoning summary parts incl. streamed deltas. */
  summary: string[];
  /** toolCall/userShell visible output incl. streamed deltas. */
  outputText: string;
  tool?: string;
  args?: string;
  failureKind?: string;
  failureReason?: string;
  fallbackText?: string;
  retracted: boolean;
  /** Terminal = anything other than "inProgress" (spec tdd SS4.4.1). */
  terminal: boolean;
}

/**
 * Item kinds folded into the snapshot but never rendered as chat rows.
 * `reminderChild` is a child-session pointer the UI cannot drill into, so
 * its stub row ("reminderChild · completed") is pure noise between the
 * user's messages and the agent's answers.
 */
export const CHAT_HIDDEN_KINDS: ReadonlySet<string> = new Set(['reminderChild']);

/** Chat rows: snapshot items minus the hidden system kinds. */
export function visibleTranscriptItems(items: FoldedItem[]): FoldedItem[] {
  return items.filter((i) => !CHAT_HIDDEN_KINDS.has(i.kind));
}

export type TurnPhase =
  | 'running'
  | 'queued'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retracted'
  | 'unqueued';

export interface TurnState {
  turnId: string;
  phase: TurnPhase;
  error?: { kind: string; message: string; retryable: boolean };
}

export interface TranscriptSnapshot {
  items: FoldedItem[];
  activeTurnId: string | null;
  turns: Record<string, TurnState>;
  lastCursor: string | null;
  gap: { after: string; next: string } | null;
}

interface Entry {
  base: Item;
  deltas: Map<string, string>;
}

function stubItem(itemId: string): Item {
  return { itemId, kind: 'unknown', revision: 0, status: 'inProgress' } as Item;
}

function foldEntry(e: Entry): FoldedItem {
  const b = e.base;
  const parts = [...(b.summary ?? [])];
  for (const [field, buf] of e.deltas) {
    const m = /^summary\.(\d+)$/.exec(field);
    if (m) {
      const i = Number(m[1]);
      parts[i] = (parts[i] ?? '') + buf;
    }
  }
  return {
    itemId: b.itemId,
    kind: b.kind,
    status: b.status,
    turnId: b.turnId ?? null,
    commandId: b.commandId,
    revision: b.revision,
    text: (b.text ?? '') + (e.deltas.get('text') ?? ''),
    summary: parts,
    outputText: (b.visibleOutput ?? '') + (e.deltas.get('output') ?? ''),
    tool: b.tool,
    args: b.args,
    failureKind: b.failureKind,
    failureReason: b.failureReason,
    fallbackText: b.fallbackText,
    retracted: b.retracted ?? false,
    terminal: b.status !== 'inProgress',
  };
}

export interface TranscriptStore {
  apply(method: string, params: unknown): void;
  applyPage(events: ViewFrame[]): void;
  /** Seed from served history (resume/read inline items or snapshot state). */
  seed(items: Item[]): void;
  /**
   * Rebuild items from freshly served history and reconcile the active turn
   * against the server's session state. A locally active turn the server no
   * longer reports is over (its terminal event was missed), so it folds as
   * completed and the spinner clears. `null` items (history unserved)
   * reconciles turns only. Terminal turns are never rewritten.
   */
  resyncFromHistory(items: Item[] | null, serverActiveTurnId: string | null): void;
  snapshot(): TranscriptSnapshot;
}

export function createTranscriptStore(): TranscriptStore {
  const entries = new Map<string, Entry>();
  const order: string[] = [];
  const turns: Record<string, TurnState> = {};
  let activeTurnId: string | null = null;
  let lastCursor: string | null = null;
  let gap: { after: string; next: string } | null = null;

  function entryFor(itemId: string): Entry {
    let e = entries.get(itemId);
    if (!e) {
      e = { base: stubItem(itemId), deltas: new Map() };
      entries.set(itemId, e);
      order.push(itemId);
    }
    return e;
  }

  function apply(method: string, params: unknown): void {
    const p = (params ?? {}) as Record<string, unknown>;
    if (typeof p.viewCursor === 'string') lastCursor = p.viewCursor;
    switch (method) {
      case 'item/started': {
        const { item } = p as unknown as ItemStartedParams;
        if (!item || typeof item.itemId !== 'string') return;
        entries.set(item.itemId, { base: { ...item }, deltas: new Map() });
        if (!order.includes(item.itemId)) order.push(item.itemId);
        return;
      }
      case 'item/delta': {
        const d = p as unknown as ItemDeltaParams;
        if (typeof d.itemId !== 'string' || typeof d.delta !== 'string') return;
        const e = entryFor(d.itemId);
        const field = d.field ?? 'text';
        e.deltas.set(field, (e.deltas.get(field) ?? '') + d.delta);
        return;
      }
      case 'item/updated': {
        const { item } = p as unknown as ItemUpdatedParams;
        if (!item || typeof item.itemId !== 'string') return;
        const e = entryFor(item.itemId);
        if (item.revision > e.base.revision) {
          e.base = { ...item };
          e.deltas.clear();
        }
        return;
      }
      case 'item/completed': {
        const { item } = p as unknown as ItemCompletedParams;
        if (!item || typeof item.itemId !== 'string') return;
        entries.set(item.itemId, { base: { ...item }, deltas: new Map() });
        if (!order.includes(item.itemId)) order.push(item.itemId);
        return;
      }
      case 'turn/started': {
        const s = p as unknown as TurnStartedParams;
        if (typeof s.turnId !== 'string') return;
        turns[s.turnId] = { turnId: s.turnId, phase: 'running' };
        activeTurnId = s.turnId;
        return;
      }
      case 'turn/completed': {
        const c = p as unknown as TurnCompletedParams;
        if (typeof c.turnId !== 'string') return;
        if (c.terminal === 'failed') {
          turns[c.turnId] = {
            turnId: c.turnId,
            phase: 'failed',
            error: c.error
              ? { kind: c.error.kind, message: c.error.message, retryable: c.error.retryable }
              : { kind: 'unknown', message: c.reason ?? 'turn failed', retryable: false },
          };
        } else if (c.terminal === 'cancelled') {
          turns[c.turnId] = { turnId: c.turnId, phase: 'cancelled' };
        } else {
          turns[c.turnId] = { turnId: c.turnId, phase: 'completed' };
        }
        if (activeTurnId === c.turnId) activeTurnId = null;
        return;
      }
      case 'turn/retracted':
      case 'turn/unqueued': {
        const turnId = p.turnId;
        if (typeof turnId !== 'string') return;
        turns[turnId] = { turnId, phase: method === 'turn/retracted' ? 'retracted' : 'unqueued' };
        if (activeTurnId === turnId) activeTurnId = null;
        return;
      }
      case 'view/gap': {
        const after = p.after;
        const next = p.next;
        if (typeof after === 'string' && typeof next === 'string') gap = { after, next };
        return;
      }
      case 'muse/resubscribed': {
        gap = null;
        return;
      }
      default:
        return;
    }
  }

  function seedItems(items: Item[]): void {
    for (const item of items) {
      if (!item || typeof item.itemId !== 'string') continue;
      entries.set(item.itemId, { base: { ...item }, deltas: new Map() });
      if (!order.includes(item.itemId)) order.push(item.itemId);
    }
  }

  return {
    apply,
    applyPage(events: ViewFrame[]): void {
      for (const e of events) apply(e.method, e.params);
    },
    seed(items: Item[]): void {
      seedItems(items);
    },
    resyncFromHistory(items: Item[] | null, serverActiveTurnId: string | null): void {
      if (items) {
        entries.clear();
        order.length = 0;
        gap = null;
        seedItems(items);
      }
      if (activeTurnId && activeTurnId !== serverActiveTurnId) {
        const t = turns[activeTurnId];
        if (t && (t.phase === 'running' || t.phase === 'queued')) {
          turns[activeTurnId] = { turnId: activeTurnId, phase: 'completed' };
        }
      }
      if (serverActiveTurnId) {
        turns[serverActiveTurnId] = { turnId: serverActiveTurnId, phase: 'running' };
        activeTurnId = serverActiveTurnId;
      } else {
        activeTurnId = null;
      }
    },
    snapshot(): TranscriptSnapshot {
      return {
        items: order.map((id) => foldEntry(entries.get(id)!)),
        activeTurnId,
        turns: { ...turns },
        lastCursor,
        gap,
      };
    },
  };
}
