import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MspHost } from '../../src/msp/host';
import { ChatManager } from '../../src/msp/chat';
import { openFakeScenario } from '../helpers/fake-host';

// P3 scripted flows: live approval request→decide→resolved with the
// requirementId race guard, userInput request→answer→settled, and the
// cold-client resume→listPending reconciliation path.
function waitForEvent(
  chat: ChatManager,
  method: string,
  timeoutMs = 10000,
): Promise<{ sessionId: string; params: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeoutMs);
    const off = chat.onEvent((sessionId, got, params) => {
      if (got === method) {
        clearTimeout(timer);
        off();
        resolve({ sessionId, params: (params ?? {}) as Record<string, unknown> });
      }
    });
  });
}

describe('MSP scripted controls (fake host)', () => {
  describe('live approval', () => {
    let host: MspHost | null = null;
    let chat: ChatManager | null = null;
    before(async () => {
      host = await openFakeScenario('muse_approval', 'approval');
      chat = new ChatManager(host);
    });
    after(async () => {
      await host?.close();
    });

    it('requests, decides with the race guard, and resolves', async () => {
      const started = await chat!.startSession({ providerId: 'echo' });
      const sessionId = started.session.sessionId;
      const requested = waitForEvent(chat!, 'approval/requested');
      await chat!.sendTurn(sessionId, 'delete things');
      const { params } = await requested;
      assert.equal(params.approvalId, 'appr-1');
      const choices = params.availableChoices as Array<{ choiceId: string }>;
      assert.deepEqual(
        choices.map((c) => c.choiceId),
        ['allow-once', 'allow-session', 'deny'],
      );
      const resolved = waitForEvent(chat!, 'approval/resolved');
      const decided = await chat!.decideApproval({
        sessionId,
        approvalId: 'appr-1',
        choiceId: 'allow-once',
        requirementId: params.currentRequirementId as { approvalId: string; sourceIndex: number },
      });
      assert.equal(decided.terminal, true);
      const done = await resolved;
      assert.equal((done.params as { decision: string }).decision, 'approved');
      const pending = await chat!.listPending(sessionId);
      assert.equal(pending.approvals.length, 0);
    });

    it('rejects stale requirementIds without deciding', async () => {
      const started = await chat!.startSession({ providerId: 'echo' });
      const sessionId = started.session.sessionId;
      const requested = waitForEvent(chat!, 'approval/requested');
      await chat!.sendTurn(sessionId, 'delete more things');
      await requested;
      await assert.rejects(
        () =>
          chat!.decideApproval({
            sessionId,
            approvalId: 'appr-1',
            choiceId: 'allow-once',
            requirementId: { approvalId: 'appr-1', sourceIndex: 99 },
          }),
        /approvalRequirementStale/,
      );
      await assert.rejects(
        () =>
          chat!.decideApproval({
            sessionId,
            approvalId: 'appr-1',
            choiceId: 'nope',
            requirementId: { approvalId: 'appr-1', sourceIndex: 0 },
          }),
        /approvalChoiceInvalid/,
      );
    });
  });

  describe('live userInput', () => {
    let host: MspHost | null = null;
    let chat: ChatManager | null = null;
    before(async () => {
      host = await openFakeScenario('muse_userinput', 'userinput');
      chat = new ChatManager(host);
    });
    after(async () => {
      await host?.close();
    });

    it('requests, answers every question, and settles', async () => {
      const started = await chat!.startSession({ providerId: 'echo' });
      const sessionId = started.session.sessionId;
      const requested = waitForEvent(chat!, 'userInput/requested');
      await chat!.sendTurn(sessionId, 'ask me');
      const { params } = await requested;
      assert.equal(params.userInputId, 'ui-1');
      const settled = waitForEvent(chat!, 'userInput/settled');
      const ack = await chat!.answerUserInput(sessionId, 'ui-1', [
        { questionId: 'q1', selectedLabel: 'Yes' },
        { questionId: 'q2', freeText: 'ship it' },
      ]);
      assert.equal(ack.status, 'accepted');
      const done = await settled;
      assert.equal((done.params as { outcome: string }).outcome, 'answered');
    });

    it('rejects malformed answers without settling', async () => {
      const started = await chat!.startSession({ providerId: 'echo' });
      const sessionId = started.session.sessionId;
      const requested = waitForEvent(chat!, 'userInput/requested');
      await chat!.sendTurn(sessionId, 'ask me again');
      await requested;
      await assert.rejects(
        () =>
          chat!.answerUserInput(sessionId, 'ui-1', [
            { questionId: 'q1', selectedLabel: 'Maybe' },
            { questionId: 'q2', freeText: '' },
          ]),
        /userInputAnswerInvalid/,
      );
    });
  });

  describe('cold-client approval reconcile', () => {
    let host: MspHost | null = null;
    let chat: ChatManager | null = null;
    before(async () => {
      host = await openFakeScenario('muse_approvalresume', 'approvalresume');
      chat = new ChatManager(host);
    });
    after(async () => {
      await host?.close();
    });

    it('resumes, sees pending pointers, and pulls full payloads', async () => {
      const list = await chat!.listSessions();
      assert.equal(list.sessions[0].sessionId, 'sess-pending');
      const reissued = waitForEvent(chat!, 'approval/requested');
      const resumed = await chat!.resumeSession('sess-pending', { history: 'inline' });
      assert.equal(resumed.pendingRequests.length, 1);
      assert.equal(resumed.pendingRequests[0].approvalId, 'appr-9');
      const pulled = await chat!.listPending('sess-pending');
      assert.equal(pulled.approvals.length, 1);
      assert.equal(pulled.approvals[0].approvalId, 'appr-9');
      assert.equal(pulled.approvals[0].availableChoices.length, 3);
      const live = await reissued;
      assert.equal(live.params.approvalId, 'appr-9');
    });
  });
});
