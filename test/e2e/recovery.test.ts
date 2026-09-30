import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatManager } from '../../src/msp/chat';
import { SessionRecovery } from '../../src/msp/recovery';
import { openFakeScenario } from '../helpers/fake-host';

describe('MSP history and live recovery', () => {
  it('resumes a cache created by notifications, pages unavailable history, and replays the live suffix once', async () => {
    const host = await openFakeScenario('recovery-test', 'recovery');
    try {
      const chat = new ChatManager(host);
      const recovery = new SessionRecovery(chat);
      chat.onEvent((id, method, params) => recovery.apply(id, method, params));
      const list = await chat.listSessions();
      const id = list.sessions[0].sessionId;
      assert.ok(recovery.stores.has(id));
      assert.equal(recovery.isHydrated(id), false);
      const opened = await recovery.open(id);
      assert.equal(opened.warning, null);
      assert.equal(recovery.isHydrated(id), true);
      const snapshot = recovery.storeFor(id).snapshot();
      assert.deepEqual(snapshot.items.map((item) => item.text), ['saved prompt', 'saved reply suffix']);
      assert.equal(snapshot.activeTurnId, null);
      assert.equal(snapshot.turns['turn-recovery'].phase, 'failed');
      assert.equal(snapshot.turns['turn-recovery'].error?.kind, 'configError');
      assert.equal(snapshot.lastCursor, 'v6');
    } finally { await host.close(); }
  });
});
