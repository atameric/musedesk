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
    workspaceRoot: '/Users/demo/sample-store',
  });
}

function sessionB() {
  return baseSession('b2c3d4e5-0000-4000-8000-000000000002', {
    turnCount: 5,
    updatedAt: TWO_HOURS_AGO,
    workspaceRoot: '/Users/demo/weather-lab',
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
    subject: { command: 'npm run build', kind: 'shell', workspaceRoot: '/Users/demo/sample-store' },
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

const SAMPLE_DIFFS = {
  'src/msp/host.ts': [
    'diff --git a/src/msp/host.ts b/src/msp/host.ts',
    '--- a/src/msp/host.ts',
    '+++ b/src/msp/host.ts',
    '@@ -40,6 +40,9 @@',
    '   if (!connected) {',
    '+    markOffline();',
    '     throw lastError();',
    '   }',
    '-  return request(id);',
    '+  const res = await request(id);',
    '+  noteHealth();',
    '+  return res;',
  ].join('\n'),
  'src/ui/App.tsx': [
    'diff --git a/src/ui/App.tsx b/src/ui/App.tsx',
    '--- a/src/ui/App.tsx',
    '+++ b/src/ui/App.tsx',
    '@@ -12,4 +12,6 @@',
    ' import { Sidebar } from "./Sidebar";',
    '+import { FileList } from "./FileChanges";',
    ' ',
    ' export function App() {',
    '+  // staged sample diff for screenshots',
  ].join('\n'),
};

function buildMock({ pending, polished = false }) {
  const listeners = new Set();
  let cursor = 1, fullAccess = polished, mode = polished ? 'allowAll' : 'promptUnmatched', modelId = polished ? 'muse-spark-1.3' : 'demo-pro';
  const pool = [sessionA(), sessionB()];
  if (polished) {
    pool[0] = { ...pool[0], workspaceRoot: '/Users/demo/sample-store', name: 'Improve product search', firstUserPrompt: 'How can we make product search easier to use?' };
    pool[1] = { ...pool[1], workspaceRoot: '/Users/demo/sample-store', name: 'Add a shopping cart' };
    pool.push(baseSession('c-demo', { workspaceRoot: '/Users/demo/weather-lab', name: 'Forecast cards' }), baseSession('d-demo', { workspaceRoot: '/Users/demo/docs-site', name: 'Getting started guide' }));
  }
  const getSession = id => ({ ...(pool.find(s => s.sessionId === id) || pool[0]), modelId, approvalMode: { mode, source: 'user', lastCommandId: null } });
  const emit = (sessionId, method, params) => { for (const fn of listeners) fn({ sessionId, method, params: { sessionId, viewCursor: 'v' + (++cursor), ...params } }); };
  const items = () => {
    if (!polished) return historyItems();
    const time = new Date(Date.now() - 300000).toISOString();
    return [
      { ...historyItems()[0], text: 'How can we make product search easier to use?', recordedAt: time },
      { itemId: 'reasoning-demo', turnId: 'turn-demo-1', kind: 'reasoning', status: 'completed', revision: 1, summary: ['Reviewing the search flow, filters, and empty states.'], recordedAt: time },
      ...Array.from({ length: 5 }, (_, i) => ({ itemId: 'tool-demo-' + i, turnId: 'turn-demo-1', kind: 'toolCall', status: 'completed', revision: 1, tool: 'read_file', args: 'src/ui/' + ['App.tsx', 'Sidebar.tsx', 'ChatView.tsx', 'Composer.tsx', 'MessageItem.tsx'][i], visibleOutput: 'File inspected.', recordedAt: time })),
      { ...historyItems()[1], text: 'Here are three improvements for the sample storefront.\n\n- **Clear filters** — keep category and price controls beside the results.\n- **Helpful empty states** — suggest related products when a search has no matches.\n- **Quick navigation** — let shoppers open results with the keyboard.\n\nThe search field stays visible while browsing, and active filters are easy to reset.', recordedAt: time },
      { ...historyItems()[0], itemId: 'second-user', turnId: 'turn-demo-2', text: 'Great. Include keyboard navigation too.', recordedAt: NOW },
      { ...historyItems()[1], itemId: 'second-agent', turnId: 'turn-demo-2', text: 'The checklist includes focus indicators and keyboard navigation.', recordedAt: NOW },
    ];
  };
  return {
    getStatus: async () => ({
      state: 'ready',
      cliVersion: 'Muse Code 1.4.1',
      serverVersion: 'msp/1.4.1',
      fingerprint: 'demo-fingerprint',
      fingerprintMatch: true,
      error: null,
      fullAccess,
      cliArch: 'arm64',
    }),
    defaultWorkspace: async () => '/Users/demo',
    listSessions: async () => ({ nextCursor: null, sessions: pool.map(s => getSession(s.sessionId)) }),
    resumeSession: async (sessionId) => {
      if (polished) setTimeout(() => {
        emit(sessionId, 'session/contextUsage', { usedTokens: 52000, windowTokens: 200000, pressure: 'normal' });
        emit(sessionId, 'session/todoListChanged', { items: [{ text: 'Review the sample search flow', status: 'completed' }, { text: 'Design filters and empty states', status: 'completed' }, { text: 'Check focus and keyboard navigation', status: 'inProgress', activeForm: 'Checking keyboard navigation' }] });
        emit(sessionId, 'turn/completed', { turnId: 'turn-demo-1', terminal: 'completed', durationMs: 12000 });
      }, 100);
      return ({
      history: { items: sessionId.startsWith('new-') ? [] : items(), mode: 'inline', snapshot: null },
      pendingRequests: pending ? ['appr-demo-1'] : [],
      session: getSession(sessionId),
      viewCursor: 'v1',
    }); },
    listModels: async () => ({
      models: [
        {
          contextLimit: null,
          cost: null,
          description: null,
          displayLabel: polished ? 'Muse Spark' : 'Demo Pro',
          isActive: modelId !== 'demo-lite',
          isDefault: true,
          modelId: polished ? 'muse-spark-1.3' : 'demo-pro',
          variants: ['low', 'medium', 'high', 'max'],
          outputLimit: null,
          profileId: null,
          providerId: 'demo',
        },
        {
          contextLimit: null,
          cost: null,
          description: null,
          displayLabel: 'Demo Lite',
          isActive: modelId === 'demo-lite',
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
    onChatEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    startSession: async (config) => { const s = baseSession('new-' + Date.now(), { workspaceRoot: config?.workspaceRoot ?? '/Users/demo/sample-store' }); pool.unshift(s); return { session: s, viewCursor: 'v1' }; },
    sendTurn: notImplemented('sendTurn'),
    interruptTurn: notImplemented('interruptTurn'),
    pageView: notImplemented('pageView'),
    subscribeView: async () => ({ viewCursor: 'v1' }),
    readSession: notImplemented('readSession'),
    setModel: async (id, model) => { modelId = model.modelId; emit(id, 'session/modelChanged', model); return { commandId: 'model-command', disposition: 'applied' }; },
    setApprovalMode: async (id, next) => { mode = next; return { effectiveMode: { mode, source: 'user', lastCommandId: null } }; },
    decideApproval: notImplemented('decideApproval'),
    answerUserInput: notImplemented('answerUserInput'),
    cancelUserInput: notImplemented('cancelUserInput'),
    pickImages: async () => [],
    setFullAccess: async (next) => { fullAccess = next; },
    restartHost: notImplemented('restartHost'),
    gitStatus: async () => ({
      isRepo: true,
      branch: 'main',
      files: [
        { path: 'src/msp/host.ts', staged: 'M', unstaged: 'M' },
        { path: 'src/ui/App.tsx', staged: ' ', unstaged: 'M' },
      ],
    }),
    gitDiff: async (_root, filePath) => SAMPLE_DIFFS[filePath] ?? '',
    pickWorkspace: async () => '/Users/demo/sample-store',
  };
}

module.exports = { buildMock };
