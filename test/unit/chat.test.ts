import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IMspClient, MspEvent } from '../../src/msp/host';
import { ChatManager } from '../../src/msp/chat';

class StubClient implements IMspClient {
  connected = true;
  initializeResult: null = null;
  stderrTail = '';
  requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  handlers = new Set<(n: MspEvent) => void>();
  failOn = new Set<string>();

  async connect(): Promise<never> {
    throw new Error('not implemented');
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.requests.push({ method, params });
    if (this.failOn.has(method)) throw new Error(`${method} failed`);
    return { ok: true };
  }

  onNotification(fn: (n: MspEvent) => void): () => void {
    this.handlers.add(fn);
    return () => {
      this.handlers.delete(fn);
    };
  }

  emit(method: string, params: unknown): void {
    for (const h of this.handlers) h({ method, params });
  }

  async close(): Promise<void> {
    this.connected = false;
  }
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('ChatManager', () => {
  it('starts sessions with a fresh uuidv7 commandId and passes options through', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    await chat.startSession({ providerId: 'echo', workspaceRoot: '/tmp' });
    assert.equal(stub.requests.length, 1);
    const { method, params } = stub.requests[0];
    assert.equal(method, 'session/start');
    assert.match(String(params.commandId), UUID_V7);
    assert.equal(params.providerId, 'echo');
    assert.equal(params.workspaceRoot, '/tmp');
    assert.ok(!('modelId' in params), 'undefined options must be stripped');
  });

  it('rejects empty turns and builds text parts with effort/ifBusy', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    await assert.rejects(() => chat.sendTurn('s1', '   '), /empty turn/);
    assert.equal(stub.requests.length, 0);
    await chat.sendTurn('s1', 'hello', { reasoningEffort: 'low', ifBusy: 'queue' });
    const { method, params } = stub.requests[0];
    assert.equal(method, 'turn/start');
    assert.equal(params.sessionId, 's1');
    assert.deepEqual(params.input, [{ type: 'text', text: 'hello' }]);
    assert.equal(params.displayText, 'hello');
    assert.equal(params.reasoningEffort, 'low');
    assert.equal(params.ifBusy, 'queue');
  });

  it('sends image parts alongside or without text', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    const shots = [
      { base64Data: 'aGk=', mediaType: 'image/png' },
      { base64Data: 'aGk=', mediaType: 'image/jpeg' },
    ];
    await chat.sendTurn('s1', 'look', { attachments: shots });
    assert.deepEqual(stub.requests[0].params.input, [
      { type: 'text', text: 'look' },
      { type: 'image', base64Data: 'aGk=', mediaType: 'image/png' },
      { type: 'image', base64Data: 'aGk=', mediaType: 'image/jpeg' },
    ]);
    await chat.sendTurn('s1', '', { attachments: shots.slice(0, 1) });
    assert.deepEqual(stub.requests[1].params.input, [
      { type: 'image', base64Data: 'aGk=', mediaType: 'image/png' },
    ]);
    assert.ok(!('displayText' in stub.requests[1].params), 'no displayText on image-only turns');
    await assert.rejects(() => chat.sendTurn('s1', '  '), /empty turn/);
    await assert.rejects(
      () => chat.sendTurn('s1', 'x', { attachments: Array.from({ length: 6 }, () => shots[0]) }),
      /more than 5 images/,
    );
    await assert.rejects(
      () => chat.sendTurn('s1', 'x', { attachments: [{ base64Data: '', mediaType: 'image/png' }] }),
      /base64 data/,
    );
    await assert.rejects(
      () => chat.sendTurn('s1', 'x', { attachments: [{ base64Data: 'aGk=', mediaType: 'text/plain' }] }),
      /base64 data/,
    );
  });

  it('interrupts and pages with typed params', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    await chat.interruptTurn('s1', 't1', true);
    assert.equal(stub.requests[0].method, 'turn/interrupt');
    assert.equal(stub.requests[0].params.turnId, 't1');
    assert.equal(stub.requests[0].params.retract, true);
    await chat.pageView('s1', { cursor: 'v5', limit: 10 });
    assert.equal(stub.requests[1].method, 'view/page');
    assert.equal(stub.requests[1].params.cursor, 'v5');
    assert.equal(stub.requests[1].params.limit, 10);
    await chat.pageView('s1');
    assert.equal(stub.requests[2].params.limit, 100);
  });

  it('lists, resumes, and reads sessions with the right params', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    await chat.listSessions({ limit: 10 });
    assert.equal(stub.requests[0].method, 'session/list');
    assert.equal(stub.requests[0].params.limit, 10);
    assert.ok(!('commandId' in stub.requests[0].params), 'reads carry no commandId');
    await chat.resumeSession('s1', { history: 'inline' });
    assert.equal(stub.requests[1].method, 'session/resume');
    assert.match(String(stub.requests[1].params.commandId), UUID_V7);
    assert.equal(stub.requests[1].params.history, 'inline');
    await chat.readSession('s1', false);
    assert.equal(stub.requests[2].method, 'session/read');
    assert.equal(stub.requests[2].params.excludeItems, false);
  });

  it('drives model, approval-mode, approval, and user-input commands', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    await chat.listModels('s1');
    assert.equal(stub.requests[0].method, 'model/list');
    assert.ok(!('commandId' in stub.requests[0].params), 'reads carry no commandId');
    await chat.setModel('s1', { modelId: 'm1', providerId: 'meta' });
    assert.equal(stub.requests[1].method, 'session/setModel');
    assert.match(String(stub.requests[1].params.commandId), UUID_V7);
    assert.deepEqual(stub.requests[1].params.model, { modelId: 'm1', providerId: 'meta' });
    await chat.setApprovalMode('s1', 'onRequest');
    assert.equal(stub.requests[2].method, 'session/setApprovalMode');
    assert.equal(stub.requests[2].params.mode, 'onRequest');

    const req = { approvalId: 'a1', sourceIndex: 0 };
    await chat.decideApproval({ sessionId: 's1', approvalId: 'a1', choiceId: 'c1', requirementId: req });
    assert.equal(stub.requests[3].method, 'approval/decide');
    assert.deepEqual(stub.requests[3].params.requirementId, req);
    assert.ok(!('feedback' in stub.requests[3].params), 'absent feedback must be omitted');
    await chat.decideApproval({
      sessionId: 's1',
      approvalId: 'a1',
      choiceId: 'c2',
      requirementId: req,
      feedback: 'why not',
    });
    assert.equal(stub.requests[4].params.feedback, 'why not');

    await chat.listPending('s1');
    assert.equal(stub.requests[5].method, 'approval/listPending');
    assert.ok(!('commandId' in stub.requests[5].params), 'reads carry no commandId');

    await chat.answerUserInput('s1', 'u1', [{ questionId: 'q1', selectedLabel: 'Yes' }]);
    assert.equal(stub.requests[6].method, 'userInput/answer');
    await chat.cancelUserInput('s1', 'u1', 'skip');
    assert.equal(stub.requests[7].method, 'userInput/cancel');
    assert.equal(stub.requests[7].params.reason, 'skip');
  });

  it('forwards notifications with their sessionId', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    const got: Array<{ sessionId: string; method: string }> = [];
    chat.onEvent((sessionId, method) => got.push({ sessionId, method }));
    stub.emit('turn/started', { sessionId: 's1', turnId: 't1' });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(got, [{ sessionId: 's1', method: 'turn/started' }]);
  });

  it('recovers each view/gap with exactly one resubscribe', async () => {
    const stub = new StubClient();
    const chat = new ChatManager(stub);
    const methods: string[] = [];
    chat.onEvent((_s, method) => methods.push(method));
    const gap = { after: 'v1', next: 'v9', sessionId: 's1' };
    stub.emit('view/gap', gap);
    stub.emit('view/gap', gap); // duplicate delivery
    await new Promise((r) => setImmediate(r, 0));
    await new Promise((r) => setTimeout(r, 10));
    const subs = stub.requests.filter((q) => q.method === 'view/subscribe');
    assert.equal(subs.length, 1);
    assert.deepEqual(subs[0].params, { sessionId: 's1', after: 'v1' });
    assert.deepEqual(methods, ['view/gap', 'view/gap', 'muse/resubscribed']);
  });

  it('surfaces resubscribe failures instead of looping', async () => {
    const stub = new StubClient();
    stub.failOn.add('view/subscribe');
    const chat = new ChatManager(stub);
    const methods: string[] = [];
    chat.onEvent((_s, method) => methods.push(method));
    stub.emit('view/gap', { after: 'v1', next: 'v9', sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(methods, ['view/gap', 'muse/resubscribeFailed']);
    assert.equal(stub.requests.filter((q) => q.method === 'view/subscribe').length, 1);
  });
});
