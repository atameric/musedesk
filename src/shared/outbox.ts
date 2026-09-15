import type { TurnStartDisposition } from '../msp/msp';

/** What the server did with a `turn/start` submit (tdd SS3.2). */
export type SendOutcome = 'started' | 'queued' | 'steered' | 'unknown';

/**
 * Classify a `turn/start` ack disposition. The protocol has no
 * `turn/queued` notification, so this ack field is the client's only queue
 * signal — anything unrecognized must fail safe (restore the draft, never
 * silently drop the submit).
 */
export function classifySendOutcome(disposition: TurnStartDisposition): SendOutcome {
  switch (disposition) {
    case 'started':
      return 'started';
    case 'queued':
      return 'queued';
    case 'steered':
      return 'steered';
    default:
      return 'unknown';
  }
}

/** A submit the server accepted into the queue: shown until it launches. */
export interface QueuedTurn {
  /** Pre-minted turn id from the ack; `turn/started` carries it at launch. */
  turnId: string;
  /** Echoes the submitting command; keys optimistic shot thumbnails. */
  commandId: string;
  text: string;
  shotCount: number;
}

/** Track a queued submit (dedupe by turnId; latest wins). */
export function addQueuedTurn(list: QueuedTurn[], entry: QueuedTurn): QueuedTurn[] {
  return [...list.filter((q) => q.turnId !== entry.turnId), entry];
}

/** Drop a queued submit by turnId; returns the entry when it was tracked. */
export function takeQueuedTurn(
  list: QueuedTurn[],
  turnId: string,
): { list: QueuedTurn[]; removed: QueuedTurn | null } {
  const removed = list.find((q) => q.turnId === turnId) ?? null;
  if (!removed) return { list, removed: null };
  return { list: list.filter((q) => q.turnId !== turnId), removed };
}
