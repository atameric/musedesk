import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MspHost } from '../../src/msp/host';
import { uuidv7 } from '../../src/msp/uuid';
import { openFakeScenario } from '../helpers/fake-host';

// Scripted e2e against the deterministic fake host (test/helpers/fake-serve.mjs).
// No auth, no network, no disk: covers the same client paths as lifecycle
// in environments where the real `muse serve` cannot start.
describe('MSP scripted (fake host)', () => {
  let host: MspHost | null = null;

  before(async () => {
    host = await openFakeScenario('muse_scripted', 'chat');
  });

  after(async () => {
    await host?.close();
  });

  it('starts a session and completes a turn with streamed deltas', async () => {
    const started = (await host!.request('session/start', {
      commandId: uuidv7(),
      providerId: 'echo',
      workspaceRoot: '/tmp',
    })) as { session: { sessionId: string } };
    assert.ok(started.session.sessionId);

    const seen: string[] = [];
    let deltaText = '';
    let completedText = '';
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('turn did not complete in time')), 10000);
      host!.onNotification((n) => {
        seen.push(n.method);
        const p = n.params as { delta?: string; field?: string; item?: { text?: string } };
        if (n.method === 'item/delta' && (p.field === undefined || p.field === 'text')) {
          deltaText += p.delta ?? '';
        }
        if (n.method === 'item/completed' && p.item?.text) completedText = p.item.text;
        if (n.method === 'turn/completed') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const ack = (await host!.request('turn/start', {
      commandId: uuidv7(),
      sessionId: started.session.sessionId,
      input: [{ type: 'text', text: 'say pinecone' }],
    })) as { disposition: string; startedNewTurn: boolean };
    assert.equal(ack.disposition, 'started');
    assert.equal(ack.startedNewTurn, true);
    await done;
    assert.ok(seen.includes('turn/started'), `missing turn/started in ${seen.join(',')}`);
    assert.equal(deltaText, 'pinecone');
    assert.equal(completedText, 'pinecone');
  });
});
