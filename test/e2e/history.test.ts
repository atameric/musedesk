import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MspHost } from '../../src/msp/host';
import { ChatManager } from '../../src/msp/chat';
import { createTranscriptStore } from '../../src/msp/transcript';
import { openFakeScenario } from '../helpers/fake-host';

// P2 scripted flows: list sessions, resume with inline history into the
// real TranscriptStore, metadata read, new session, unknown-session error.
describe('MSP scripted history (fake host)', () => {
  let host: MspHost | null = null;
  let chat: ChatManager | null = null;

  before(async () => {
    host = await openFakeScenario('muse_history', 'history');
    chat = new ChatManager(host);
  });

  after(async () => {
    await host?.close();
  });

  it('lists stored sessions newest-first', async () => {
    const list = await chat!.listSessions();
    assert.equal(list.nextCursor, null);
    assert.equal(list.sessions.length, 2);
    assert.equal(list.sessions[0].sessionId, 'sess-new');
    assert.equal(list.sessions[1].sessionId, 'sess-old');
    assert.equal(list.sessions[1].turnCount, 2);
  });

  it('resumes a session and seeds served history', async () => {
    const store = createTranscriptStore();
    const resumed = await chat!.resumeSession('sess-old', { history: 'inline' });
    assert.equal(resumed.session.sessionId, 'sess-old');
    assert.equal(resumed.history.mode, 'inline');
    assert.deepEqual(resumed.pendingRequests, []);
    if (resumed.history.items) store.seed(resumed.history.items);
    const snap = store.snapshot();
    assert.equal(snap.items.length, 2);
    assert.equal(snap.items[0].kind, 'userMessage');
    assert.equal(snap.items[0].text, 'old prompt');
    assert.equal(snap.items[1].text, 'old reply');
  });

  it('reads metadata without attaching and starts fresh sessions', async () => {
    const read = await chat!.readSession('sess-old');
    assert.equal(read.session.sessionId, 'sess-old');
    assert.equal(read.history.mode, 'none');
    const started = await chat!.startSession({ providerId: 'echo' });
    assert.equal(started.session.sessionId, 'sess-fresh');
  });

  it('surfaces unknown-session errors', async () => {
    await assert.rejects(() => chat!.resumeSession('sess-nope'), /sessionNotFound|not found/);
  });

  describe('in-use fallback', () => {
    let liveHost: MspHost | null = null;
    let liveChat: ChatManager | null = null;
    before(async () => {
      liveHost = await openFakeScenario('muse_inuse', 'inuse');
      liveChat = new ChatManager(liveHost);
    });
    after(async () => {
      await liveHost?.close();
    });

    it('skips the session held by another window and opens the next one', async () => {
      const list = await liveChat!.listSessions();
      assert.equal(list.sessions[0].sessionId, 'sess-live');
      // Boot order: newest first, skip failures, resume the next.
      let opened: string | null = null;
      for (const s of list.sessions) {
        try {
          const resumed = await liveChat!.resumeSession(s.sessionId, { history: 'inline' });
          const store = createTranscriptStore();
          if (resumed.history.items) store.seed(resumed.history.items);
          assert.equal(store.snapshot().items[0].text, 'old2 prompt');
          opened = s.sessionId;
          break;
        } catch (e) {
          assert.match(e instanceof Error ? e.message : String(e), /sessionInUse/);
        }
      }
      assert.equal(opened, 'sess-old2');
      // …and a fresh start always remains available.
      const started = await liveChat!.startSession({ providerId: 'echo' });
      assert.equal(started.session.sessionId, 'sess-fresh-2');
    });
  });
});
