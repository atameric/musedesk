// Canned MuseDeskBridge for README screenshots. Staged sample data only —
// nothing here touches a real CLI, real sessions, or real credentials.
'use strict';

const NOW = new Date().toISOString();
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

const AGENT_MD = [
  '### Three wins, biggest first',
  '',
  '1. **Shard across cores** — split the suite four ways and run the shards in parallel.',
  '2. **Skip the type check in watch mode** — run `tsc --noEmit` only in CI.',
  '3. **Cache workspace builds** between runs so unchanged packages are free.',
  '',
  '```bash',
  'npm test -- --shard=1/4',
  '```',
  '',
  'That usually takes a 6-minute suite down to about 90 seconds.',
].join('\n');

function baseSession(sessionId, overrides) {
  return {
    activeTurnId: null,
    createdAt: NOW,
    forkedFrom: null,
    modelId: 'demo-pro',
    path: `/tmp/fake-muse/${sessionId}/session.jsonl`,
    providerId: 'demo',
    sessionId,
    status: 'idle',
    turnCount: 0,
    updatedAt: NOW,
    workspaceRoot: '/tmp',
    approvalMode: { lastCommandId: null, mode: 'promptUnmatched', source: 'server' },
    ...overrides,
  };
}

function sessionA() {
  return baseSession('a1b2c3d4-0000-4000-8000-000000000001', {
    turnCount: 3,
    updatedAt: NOW,
    workspaceRoot: '/Users/demo/shop',
  });
}

function sessionB() {
  return baseSession('b2c3d4e5-0000-4000-8000-000000000002', {
    turnCount: 5,
    updatedAt: TWO_HOURS_AGO,
    workspaceRoot: '/Users/demo/api',
  });
}

function historyItems() {
  const turnId = 'turn-demo-1';
  return [
    {
      itemId: `item-user-${turnId}`,
      kind: 'userMessage',
      revision: 1,
      status: 'completed',
      text: 'How do I speed up this test suite? It takes 6 minutes on my laptop.',
      turnId,
    },
    {
      itemId: `item-agent-${turnId}`,
      kind: 'agentMessage',
      revision: 3,
      status: 'completed',
      text: AGENT_MD,
      turnId,
    },
  ];
}

function approvalRequest() {
  const approvalId = 'appr-demo-1';
  return {
    approvalId,
    availableChoices: [
      { choiceId: 'allow-once', decision: 'approved', label: 'Allow once', scope: 'once' },
      { choiceId: 'allow-session', decision: 'approvedForSession', label: 'Allow for session', scope: 'session' },
      { choiceId: 'deny', acceptsFeedback: true, decision: 'denied', label: 'Deny', scope: 'once' },
    ],
    currentRequirementId: { approvalId, sourceIndex: 0 },
    itemId: 'item-tool-demo',
    judgeEscalated: false,
    protectedWrite: false,
    rawArgs: 'npm run build',
    sessionId: sessionA().sessionId,
    sourceRange: { first: { index: 0 }, last: { index: 0 }, stream: { id: 'run-1', kind: 'run' } },
    subject: { command: 'npm run build', kind: 'shell', workspaceRoot: '/Users/demo/shop' },
    taskId: 'task-1',
    toolCallId: 'call-1',
    toolName: 'shell',
    turnId: 'turn-demo-2',
  };
}

function notImplemented(name) {
  return async () => {
    throw new Error(`mock bridge: ${name} is not implemented`);
  };
}

function buildMock({ pending }) {
  return {
    getStatus: async () => ({
      state: 'ready',
      cliVersion: 'Muse Code 1.1.1',
      serverVersion: 'msp/1.1.1',
      fingerprint: 'demo-fingerprint',
      fingerprintMatch: true,
      error: null,
      fullAccess: false,
      cliArch: 'arm64',
    }),
    defaultWorkspace: async () => '/Users/demo',
    listSessions: async () => ({ nextCursor: null, sessions: [sessionA(), sessionB()] }),
    resumeSession: async (sessionId) => ({
      history: { items: historyItems(), mode: 'inline', snapshot: null },
      pendingRequests: pending ? ['appr-demo-1'] : [],
      session: sessionId === sessionB().sessionId ? sessionB() : sessionA(),
      viewCursor: 'v1',
    }),
    listModels: async () => ({
      models: [
        {
          contextLimit: null,
          cost: null,
          description: null,
          displayLabel: 'Demo Pro',
          isActive: true,
          isDefault: true,
          modelId: 'demo-pro',
          outputLimit: null,
          profileId: null,
          providerId: 'demo',
        },
        {
          contextLimit: null,
          cost: null,
          description: null,
          displayLabel: 'Demo Lite',
          isActive: false,
          isDefault: false,
          modelId: 'demo-lite',
          outputLimit: null,
          profileId: null,
          providerId: 'demo',
        },
      ],
      profileId: null,
      providerId: 'demo',
      source: 'fakeCatalog',
    }),
    listPending: async () => (pending ? { approvals: [approvalRequest()], userInputs: [] } : { approvals: [], userInputs: [] }),
    onChatEvent: () => () => {},
    startSession: notImplemented('startSession'),
    sendTurn: notImplemented('sendTurn'),
    interruptTurn: notImplemented('interruptTurn'),
    pageView: notImplemented('pageView'),
    readSession: notImplemented('readSession'),
    setModel: notImplemented('setModel'),
    setApprovalMode: notImplemented('setApprovalMode'),
    decideApproval: notImplemented('decideApproval'),
    answerUserInput: notImplemented('answerUserInput'),
    cancelUserInput: notImplemented('cancelUserInput'),
    pickImages: notImplemented('pickImages'),
    setFullAccess: notImplemented('setFullAccess'),
    restartHost: notImplemented('restartHost'),
    gitStatus: notImplemented('gitStatus'),
    gitDiff: notImplemented('gitDiff'),
    pickWorkspace: notImplemented('pickWorkspace'),
  };
}

module.exports = { buildMock };
