import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionRecovery } from '../../src/msp/recovery';
import type { SessionReadResult, Session, Item, ViewPageResult } from '../../src/msp/msp';

const id = 'session-recovery';
const item: Item = { itemId: 'agent', kind: 'agentMessage', revision: 1, status: 'inProgress', text: 'saved', turnId: 'turn-1' };

function result(inline = false): SessionReadResult {
  return {
    session: { sessionId: id, activeTurnId: null, status: 'idle', turnCount: 1 } as Session,
    history: inline ? { mode: 'inline', items: [item], snapshot: null }
      : { mode: 'none', noneReason: 'projectionUnavailable', items: null, snapshot: null },
    pendingRequests: [], viewCursor: 'head',
  };
}

function clientFor(read: SessionReadResult) {
  return {
    readSession: async () => read,
    resumeSession: async () => read,
    pageView: async (): Promise<ViewPageResult> => historyPage(),
    subscribeView: async () => ({ viewCursor: 'head' }),
  };
}

function historyPage(): ViewPageResult {
  const params = {
    sessionId: id, item, viewCursor: 'head',
    sourceRange: { first: { id: 'record-1', sequence: 1 }, last: { id: 'record-1', sequence: 1 }, stream: { id: 'run-1', kind: 'run' } },
  };
  return { events: [{ method: 'item/completed', params }], nextCursor: null };
}

describe('session recovery failures and races', () => {
  it('preserves cached messages on a paging failure and retries history on the next open', async () => {
    const client = clientFor(result());
    let attempts = 0;
    client.pageView = async () => {
      if (++attempts === 1) throw new Error('projection unavailable');
      return historyPage();
    };
    const recovery = new SessionRecovery(client);
    recovery.apply(id, 'item/started', { item });
    const first = await recovery.open(id);
    assert.match(first.warning!, /History could not be loaded/);
    assert.equal(recovery.storeFor(id).snapshot().items[0].text, 'saved');
    assert.equal(recovery.isHydrated(id), false);
    const second = await recovery.open(id);
    assert.equal(second.warning, null);
    assert.equal(recovery.isHydrated(id), true);
    assert.equal(attempts, 2);
  });

  it('does not lose or duplicate a delta delivered while the snapshot is loading', async () => {
    const read = result(true);
    read.session.activeTurnId = 'turn-1';
    let resolveRead!: (value: SessionReadResult) => void;
    const client = clientFor(read);
    client.readSession = () => new Promise((resolve) => { resolveRead = resolve; });
    const recovery = new SessionRecovery(client);
    recovery.apply(id, 'item/started', { item, viewCursor: 'before' });
    const frame = { itemId: item.itemId, delta: ' suffix', viewCursor: 'suffix' };
    client.subscribeView = async () => {
      recovery.apply(id, 'item/delta', frame);
      recovery.apply(id, 'item/delta', frame);
      recovery.apply(id, 'turn/completed', { turnId: 'turn-1', terminal: 'completed', viewCursor: 'terminal' });
      return { viewCursor: 'terminal' };
    };
    const pending = recovery.resync(id);
    await Promise.resolve();
    recovery.apply(id, 'item/delta', frame);
    resolveRead(read);
    await pending;
    assert.equal(recovery.storeFor(id).snapshot().items[0].text, 'saved suffix');
    assert.equal(recovery.storeFor(id).snapshot().activeTurnId, null);
  });

  it('retains the failed-turn diagnostic when resync serves inline items', async () => {
    const recovery = new SessionRecovery(clientFor(result(true)));
    recovery.apply(id, 'turn/completed', {
      turnId: 'turn-1', terminal: 'failed', error: { kind: 'configError', message: 'MCP audit failed', retryable: false },
    });
    await recovery.resync(id);
    const turn = recovery.storeFor(id).snapshot().turns['turn-1'];
    assert.equal(turn.phase, 'failed');
    assert.equal(turn.error?.message, 'MCP audit failed');
  });

  it('reports a cursor cycle without replacing the visible transcript', async () => {
    const client = clientFor(result());
    client.pageView = async () => ({ events: [], nextCursor: 'repeating-cursor' });
    const recovery = new SessionRecovery(client);
    recovery.apply(id, 'item/started', { item });
    const recovered = await recovery.open(id);
    assert.match(recovered.warning!, /stopped advancing/);
    assert.equal(recovery.storeFor(id).snapshot().items[0].text, 'saved');
  });

  it('keeps history visible when live subscription fails', async () => {
    const client = clientFor(result(true));
    client.subscribeView = async () => { throw new Error('stream unavailable'); };
    const recovery = new SessionRecovery(client);
    const recovered = await recovery.open(id);
    assert.match(recovered.warning!, /Live updates unavailable/);
    assert.equal(recovery.storeFor(id).snapshot().items[0].text, 'saved');
  });

  it('coalesces overlapping reads and invalidates a result from a replaced host', async () => {
    let resolveRead!: (value: SessionReadResult) => void;
    const client = clientFor(result(true));
    client.readSession = () => new Promise((resolve) => { resolveRead = resolve; });
    const recovery = new SessionRecovery(client);
    const pending = recovery.resync(id);
    assert.equal(recovery.resync(id), pending);
    await Promise.resolve();
    recovery.clear();
    resolveRead(result(true));
    await assert.rejects(pending, /Host changed/);
    assert.equal(recovery.stores.size, 0);
  });
});
