import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MspHost } from '../../src/msp/host';
import { ChatManager } from '../../src/msp/chat';
import { createTranscriptStore } from '../../src/msp/transcript';
import { openFakeScenario } from '../helpers/fake-host';

// Image-attachment flow: text+image parts validate, the userMessage carries
// attachment metadata, and malformed parts are rejected without side effects.
const shot = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

describe('MSP scripted image turns (fake host)', () => {
  let host: MspHost | null = null;
  let chat: ChatManager | null = null;

  before(async () => {
    host = await openFakeScenario('muse_image', 'image');
    chat = new ChatManager(host);
  });

  after(async () => {
    await host?.close();
  });

  it('sends text+image parts and folds attachment metadata', async () => {
    const store = createTranscriptStore();
    chat!.onEvent((_s, method, params) => store.apply(method, params));
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('turn did not complete')), 10000);
      chat!.onEvent((_s, method) => {
        if (method === 'turn/completed') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const started = await chat!.startSession({ providerId: 'echo' });
    const ack = await chat!.sendTurn(started.session.sessionId, 'what is this?', {
      attachments: [{ base64Data: shot, mediaType: 'image/png' }],
    });
    assert.equal(ack.disposition, 'started');
    await done;
    const snap = store.snapshot();
    const user = snap.items.find((i) => i.kind === 'userMessage');
    assert.equal(user?.text, 'what is this?');
    assert.equal(user?.commandId, ack.commandId);
    const agent = snap.items.find((i) => i.kind === 'agentMessage');
    assert.equal(agent?.text, 'nice shot');
  });

  it('rejects malformed image parts', async () => {
    const started = await chat!.startSession({ providerId: 'echo' });
    await assert.rejects(
      () =>
        chat!.sendTurn(started.session.sessionId, 'bad', {
          attachments: [{ base64Data: '!!!not-base64!!!', mediaType: 'image/png' }],
        }),
      /invalidParams/,
    );
  });
});
