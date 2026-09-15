// Deterministic fake `muse serve` for scripted e2e tests.
// Speaks newline-delimited JSON-RPC 2.0 on stdio. No auth, no network, no disk.
// Usage: node fake-serve.mjs <scenario>   (scenarios: chat, ...)
//
// The fake is intentionally strict about handshake order (initialize first)
// but lenient about shapes it does not assert on: tests assert OUR client's
// behavior, not the server's. Anything scenario-specific lives in SCENARIOS.

import readline from 'node:readline';

const scenario = process.argv[2] || '';
const FINGERPRINT = process.env.MSP_FAKE_FINGERPRINT || 'sha256:fake';

let cursor = 0;
const nextCursor = () => `v${++cursor}`;
const NOW = '2026-09-12T00:00:00.000Z';

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const result = (id, payload) => send({ jsonrpc: '2.0', id, result: payload });
const failure = (id, code, message, data) =>
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
const notify = (method, params) =>
  send({ jsonrpc: '2.0', method, params: { ...params, viewCursor: nextCursor() } });

function baseSession(sessionId) {
  return {
    activeTurnId: null,
    createdAt: NOW,
    forkedFrom: null,
    modelId: null,
    path: `/tmp/fake-muse/${sessionId}/session.jsonl`,
    providerId: 'echo',
    sessionId,
    status: 'idle',
    turnCount: 0,
    updatedAt: NOW,
    workspaceRoot: '/tmp',
  };
}

function userItem(sessionId, turnId, text) {
  return {
    itemId: `item-user-${turnId}`,
    kind: 'userMessage',
    revision: 1,
    status: 'completed',
    text,
    turnId,
  };
}

function agentItem(sessionId, turnId, text, status = 'completed', revision = 1) {
  return {
    itemId: `item-agent-${turnId}`,
    kind: 'agentMessage',
    revision,
    status,
    text,
    turnId,
  };
}

const SCENARIOS = {
  chat: {
    onRequest(method, params, id) {
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-chat-1'), viewCursor: nextCursor() });
        return true;
      }
      if (method === 'turn/start') {
        const turnId = params.commandId;
        result(id, {
          commandId: params.commandId,
          disposition: 'started',
          startedNewTurn: true,
          status: 'accepted',
          turnId,
        });
        const text = (params.input || [])
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('');
        notify('turn/started', { commandId: params.commandId, sessionId: params.sessionId, turnId });
        notify('item/started', { item: userItem(params.sessionId, turnId, text), sessionId: params.sessionId });
        notify('item/completed', {
          item: { ...userItem(params.sessionId, turnId, text), revision: 2 },
          sessionId: params.sessionId,
        });
        notify('item/started', {
          item: agentItem(params.sessionId, turnId, '', 'inProgress'),
          sessionId: params.sessionId,
        });
        notify('item/delta', { delta: 'pine', itemId: `item-agent-${turnId}`, sessionId: params.sessionId });
        notify('item/delta', { delta: 'cone', itemId: `item-agent-${turnId}`, sessionId: params.sessionId });
        notify('item/completed', {
          item: agentItem(params.sessionId, turnId, 'pinecone'),
          sessionId: params.sessionId,
        });
        notify('turn/completed', {
          sessionId: params.sessionId,
          terminal: 'completed',
          turnId,
        });
        return true;
      }
      return false;
    },
  },
  chatfail: {
    onRequest(method, params, id) {
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-chatfail-1'), viewCursor: nextCursor() });
        return true;
      }
      if (method === 'turn/start') {
        const turnId = params.commandId;
        result(id, {
          commandId: params.commandId,
          disposition: 'started',
          startedNewTurn: true,
          status: 'accepted',
          turnId,
        });
        notify('turn/started', { commandId: params.commandId, sessionId: params.sessionId, turnId });
        notify('turn/completed', {
          error: { kind: 'modelError', message: 'fake boom', retryable: true },
          sessionId: params.sessionId,
          terminal: 'failed',
          turnId,
        });
        return true;
      }
      return false;
    },
  },
  chatgap: {
    subscribed: false,
    onRequest(method, params, id) {
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-gap-1'), viewCursor: nextCursor() });
        return true;
      }
      if (method === 'turn/start') {
        const turnId = params.commandId;
        result(id, {
          commandId: params.commandId,
          disposition: 'started',
          startedNewTurn: true,
          status: 'accepted',
          turnId,
        });
        notify('turn/started', { commandId: params.commandId, sessionId: params.sessionId, turnId });
        // Drop the middle of the stream; the client must resubscribe from `after`.
        notify('view/gap', { after: 'v1', next: 'v9', sessionId: params.sessionId });
        return true;
      }
      if (method === 'view/subscribe') {
        if (this.subscribed) {
          failure(id, -32000, 'fake-serve[chatgap]: duplicate subscribe (client loops)');
          return true;
        }
        this.subscribed = true;
        result(id, { viewCursor: 'v9' });
        const turnId = 'replayed-turn';
        notify('item/started', {
          item: userItem(params.sessionId, turnId, 'healed prompt'),
          sessionId: params.sessionId,
        });
        notify('item/completed', {
          item: { ...userItem(params.sessionId, turnId, 'healed prompt'), revision: 2 },
          sessionId: params.sessionId,
        });
        notify('item/started', {
          item: agentItem(params.sessionId, turnId, '', 'inProgress'),
          sessionId: params.sessionId,
        });
        notify('item/delta', {
          delta: 'gap healed',
          itemId: `item-agent-${turnId}`,
          sessionId: params.sessionId,
        });
        notify('item/completed', {
          item: agentItem(params.sessionId, turnId, 'gap healed'),
          sessionId: params.sessionId,
        });
        return true;
      }
      return false;
    },
  },
  queued: {
    running: null,
    onRequest(method, params, id) {
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-queue-1'), viewCursor: nextCursor() });
        return true;
      }
      if (method === 'turn/start') {
        if (!this.running) {
          // First submit starts the running turn the second queues behind.
          this.running = params.commandId;
          const turnId = params.commandId;
          result(id, {
            commandId: params.commandId,
            disposition: 'started',
            startedNewTurn: true,
            status: 'accepted',
            turnId,
          });
          notify('turn/started', { commandId: params.commandId, sessionId: params.sessionId, turnId });
          notify('item/started', {
            item: userItem(params.sessionId, turnId, 'first'),
            sessionId: params.sessionId,
          });
          return true;
        }
        // Busy submit: queued ack with a pre-minted turn id and NO events
        // until the launch boundary (the protocol has no turn/queued lane).
        result(id, {
          commandId: params.commandId,
          disposition: 'queued',
          startedNewTurn: false,
          status: 'accepted',
          turnId: 'queued-turn-1',
        });
        return true;
      }
      if (method === 'turn/interrupt') {
        const running = this.running;
        this.running = null;
        result(id, { commandId: params.commandId, status: 'accepted', turnId: running });
        notify('turn/completed', {
          sessionId: params.sessionId,
          terminal: 'cancelled',
          turnId: running,
        });
        // Launch boundary: the queued turn starts with its user echo.
        const turnId = 'queued-turn-1';
        notify('turn/started', { commandId: 'cmd-queued-1', sessionId: params.sessionId, turnId });
        notify('item/started', {
          item: userItem(params.sessionId, turnId, 'second'),
          sessionId: params.sessionId,
        });
        notify('item/completed', {
          item: { ...userItem(params.sessionId, turnId, 'second'), revision: 2 },
          sessionId: params.sessionId,
        });
        notify('turn/completed', {
          sessionId: params.sessionId,
          terminal: 'completed',
          turnId,
        });
        return true;
      }
      return false;
    },
  },
  history: {
    onRequest(method, params, id) {
      if (method === 'session/list') {
        const fresh = { ...baseSession('sess-new'), updatedAt: '2026-09-12T01:00:00.000Z', turnCount: 0 };
        const old = {
          ...baseSession('sess-old'),
          updatedAt: '2026-09-11T23:00:00.000Z',
          turnCount: 2,
          workspaceRoot: '/tmp/old-work',
        };
        result(id, { nextCursor: null, sessions: [fresh, old] });
        return true;
      }
      if (method === 'session/resume') {
        if (params.sessionId !== 'sess-old') {
          failure(id, -32020, 'session not found', {
            kind: 'sessionNotFound',
            sessionId: params.sessionId,
          });
          return true;
        }
        const turnId = 'old-turn-1';
        result(id, {
          history: {
            items: [
              { ...userItem(params.sessionId, turnId, 'old prompt'), revision: 2 },
              { ...agentItem(params.sessionId, turnId, 'old reply'), revision: 4 },
            ],
            mode: 'inline',
            snapshot: null,
          },
          pendingRequests: [],
          session: {
            ...baseSession('sess-old'),
            status: 'idle',
            turnCount: 2,
            updatedAt: '2026-09-11T23:00:00.000Z',
            workspaceRoot: '/tmp/old-work',
          },
          viewCursor: 'v55',
        });
        return true;
      }
      if (method === 'session/read') {
        result(id, {
          history: { items: null, mode: 'none', noneReason: 'excluded', snapshot: null },
          pendingRequests: [],
          session: { ...baseSession(params.sessionId), status: 'idle' },
          viewCursor: 'v60',
        });
        return true;
      }
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-fresh'), viewCursor: nextCursor() });
        return true;
      }
      return false;
    },
  },
  approval: {
    requirement: 0,
    decided: false,
    onRequest(method, params, id) {
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-appr-1'), viewCursor: nextCursor() });
        return true;
      }
      if (method === 'turn/start') {
        const turnId = params.commandId;
        result(id, {
          commandId: params.commandId,
          disposition: 'started',
          startedNewTurn: true,
          status: 'accepted',
          turnId,
        });
        notify('turn/started', { commandId: params.commandId, sessionId: params.sessionId, turnId });
        notify('approval/requested', approvalRequest(params.sessionId, turnId, 'appr-1', this.requirement));
        return true;
      }
      if (method === 'approval/decide') {
        if (params.approvalId !== 'appr-1') {
          failure(id, -32050, 'approval not found', { kind: 'approvalNotFound' });
          return true;
        }
        const valid = ['allow-once', 'allow-session', 'deny'];
        if (!valid.includes(params.choiceId)) {
          failure(id, -32052, 'unknown choice', { kind: 'approvalChoiceInvalid' });
          return true;
        }
        if (!params.requirementId || params.requirementId.sourceIndex !== this.requirement) {
          failure(id, -32053, 'stale requirement', {
            kind: 'approvalRequirementStale',
            currentRequirementId: { approvalId: 'appr-1', sourceIndex: this.requirement },
          });
          return true;
        }
        if (this.decided) {
          failure(id, -32051, 'already resolved', { kind: 'approvalAlreadyResolved' });
          return true;
        }
        this.decided = true;
        const denied = params.choiceId === 'deny';
        result(id, {
          approvalId: 'appr-1',
          commandId: params.commandId,
          status: 'accepted',
          terminal: true,
        });
        notify('approval/resolved', {
          approvalId: 'appr-1',
          decidedByCommandId: params.commandId,
          decision: denied ? 'denied' : 'approved',
          itemId: 'item-tool-appr',
          policyResult: denied ? 'deny' : 'allow',
          resolvedBy: 'user',
          sessionId: params.sessionId,
          sourceRange: fakeRange(),
          stageEvidence: [],
          turnId: params.commandId,
        });
        notify('turn/completed', {
          sessionId: params.sessionId,
          terminal: 'completed',
          turnId: params.commandId,
        });
        return true;
      }
      if (method === 'approval/listPending') {
        result(id, {
          approvals: this.decided ? [] : [approvalRequest(params.sessionId, 't-live', 'appr-1', this.requirement)],
          userInputs: [],
        });
        return true;
      }
      return false;
    },
  },
  userinput: {
    settled: false,
    onRequest(method, params, id) {
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-ui-1'), viewCursor: nextCursor() });
        return true;
      }
      if (method === 'turn/start') {
        const turnId = params.commandId;
        result(id, {
          commandId: params.commandId,
          disposition: 'started',
          startedNewTurn: true,
          status: 'accepted',
          turnId,
        });
        notify('turn/started', { commandId: params.commandId, sessionId: params.sessionId, turnId });
        notify('userInput/requested', userInputRequest(params.sessionId, turnId, 'ui-1'));
        return true;
      }
      if (method === 'userInput/answer') {
        if (params.userInputId !== 'ui-1') {
          failure(id, -32055, 'prompt not found', { kind: 'userInputNotFound' });
          return true;
        }
        const ok = validateUserInputAnswer(params.answers);
        if (!ok) {
          failure(id, -32057, 'answer invalid', { kind: 'userInputAnswerInvalid' });
          return true;
        }
        if (this.settled) {
          failure(id, -32056, 'already settled', { kind: 'userInputAlreadySettled' });
          return true;
        }
        this.settled = true;
        result(id, { commandId: params.commandId, status: 'accepted', userInputId: 'ui-1' });
        notify('userInput/settled', {
          answers: params.answers,
          clarification: null,
          decidedByCommandId: params.commandId,
          outcome: 'answered',
          reason: null,
          sessionId: params.sessionId,
          sourceRange: fakeRange(),
          userInputId: 'ui-1',
        });
        notify('turn/completed', {
          sessionId: params.sessionId,
          terminal: 'completed',
          turnId: params.commandId,
        });
        return true;
      }
      if (method === 'userInput/cancel') {
        if (this.settled) {
          failure(id, -32056, 'already settled', { kind: 'userInputAlreadySettled' });
          return true;
        }
        this.settled = true;
        result(id, { commandId: params.commandId, status: 'accepted', userInputId: params.userInputId });
        notify('userInput/settled', {
          answers: [],
          clarification: null,
          decidedByCommandId: params.commandId,
          outcome: 'cancelled',
          reason: params.reason ?? null,
          sessionId: params.sessionId,
          sourceRange: fakeRange(),
          userInputId: params.userInputId,
        });
        return true;
      }
      return false;
    },
  },
  approvalresume: {
    onRequest(method, params, id) {
      if (method === 'session/list') {
        result(id, {
          nextCursor: null,
          sessions: [{ ...baseSession('sess-pending'), status: 'running', turnCount: 3 }],
        });
        return true;
      }
      if (method === 'session/resume') {
        result(id, {
          history: { items: null, mode: 'none', noneReason: 'excluded', snapshot: null },
          pendingRequests: [{ approvalId: 'appr-9', kind: 'approval', viewCursor: 'v3' }],
          session: { ...baseSession('sess-pending'), status: 'running', turnCount: 3 },
          viewCursor: 'v10',
        });
        // Late-joiner re-issue follows the resume response (tdd SS5.6).
        notify('approval/requested', approvalRequest(params.sessionId, 't-live', 'appr-9', 0));
        return true;
      }
      if (method === 'approval/listPending') {
        result(id, {
          approvals: [approvalRequest(params.sessionId, 't-live', 'appr-9', 0)],
          userInputs: [],
        });
        return true;
      }
      return false;
    },
  },
  inuse: {
    onRequest(method, params, id) {
      if (method === 'session/list') {
        result(id, {
          nextCursor: null,
          sessions: [
            { ...baseSession('sess-live'), status: 'running', turnCount: 5 },
            { ...baseSession('sess-old2'), turnCount: 1 },
          ],
        });
        return true;
      }
      if (method === 'session/resume') {
        if (params.sessionId === 'sess-live') {
          failure(id, -32021, `session ${params.sessionId} is already in use`, {
            kind: 'sessionInUse',
            retryable: false,
            sessionId: params.sessionId,
          });
          return true;
        }
        const turnId = 'old2-turn-1';
        result(id, {
          history: {
            items: [{ ...userItem(params.sessionId, turnId, 'old2 prompt'), revision: 2 }],
            mode: 'inline',
            snapshot: null,
          },
          pendingRequests: [],
          session: { ...baseSession(params.sessionId), status: 'idle', turnCount: 1 },
          viewCursor: 'v70',
        });
        return true;
      }
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-fresh-2'), viewCursor: nextCursor() });
        return true;
      }
      return false;
    },
  },
  image: {
    onRequest(method, params, id) {
      if (method === 'session/start') {
        result(id, { session: baseSession('sess-img-1'), viewCursor: nextCursor() });
        return true;
      }
      if (method === 'turn/start') {
        const parts = params.input || [];
        const images = parts.filter((p) => p.type === 'image');
        const texts = parts.filter((p) => p.type === 'text');
        const b64ok = (s) =>
          typeof s === 'string' && s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
        const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        const valid =
          parts.length > 0 &&
          images.length > 0 &&
          images.every((p) => b64ok(p.base64Data) && allowed.includes(p.mediaType)) &&
          texts.every((p) => typeof p.text === 'string');
        if (!valid) {
          failure(id, -32602, 'invalid image parts', { kind: 'invalidParams' });
          return true;
        }
        const turnId = params.commandId;
        result(id, {
          commandId: params.commandId,
          disposition: 'started',
          startedNewTurn: true,
          status: 'accepted',
          turnId,
        });
        const prompt = texts.map((p) => p.text).join('');
        const user = {
          ...userItem(params.sessionId, turnId, prompt),
          attachments: images.map((p) => ({ mediaType: p.mediaType, type: 'image' })),
          commandId: params.commandId,
        };
        notify('turn/started', { commandId: params.commandId, sessionId: params.sessionId, turnId });
        notify('item/started', { item: user, sessionId: params.sessionId });
        notify('item/completed', {
          item: { ...user, revision: 2 },
          sessionId: params.sessionId,
        });
        notify('item/started', {
          item: agentItem(params.sessionId, turnId, '', 'inProgress'),
          sessionId: params.sessionId,
        });
        notify('item/delta', {
          delta: 'nice shot',
          itemId: `item-agent-${turnId}`,
          sessionId: params.sessionId,
        });
        notify('item/completed', {
          item: agentItem(params.sessionId, turnId, 'nice shot'),
          sessionId: params.sessionId,
        });
        notify('turn/completed', {
          sessionId: params.sessionId,
          terminal: 'completed',
          turnId,
        });
        return true;
      }
      return false;
    },
  },
};

function fakeRange() {
  return { first: { index: 0 }, last: { index: 0 }, stream: { id: 'run-1', kind: 'run' } };
}

function approvalRequest(sessionId, turnId, approvalId, sourceIndex) {
  return {
    approvalId,
    availableChoices: [
      { choiceId: 'allow-once', decision: 'approved', label: 'Allow once', scope: 'once' },
      { choiceId: 'allow-session', decision: 'approvedForSession', label: 'Allow for session', scope: 'session' },
      { choiceId: 'deny', acceptsFeedback: true, decision: 'denied', label: 'Deny', scope: 'once' },
    ],
    currentRequirementId: { approvalId, sourceIndex },
    itemId: 'item-tool-appr',
    judgeEscalated: false,
    protectedWrite: false,
    rawArgs: 'rm -rf /tmp/x',
    sessionId,
    sourceRange: fakeRange(),
    subject: { command: 'rm -rf /tmp/x', kind: 'shell', workspaceRoot: '/tmp' },
    taskId: 'task-1',
    toolCallId: 'call-1',
    toolName: 'shell',
    turnId,
  };
}

function userInputRequest(sessionId, turnId, userInputId) {
  return {
    itemId: 'item-tool-ui',
    questions: [
      {
        header: 'Deploy',
        id: 'q1',
        options: [{ label: 'Yes' }, { description: 'skip it', label: 'No' }],
        question: 'Deploy now?',
        selection: { mode: 'single' },
      },
      {
        header: 'Note',
        id: 'q2',
        options: [],
        question: 'Anything to add?',
        selection: { mode: 'single' },
      },
    ],
    sessionId,
    toolCallId: 'call-2',
    toolName: 'ask',
    turnId,
    userInputId,
  };
}

function validateUserInputAnswer(answers) {
  if (!Array.isArray(answers) || answers.length !== 2) return false;
  const [a1, a2] = answers;
  if (a1.questionId !== 'q1' || !['Yes', 'No'].includes(a1.selectedLabel)) return false;
  if (a1.selectedLabels !== undefined || a1.freeText !== undefined) return false;
  if (a2.questionId !== 'q2' || typeof a2.freeText !== 'string' || a2.freeText.length > 500) return false;
  if (a2.selectedLabel !== undefined || a2.selectedLabels !== undefined) return false;
  return true;
}

const active = SCENARIOS[scenario];
if (!active) {
  process.stderr.write(`fake-serve: unknown scenario ${JSON.stringify(scenario)}\n`);
  process.exit(2);
}

let initialized = false;
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.method === 'initialized') return; // handshake notification, no reply
  if (typeof msg.id !== 'number') return;
  if (msg.method === 'initialize') {
    initialized = true;
    result(msg.id, {
      experimentalApi: false,
      grantedCapabilities: [],
      museHome: '/tmp/fake-muse-home',
      platformFamily: 'unix',
      platformOs: 'darwin',
      schema: { envelopeVersion: 1, fingerprint: FINGERPRINT },
      serverInfo: { name: 'muse-fake', version: '0.0.0-test' },
      userAgent: 'muse-fake/0.0.0-test',
    });
    return;
  }
  if (!initialized) {
    failure(msg.id, -32001, 'not initialized');
    return;
  }
  const handled = active.onRequest(msg.method, msg.params || {}, msg.id);
  if (!handled) failure(msg.id, -32601, `fake-serve[${scenario}]: no handler for ${msg.method}`);
});

rl.on('close', () => process.exit(0));
