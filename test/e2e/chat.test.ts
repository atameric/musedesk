import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MspHost } from '../../src/msp/host';
import { ChatManager } from '../../src/msp/chat';
import { createTranscriptStore } from '../../src/msp/transcript';
import { uuidv7 } from '../../src/msp/uuid';
import { openFakeScenario } from '../helpers/fake-host';

// P1 scripted flows: failure surfacing and gap recovery, folded through
// the real TranscriptStore the renderer uses.
describe('MSP scripted chat flows (fake host)', () => {
  describe('failed turn', () => {
    let host: MspHost | null = null;
    before(async () => {
      host = await openFakeScenario('muse_chatfail', 'chatfail');
    });
    after(async () => {
      await host?.close();
    });

    it('surfaces the server error object on the folded turn', async () => {
      const store = createTranscriptStore();
      host!.onNotification((n) => store.apply(n.method, n.params));
      const started = (await host!.request('session/start', {
        commandId: uuidv7(),
        providerId: 'echo',
      })) as { session: { sessionId: string } };
      const ack = (await host!.request('turn/start', {
        commandId: uuidv7(),
        sessionId: started.session.sessionId,
        input: [{ type: 'text', text: 'boom please' }],
      })) as { turnId: string };
      const done = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('turn did not settle')), 10000);
        host!.onNotification((n) => {
          if (n.method === 'turn/completed') {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      await done;
      const snap = store.snapshot();
      assert.equal(snap.turns[ack.turnId].phase, 'failed');
      assert.equal(snap.turns[ack.turnId].error?.message, 'fake boom');
      assert.equal(snap.turns[ack.turnId].error?.retryable, true);
      assert.equal(snap.activeTurnId, null);
    });
  });

  describe('gap recovery', () => {
    let host: MspHost | null = null;
    let chat: ChatManager | null = null;
    before(async () => {
      host = await openFakeScenario('muse_chatgap', 'chatgap');
      chat = new ChatManager(host);
    });
    after(async () => {
      await host?.close();
    });

    it('resubscribes once and folds the replayed suffix', async () => {
      const store = createTranscriptStore();
      const methods: string[] = [];
      chat!.onEvent((_s, method, params) => {
        methods.push(method);
        store.apply(method, params);
      });
      const resubscribed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no resubscribe within timeout')), 10000);
        chat!.onEvent((_s, method) => {
          if (method === 'muse/resubscribed') {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      const started = await chat!.startSession({ providerId: 'echo' });
      const ack = await chat!.sendTurn(started.session.sessionId, 'heal me');
      assert.equal(ack.disposition, 'started');
      await resubscribed;
      // Let any duplicate resubscribe (client loop) surface; the fake fails it loudly.
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(
        methods.filter((m) => m === 'muse/resubscribed').length,
        1,
        `expected exactly one resubscribe in ${methods.join(',')}`,
      );
      const snap = store.snapshot();
      assert.equal(snap.gap, null);
      const agent = snap.items.find((i) => i.kind === 'agentMessage');
      assert.equal(agent?.text, 'gap healed');
    });
  });
});
