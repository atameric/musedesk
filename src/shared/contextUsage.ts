import type { SessionHistory } from '../msp/msp';

/** Per-session context-window occupancy (live notification or snapshot block). */
export interface SessionContextUsage {
  usedTokens: number;
  /** Null when the basis reports no limit — never invented. */
  windowTokens: number | null;
  pressure: string;
}

function validWindow(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Validate a `(usedTokens, windowTokens?, pressure)` triple from a
 * `session/contextUsage` frame or a snapshot `contextUsage` block. Null when
 * the occupancy itself is missing; a bogus window degrades to no-limit.
 */
export function parseContextTriple(v: unknown): SessionContextUsage | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.usedTokens !== 'number' || !Number.isFinite(o.usedTokens) || o.usedTokens < 0) {
    return null;
  }
  return {
    usedTokens: o.usedTokens,
    windowTokens: validWindow(o.windowTokens),
    pressure: typeof o.pressure === 'string' ? o.pressure : 'normal',
  };
}

/** Whole-percent occupancy, or null when the basis has no limit. */
export function contextPct(u: SessionContextUsage): number | null {
  if (u.windowTokens === null || u.windowTokens <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((u.usedTokens / u.windowTokens) * 100)));
}

/** Adopt the snapshot `contextUsage` block when a snapshot history serves one. */
export function snapshotContextUsage(history: SessionHistory): SessionContextUsage | null {
  if (
    (history.mode === 'snapshot' || history.mode === 'anchoredSnapshot') &&
    history.snapshot?.state
  ) {
    const block = (history.snapshot.state as { contextUsage?: unknown }).contextUsage;
    if (block !== undefined) return parseContextTriple(block);
  }
  return null;
}
