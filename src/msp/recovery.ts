import type { MuseDeskBridge } from '../shared/bridge';
import type { Item, SessionHistory, SessionReadResult, SessionResumeResult } from './msp';
import { createTranscriptStore, type TranscriptStore } from './transcript';

type RecoveryClient = Pick<MuseDeskBridge, 'readSession' | 'resumeSession' | 'pageView' | 'subscribeView'>;
type SessionResult = SessionReadResult | SessionResumeResult;

export function itemsFromHistory(history: SessionHistory): Item[] | null {
  if (history.mode === 'inline' && history.items) return history.items;
  if ((history.mode === 'snapshot' || history.mode === 'anchoredSnapshot') &&
      history.snapshot?.schemaVersion === 1) return history.snapshot.state.items;
  return null;
}

/** Fold a finite baseline, stopping at the observed head without parsing cursors. */
async function baselineFor(client: RecoveryClient, result: SessionResult, previous: TranscriptStore): Promise<TranscriptStore> {
  const items = itemsFromHistory(result.history);
  const store = items !== null ? previous : createTranscriptStore();
  if (items !== null) {
    store.resyncFromHistory(items, result.session.activeTurnId, result.viewCursor);
    return store;
  }
  let cursor: string | undefined;
  const visited = new Set<string>();
  for (;;) {
    const page = await client.pageView(result.session.sessionId, { cursor, limit: 1000, direction: 'forward' });
    const boundary = page.events.findIndex((e) =>
      (e.params as { viewCursor?: string }).viewCursor === result.viewCursor);
    store.applyPage(boundary < 0 ? page.events : page.events.slice(0, boundary + 1));
    if (boundary >= 0) break;
    if (page.nextCursor === null) {
      if (page.events.length > 0) throw new Error('History did not reach the requested view head. Re-sync to retry.');
      break;
    }
    if (visited.has(page.nextCursor) || page.nextCursor === cursor) {
      throw new Error('History paging stopped advancing. Re-sync the session to retry.');
    }
    visited.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  if (result.session.turnCount > 0 && store.snapshot().items.length === 0) {
    throw new Error('The server returned no messages for a session with saved turns. Re-sync to retry.');
  }
  store.resyncFromHistory(null, result.session.activeTurnId);
  return store;
}

/**
 * A live-created cache entry is not proof that resume/history succeeded.
 * While rebuilding, keep the old transcript visible; reattach at the observed
 * head afterwards to replay every suffix frame received during paging. The
 * store deduplicates overlap between that replay and live delivery by cursor.
 */
export class SessionRecovery {
  readonly stores = new Map<string, TranscriptStore>();
  private hydrated = new Set<string>();
  private epoch = 0;
  private recovering = new Map<string, Promise<{ result: SessionResult; warning: string | null }>>();

  constructor(private readonly client: RecoveryClient) {}

  apply(sessionId: string, method: string, params: unknown): TranscriptStore {
    const store = this.storeFor(sessionId);
    store.apply(method, params);
    return store;
  }

  storeFor(sessionId: string): TranscriptStore {
    let store = this.stores.get(sessionId);
    if (!store) {
      store = createTranscriptStore();
      this.stores.set(sessionId, store);
    }
    return store;
  }

  markStarted(sessionId: string): void {
    this.storeFor(sessionId);
    this.hydrated.add(sessionId);
  }

  isHydrated(sessionId: string): boolean { return this.hydrated.has(sessionId); }

  clear(): void {
    this.epoch++;
    this.stores.clear();
    this.hydrated.clear();
    this.recovering.clear();
  }

  open(sessionId: string) {
    return this.recover(sessionId, () => this.client.resumeSession(sessionId, { history: 'inline' }));
  }

  resync(sessionId: string) {
    return this.recover(sessionId, () => this.client.readSession(sessionId, false));
  }

  private recover(sessionId: string, pull: () => Promise<SessionResult>) {
    const existing = this.recovering.get(sessionId);
    if (existing) return existing;
    const epoch = this.epoch;
    // Install the in-flight marker before any RPC/event can enter.
    const job = Promise.resolve().then(async () => {
      const result = await pull();
      if (this.epoch !== epoch) throw new Error('Host changed during history recovery');
      let warning: string | null = null;
      try {
        const baseline = await baselineFor(this.client, result, this.storeFor(sessionId));
        if (this.epoch !== epoch) throw new Error('Host changed during history recovery');
        this.stores.set(sessionId, baseline);
        this.hydrated.add(sessionId);
      } catch (e) {
        if (this.epoch !== epoch) throw e;
        this.hydrated.delete(sessionId);
        this.storeFor(sessionId).resyncFromHistory(null, result.session.activeTurnId);
        warning = `History could not be loaded: ${e instanceof Error ? e.message : String(e)}`;
      }
      // From this point replay/live notifications fold into the committed store.
      try {
        await this.client.subscribeView(sessionId, result.viewCursor);
      } catch (e) {
        const streamError = `Live updates unavailable: ${e instanceof Error ? e.message : String(e)}`;
        warning = warning ? `${warning} ${streamError}` : streamError;
      }
      return { result, warning };
    }).finally(() => {
      if (this.recovering.get(sessionId) === job) this.recovering.delete(sessionId);
    });
    this.recovering.set(sessionId, job);
    return job;
  }
}
