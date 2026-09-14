import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_HIDDEN_KINDS,
  createTranscriptStore,
  visibleTranscriptItems,
} from '../../src/msp/transcript';

const S = 'sess-1';
const T = 'turn-1';

function userItem(text: string, revision = 1) {
  return { itemId: 'item-user', kind: 'userMessage', revision, status: 'completed', text, turnId: T };
}

function agentItem(text: string, status = 'inProgress', revision = 1) {
  return { itemId: 'item-agent', kind: 'agentMessage', revision, status, text, turnId: T };
}

describe('transcript fold', () => {
  it('streams deltas onto the open item and settles on completed', () => {
    const store = createTranscriptStore();
    store.apply('turn/started', { commandId: 'c1', sessionId: S, turnId: T, viewCursor: 'v1' });
    store.apply('item/started', { item: userItem('hi'), sessionId: S, viewCursor: 'v2' });
    store.apply('item/started', { item: agentItem(''), sessionId: S, viewCursor: 'v3' });
    store.apply('item/delta', { delta: 'pine', itemId: 'item-agent', sessionId: S, viewCursor: 'v4' });
    let snap = store.snapshot();
    assert.equal(snap.activeTurnId, T);
    assert.equal(snap.items.length, 2);
    assert.equal(snap.items[0].text, 'hi');
    assert.equal(snap.items[1].text, 'pine');
    assert.equal(snap.items[1].terminal, false);

    store.apply('item/delta', { delta: 'cone', itemId: 'item-agent', sessionId: S, viewCursor: 'v5' });
    store.apply('item/completed', {
      item: agentItem('pinecone', 'completed', 3),
      sessionId: S,
      viewCursor: 'v6',
    });
    store.apply('turn/completed', { sessionId: S, terminal: 'completed', turnId: T, viewCursor: 'v7' });
    snap = store.snapshot();
    assert.equal(snap.activeTurnId, null);
    assert.equal(snap.items[1].text, 'pinecone');
    assert.equal(snap.items[1].terminal, true);
    assert.equal(snap.turns[T].phase, 'completed');
    assert.equal(snap.lastCursor, 'v7');
  });

  it('applies item/updated replace-iff-higher and folds tool output deltas', () => {
    const store = createTranscriptStore();
    const tool = {
      itemId: 'item-tool',
      kind: 'toolCall',
      revision: 1,
      status: 'inProgress',
      tool: 'shell',
      args: '{"cmd":"ls"}',
      visibleOutput: '',
      turnId: T,
    };
    store.apply('item/started', { item: tool, sessionId: S, viewCursor: 'v1' });
    store.apply('item/delta', {
      delta: 'a',
      field: 'output',
      itemId: 'item-tool',
      sessionId: S,
      viewCursor: 'v2',
    });
    // Stale update (same revision) must not wipe the streamed buffer.
    store.apply('item/updated', { item: { ...tool }, sessionId: S, viewCursor: 'v3' });
    assert.equal(store.snapshot().items[0].outputText, 'a');
    // Higher revision replaces and resets buffers (already folded in).
    store.apply('item/updated', {
      item: { ...tool, revision: 2, visibleOutput: 'a' },
      sessionId: S,
      viewCursor: 'v4',
    });
    assert.equal(store.snapshot().items[0].outputText, 'a');
    assert.equal(store.snapshot().items[0].tool, 'shell');
  });

  it('records failed turns with the server error object', () => {
    const store = createTranscriptStore();
    store.apply('turn/started', { commandId: 'c1', sessionId: S, turnId: T, viewCursor: 'v1' });
    store.apply('turn/completed', {
      error: { kind: 'modelError', message: 'boom', retryable: true },
      sessionId: S,
      terminal: 'failed',
      turnId: T,
      viewCursor: 'v2',
    });
    const snap = store.snapshot();
    assert.equal(snap.activeTurnId, null);
    assert.equal(snap.turns[T].phase, 'failed');
    assert.equal(snap.turns[T].error?.message, 'boom');
    assert.equal(snap.turns[T].error?.retryable, true);
  });

  it('tracks gaps until the manager resubscribes, and ignores unknown lanes', () => {
    const store = createTranscriptStore();
    store.apply('session/tokenUsage', { sessionId: S, viewCursor: 'v9' });
    store.apply('some/future-lane', { sessionId: S, viewCursor: 'v10' });
    store.apply('view/gap', { after: 'v10', next: 'v20', sessionId: S });
    const snap = store.snapshot();
    assert.deepEqual(snap.gap, { after: 'v10', next: 'v20' });
    assert.equal(snap.lastCursor, 'v10');
    assert.equal(snap.items.length, 0);
    store.apply('muse/resubscribed', { sessionId: S });
    assert.equal(store.snapshot().gap, null);
  });

  it('seeds served history and streams live deltas on top', () => {
    const store = createTranscriptStore();
    store.seed([userItem('old prompt', 2), agentItem('old reply', 'completed', 4)]);
    let snap = store.snapshot();
    assert.equal(snap.items.length, 2);
    assert.equal(snap.items[0].text, 'old prompt');
    assert.equal(snap.items[1].text, 'old reply');
    store.apply('item/started', {
      item: agentItem('', 'inProgress', 1),
      sessionId: S,
      viewCursor: 'v60',
    });
    // Same itemId re-opens (new revision lineage starts at 1): replaces seed.
    snap = store.snapshot();
    assert.equal(snap.items.length, 2);
    assert.equal(snap.items[1].text, '');
    assert.equal(snap.items[1].terminal, false);
  });

  it('replays view/page frames in order', () => {
    const store = createTranscriptStore();
    store.applyPage([
      { method: 'turn/started', params: { commandId: 'c1', sessionId: S, turnId: T, viewCursor: 'v1' } },
      { method: 'item/started', params: { item: userItem('hi'), sessionId: S, viewCursor: 'v2' } },
      {
        method: 'item/completed',
        params: { item: userItem('hi', 2), sessionId: S, viewCursor: 'v3' },
      },
    ]);
    const snap = store.snapshot();
    assert.equal(snap.items.length, 1);
    assert.equal(snap.items[0].text, 'hi');
    assert.equal(snap.lastCursor, 'v3');
  });
});

describe('chat visibility', () => {
  it('hides reminderChild stubs but keeps messages', () => {
    const store = createTranscriptStore();
    const child = {
      itemId: 'item-child',
      kind: 'reminderChild',
      revision: 1,
      status: 'completed',
      fallbackText: 'Reminder child session',
      turnId: T,
    };
    store.apply('item/started', { item: userItem('hi'), sessionId: S, viewCursor: 'v1' });
    store.apply('item/started', { item: child, sessionId: S, viewCursor: 'v2' });
    store.apply('item/started', { item: agentItem('hello'), sessionId: S, viewCursor: 'v3' });
    const snap = store.snapshot();
    assert.equal(snap.items.length, 3); // the fold keeps everything
    const rows = visibleTranscriptItems(snap.items);
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((i) => i.kind),
      ['userMessage', 'agentMessage'],
    );
  });

  it('hides exactly the kinds the chat agreed to drop', () => {
    assert.deepEqual([...CHAT_HIDDEN_KINDS], ['reminderChild']);
  });
});

describe('resync from served history', () => {
  function startedStore() {
    const store = createTranscriptStore();
    store.apply('turn/started', { commandId: 'c1', sessionId: S, turnId: T, viewCursor: 'v1' });
    store.apply('item/started', { item: userItem('hi'), sessionId: S, viewCursor: 'v2' });
    return store;
  }

  it('rebuilds items and keeps the turn active when the server agrees', () => {
    const store = startedStore();
    store.apply('item/delta', { delta: 'stale', itemId: 'item-agent', sessionId: S, viewCursor: 'v3' });
    store.resyncFromHistory([userItem('hi'), agentItem('fresh answer', 'completed', 2)], T);
    const snap = store.snapshot();
    assert.equal(snap.activeTurnId, T);
    assert.equal(snap.turns[T].phase, 'running');
    assert.deepEqual(
      snap.items.map((i) => i.text),
      ['hi', 'fresh answer'],
    );
  });

  it('completes a stale active turn the server no longer reports', () => {
    const store = startedStore();
    store.resyncFromHistory([userItem('hi'), agentItem('late answer', 'completed', 2)], null);
    const snap = store.snapshot();
    assert.equal(snap.activeTurnId, null);
    assert.equal(snap.turns[T].phase, 'completed');
    assert.equal(snap.items.length, 2);
  });

  it('switches to a server turn the client never saw start', () => {
    const store = startedStore();
    store.resyncFromHistory([userItem('hi')], 'turn-2');
    const snap = store.snapshot();
    assert.equal(snap.activeTurnId, 'turn-2');
    assert.equal(snap.turns[T].phase, 'completed');
    assert.equal(snap.turns['turn-2'].phase, 'running');
  });

  it('reconciles turns without touching items when history is unserved', () => {
    const store = startedStore();
    store.resyncFromHistory(null, null);
    const snap = store.snapshot();
    assert.equal(snap.activeTurnId, null);
    assert.equal(snap.turns[T].phase, 'completed');
    assert.equal(snap.items.length, 1);
  });

  it('leaves terminal turns alone', () => {
    const store = startedStore();
    store.apply('turn/completed', {
      sessionId: S,
      terminal: 'failed',
      turnId: T,
      viewCursor: 'v3',
      error: { kind: 'modelError', message: 'bad', retryable: false },
    });
    store.resyncFromHistory([userItem('hi')], null);
    const snap = store.snapshot();
    assert.equal(snap.turns[T].phase, 'failed');
    assert.equal(snap.turns[T].error?.kind, 'modelError');
  });
});
