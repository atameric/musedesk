import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { discoverMuse } from '../../src/msp/discovery';
import { MspHost } from '../../src/msp/host';
import { PINNED_FINGERPRINT } from '../../src/msp/pinned';
import { uuidv7 } from '../../src/msp/uuid';

// End-to-end against the real `muse serve` on the echo provider.
// Creates one durable session and deletes it afterwards.
//
// Environmental skip: the real host needs provider auth (it reads the
// credential store at startup). In sandboxed/CI environments without auth
// this test skips with a diagnostic instead of failing; the scripted
// suite (scripted.test.ts) covers the same client paths deterministically.
function isEnvironmentalFailure(message: string): boolean {
  return /auth|permission|not permitted|denied|ENOENT|not found on PATH/i.test(message);
}

describe('MSP lifecycle (echo provider)', () => {
  let host: MspHost | null = null;
  let unavailable: string | null = null;
  let sessionId = '';
  let sessionPath = '';

  before(async () => {
    try {
      const install = discoverMuse();
      const h = new MspHost(install.binPath, 'musedesk_e2e', '0.0.0');
      host = h;
      const init = await h.connect();
      assert.equal(init.schema.fingerprint, PINNED_FINGERPRINT);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const tail = host?.stderrTail ?? '';
      unavailable = `${message}${tail ? ` | stderr: ${tail.slice(0, 300)}` : ''}`;
      try {
        await host?.close();
      } catch {
        /* best effort */
      }
      host = null;
    }
  });

  after(async () => {
    await host?.close();
    if (sessionPath) rmSync(sessionPath, { recursive: true, force: true });
  });

  it('starts an echo session and completes a turn', async (t) => {
    if (unavailable) {
      if (!isEnvironmentalFailure(unavailable)) throw new Error(`real host failed: ${unavailable}`);
      console.log(`SKIP lifecycle: real host unavailable (${unavailable.slice(0, 200)})`);
      t.skip('muse serve unavailable in this environment');
      return;
    }
    const started = (await host!.request('session/start', {
      commandId: uuidv7(),
      providerId: 'echo',
      workspaceRoot: '/tmp',
    })) as { session: { sessionId: string; path: string } };
    sessionId = started.session.sessionId;
    sessionPath = started.session.path.replace(/\/session\.jsonl$/, '');
    assert.ok(sessionId);

    const seen: string[] = [];
    const done = new Promise<void>((resolve, reject) => {
      // CLI 1.2.1 fans out reminderChild sub-sessions per turn and
      // turn/completed waits for them (~34s observed on echo) — budget 90s.
      const timer = setTimeout(() => reject(new Error('turn did not complete in time')), 90000);
      host!.onNotification((n) => {
        seen.push(n.method);
        if (n.method === 'turn/completed') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const ack = (await host!.request('turn/start', {
      commandId: uuidv7(),
      sessionId,
      input: [{ type: 'text', text: 'say pinecone' }],
    })) as { disposition: string; startedNewTurn: boolean };
    assert.equal(ack.disposition, 'started');
    assert.equal(ack.startedNewTurn, true);
    await done;
    assert.ok(seen.includes('turn/started'), `missing turn/started in ${seen.join(',')}`);
    assert.ok(seen.includes('item/completed'), `missing item/completed in ${seen.join(',')}`);
  });
});
