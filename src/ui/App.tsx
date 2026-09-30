import React from 'react';
import type { AttachmentDraft, HostStatus } from '../shared/bridge';
import { MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from '../shared/limits';
import type {
  ApprovalMode,
  ApprovalRequestParams,
  ModelListResult,
  ModelSelection,
  ReasoningEffort,
  Session,
  UserInputAnswer,
  UserInputRequestParams,
} from '../msp/msp';
import type { TranscriptSnapshot } from '../msp/transcript';
import { SessionRecovery } from '../msp/recovery';
import { assertHostRestartable } from '../shared/hostRecovery';
import {
  contextPct,
  parseContextTriple,
  snapshotContextUsage,
  type SessionContextUsage,
} from '../shared/contextUsage';
import {
  formatTokens,
  parseTokenUsage,
  parseTodoList,
  snapshotTokenUsage,
  snapshotTodoList,
  type SessionTokenTotals,
  type TodoView,
} from '../shared/sessionStats';
import {
  groupSessions,
  loadProjects,
  projectName,
  saveProjects,
  type ProjectStore,
} from '../shared/projects';
import { humanizeError } from '../shared/errors';
import {
  addQueuedTurn,
  classifySendOutcome,
  takeQueuedTurn,
  type QueuedTurn,
} from '../shared/outbox';
import { ChatView } from './ChatView';
import { Composer, type PastedImage } from './Composer';
import { Sidebar, sessionTitle } from './Sidebar';
import { SidePanel, type PanelTab } from './SidePanel';
import { CommandPalette } from './CommandPalette';
import { Overview } from './Overview';
import type { PaletteCommand } from '../shared/palette';
import { Suggestions } from './Suggestions';
import { ControlsBar } from './ControlsBar';
import { ApprovalDialog } from './ApprovalDialog';
import { UserInputDialog } from './UserInputDialog';

function StatusScreen({ status, busy, onRestart }: {
  status: HostStatus | null;
  busy: boolean;
  onRestart: () => void;
}) {
  if (!status || status.state === 'starting') {
    return (
      <main className="screen">
        <h1>MuseDesk</h1>
        <p>Starting MSP host…</p>
      </main>
    );
  }
  return (
    <main className="screen">
      <h1>MuseDesk</h1>
      <p>Host error:</p>
      <pre className="error">{status.error ?? 'unknown error'}</pre>
      <button className="btn" disabled={busy} onClick={onRestart}>Restart host</button>
      {!window.musedesk && <p>Waiting for preload bridge…</p>}
    </main>
  );
}

// An active turn quieter than this on the live stream is re-read from the
// server (see the stuck-turn watchdog below).
const STUCK_SILENCE_MS = 60000;

function newDraftId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `shot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function baseName(p: string | null | undefined): string | null {
  if (!p) return null;
  const parts = p.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + 30000;
  for (;;) {
    const s = await window.musedesk.getStatus();
    if (s.state === 'ready') return;
    if (s.state === 'error') throw new Error(s.error ?? 'host failed to start');
    if (Date.now() > deadline) throw new Error('host restart timed out');
    await new Promise((r) => setTimeout(r, 300));
  }
}

interface PanelState {
  open: boolean;
  tab: PanelTab;
}

// Closed effort vocabulary (mirrors ReasoningEffort) for palette commands.
const EFFORTS: ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
];

function loadPanel(): PanelState {
  try {
    const raw = localStorage.getItem('musedesk.panel');
    if (raw) {
      const o = JSON.parse(raw) as Partial<PanelState>;
      return { open: o.open === true, tab: o.tab === 'changes' ? 'changes' : 'tasks' };
    }
  } catch {
    /* storage unavailable */
  }
  return { open: false, tab: 'tasks' };
}

function loadEffort(): ReasoningEffort {
  try {
    const v = localStorage.getItem('musedesk.effort');
    if (v === 'none' || v === 'minimal' || v === 'low' || v === 'medium' || v === 'high' || v === 'xhigh' || v === 'max' || v === 'ultra') {
      return v;
    }
  } catch {
    /* storage unavailable */
  }
  return 'high';
}

function upsertById<T extends { [k in K]: string }, K extends string>(
  list: T[],
  item: T,
  key: K,
): T[] {
  const i = list.findIndex((e) => e[key] === item[key]);
  if (i < 0) return [...list, item];
  return list.map((e, j) => (j === i ? item : e));
}

export function App() {
  const [status, setStatus] = React.useState<HostStatus | null>(null);
  const [everReady, setEverReady] = React.useState(false);
  const [sessions, setSessions] = React.useState<Session[] | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [snap, setSnap] = React.useState<TranscriptSnapshot | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [recoveryWarnings, setRecoveryWarnings] = React.useState<Record<string, string>>({});
  const [approvals, setApprovals] = React.useState<ApprovalRequestParams[]>([]);
  const [prompts, setPrompts] = React.useState<UserInputRequestParams[]>([]);
  const [pendingCounts, setPendingCounts] = React.useState<Record<string, number>>({});
  const [ctxUsage, setCtxUsage] = React.useState<Record<string, SessionContextUsage>>({});
  const [tokTotals, setTokTotals] = React.useState<Record<string, SessionTokenTotals>>({});
  const [todos, setTodos] = React.useState<Record<string, TodoView[]>>({});
  const [panel, setPanel] = React.useState<PanelState>(loadPanel);
  const [gitNonce, setGitNonce] = React.useState(0);
  const [view, setView] = React.useState<'chat' | 'overview'>('chat');
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [models, setModels] = React.useState<ModelListResult | null>(null);
  const [effort, setEffortState] = React.useState<ReasoningEffort>(loadEffort);
  const [draft, setDraft] = React.useState('');
  const [lastFolder, setLastFolder] = React.useState<string | null>(null);
  const [projectStore, setProjectStore] = React.useState<ProjectStore>(loadProjects);
  const [shots, setShots] = React.useState<AttachmentDraft[]>([]);
  // In-flight sendTurn count per session (ack not yet seen) + server-queued
  // submits (acked, waiting for their launch boundary).
  const [sending, setSending] = React.useState<Record<string, number>>({});
  const [queued, setQueued] = React.useState<Record<string, QueuedTurn[]>>({});
  const shotsRef = React.useRef<AttachmentDraft[]>([]);
  const shotsMapRef = React.useRef(new Map<string, string[]>());
  const queuedRef = React.useRef<Record<string, QueuedTurn[]>>({});
  const draftRef = React.useRef('');
  const recoveryRef = React.useRef<SessionRecovery | null>(null);
  if (!recoveryRef.current) recoveryRef.current = new SessionRecovery(window.musedesk);
  const storesRef = React.useRef(recoveryRef.current.stores);
  const activeRef = React.useRef<string | null>(null);
  const bootedRef = React.useRef(false);
  const restartingRef = React.useRef(false);
  const lastEventRef = React.useRef(new Map<string, number>());
  const resyncAtRef = React.useRef(new Map<string, number>());
  const seenUiCursorsRef = React.useRef(new Map<string, Set<string>>());

  React.useEffect(() => {
    let live = true;
    const poll = () => {
      window.musedesk
        .getStatus()
        .then((s) => {
          if (!live) return;
          setStatus(s);
          if (s.state === 'ready') setEverReady(true);
        })
        .catch(() => {
          if (live) setStatus(null);
        });
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const bumpPending = React.useCallback((sessionId: string, delta: number) => {
    setPendingCounts((prev) => {
      const next = Math.max(0, (prev[sessionId] ?? 0) + delta);
      if (next === 0) {
        if (!(sessionId in prev)) return prev;
        const rest = { ...prev };
        delete rest[sessionId];
        return rest;
      }
      return { ...prev, [sessionId]: next };
    });
  }, []);

  const bumpSending = React.useCallback((sessionId: string, delta: number) => {
    setSending((prev) => {
      const next = Math.max(0, (prev[sessionId] ?? 0) + delta);
      if (next === 0) {
        if (!(sessionId in prev)) return prev;
        const rest = { ...prev };
        delete rest[sessionId];
        return rest;
      }
      return { ...prev, [sessionId]: next };
    });
  }, []);

  // Cmd/Ctrl+K toggles the command palette from anywhere.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Route every live event: transcript stores always, dialogs when active,
  // badges + session fields otherwise.
  React.useEffect(
    () =>
      window.musedesk.onChatEvent((frame) => {
        if (!frame.sessionId) return;
        const p = (frame.params ?? {}) as Record<string, unknown>;
        const store = recoveryRef.current!.apply(frame.sessionId, frame.method, frame.params);
        if (typeof p.viewCursor === 'string') lastEventRef.current.set(frame.sessionId, Date.now());
        const isActive = frame.sessionId === activeRef.current;
        if (typeof p.viewCursor === 'string') {
          let seen = seenUiCursorsRef.current.get(frame.sessionId);
          if (!seen) {
            seen = new Set<string>();
            seenUiCursorsRef.current.set(frame.sessionId, seen);
          }
          const key = `${frame.method}|${p.viewCursor}`;
          if (seen.has(key)) {
            if (isActive) setSnap(store.snapshot());
            return;
          }
          seen.add(key);
        }
        switch (frame.method) {
          case 'session/viewHealthChanged':
            if (p.health === 'unavailable') {
              setRecoveryWarnings((prev) => ({
                ...prev,
                [frame.sessionId]: 'Live updates interrupted. Re-sync this session to recover its history and reconnect.',
              }));
              lastEventRef.current.set(frame.sessionId, 0);
            }
            break;
          case 'session/statusChanged':
            if (typeof p.status === 'string') {
              const nextStatus = p.status;
              setSessions((prev) => prev?.map((s) => s.sessionId === frame.sessionId
                ? { ...s, status: nextStatus } : s) ?? prev);
            }
            break;
          case 'turn/started':
            if (typeof p.turnId === 'string') {
              const turnId = p.turnId;
              setSessions((prev) => prev?.map((s) => s.sessionId === frame.sessionId
                ? { ...s, status: 'running', activeTurnId: turnId } : s) ?? prev);
            }
            break;
          case 'approval/requested':
            if (isActive) {
              setApprovals((prev) => upsertById(prev, p as unknown as ApprovalRequestParams, 'approvalId'));
            } else {
              bumpPending(frame.sessionId, 1);
            }
            break;
          case 'approval/updated':
            if (isActive) {
              setApprovals((prev) => upsertById(prev, p as unknown as ApprovalRequestParams, 'approvalId'));
            }
            break;
          case 'approval/resolved': {
            const id = p.approvalId;
            if (isActive && typeof id === 'string') {
              setApprovals((prev) => prev.filter((a) => a.approvalId !== id));
            } else {
              bumpPending(frame.sessionId, -1);
            }
            break;
          }
          case 'userInput/requested':
            if (isActive) {
              setPrompts((prev) => upsertById(prev, p as unknown as UserInputRequestParams, 'userInputId'));
            } else {
              bumpPending(frame.sessionId, 1);
            }
            break;
          case 'userInput/settled': {
            const id = p.userInputId;
            if (isActive && typeof id === 'string') {
              setPrompts((prev) => prev.filter((u) => u.userInputId !== id));
            } else {
              bumpPending(frame.sessionId, -1);
            }
            break;
          }
          case 'session/modelChanged':
            if (typeof p.modelId === 'string') {
              const modelId = p.modelId;
              setSessions((prev) =>
                prev ? prev.map((s) => (s.sessionId === frame.sessionId ? { ...s, modelId } : s)) : prev,
              );
            }
            break;
          case 'session/contextUsage': {
            const u = parseContextTriple(p);
            if (u) {
              const usage = u;
              setCtxUsage((prev) => ({ ...prev, [frame.sessionId]: usage }));
            }
            break;
          }
          case 'session/tokenUsage': {
            const t = parseTokenUsage(p);
            if (t) {
              const totals = t;
              setTokTotals((prev) => ({ ...prev, [frame.sessionId]: totals }));
            }
            break;
          }
          case 'session/todoListChanged': {
            const list = parseTodoList(p);
            if (list) {
              const items = list;
              setTodos((prev) => ({ ...prev, [frame.sessionId]: items }));
            }
            break;
          }
          case 'turn/completed':
            setSessions((prev) => prev?.map((s) => s.sessionId === frame.sessionId && s.activeTurnId === p.turnId
              ? { ...s, status: 'idle', activeTurnId: null } : s) ?? prev);
            // Files may have changed — refresh the Changes tab when it is live.
            if (frame.sessionId === activeRef.current) setGitNonce((n) => n + 1);
            break;
          case 'session/approvalModeChanged':
            if (typeof p.mode === 'string' && typeof p.source === 'string') {
              const mode = p.mode;
              const source = p.source;
              const commandId = typeof p.commandId === 'string' ? p.commandId : null;
              setSessions((prev) =>
                prev
                  ? prev.map((s) =>
                      s.sessionId === frame.sessionId
                        ? { ...s, approvalMode: { lastCommandId: commandId, mode: mode as ApprovalMode, source } }
                        : s,
                    )
                  : prev,
              );
            }
            break;
          default:
            break;
        }
        // A queued submit leaves the outbox when its turn launches (the
        // server echo takes over) or is reclaimed (restore the draft: the
        // input never ran).
        if (
          (frame.method === 'turn/started' || frame.method === 'turn/unqueued') &&
          typeof p.turnId === 'string'
        ) {
          const turnId = p.turnId;
          const { list, removed } = takeQueuedTurn(queuedRef.current[frame.sessionId] ?? [], turnId);
          if (removed) {
            setQueued((prev) => {
              const next = { ...prev };
              if (list.length === 0) delete next[frame.sessionId];
              else next[frame.sessionId] = list;
              return next;
            });
            if (frame.method === 'turn/unqueued' && isActive) {
              const composerEmpty = draftRef.current === '';
              if (composerEmpty) setDraft(removed.text);
              const urls = shotsMapRef.current.get(removed.commandId) ?? [];
              if (urls.length > 0 && shotsRef.current.length === 0) {
                setShots(
                  urls.map((dataUrl, i) => ({
                    id: newDraftId(),
                    name: `restored-${i + 1}.png`,
                    sizeBytes: Math.floor((dataUrl.length * 3) / 4),
                    mediaType: /data:([^;]+);/.exec(dataUrl)?.[1] ?? 'image/png',
                    dataUrl,
                  })),
                );
              }
              setNotice(
                composerEmpty
                  ? 'Queued turn was withdrawn before it started — draft restored.'
                  : 'Queued turn was withdrawn before it started.',
              );
            }
          }
        }
        if (isActive) setSnap(store.snapshot());
      }),
    [bumpPending],
  );

  React.useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  React.useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  React.useEffect(() => {
    queuedRef.current = queued;
  }, [queued]);

  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const fail = (e: unknown) => setSendError(humanizeError(e));

  // NOTE: every hook must run on every render — keep all React.use* calls
  // above the `!everReady` early return or React unmounts the whole tree.
  const shotsFor = React.useCallback(
    (commandId?: string): string[] => (commandId ? (shotsMapRef.current.get(commandId) ?? []) : []),
    [],
  );

  const refresh = React.useCallback(async () => {
    const found: Session[] = [];
    let cursor: string | undefined;
    const visited = new Set<string>();
    for (;;) {
      const list = await window.musedesk.listSessions({ limit: 200, cursor });
      found.push(...list.sessions);
      if (!list.nextCursor) break;
      if (visited.has(list.nextCursor)) throw new Error('Session list paging stopped advancing');
      visited.add(list.nextCursor);
      cursor = list.nextCursor;
    }
    setSessions(found);
    return found;
  }, []);

  const reconcilePending = React.useCallback(async (sessionId: string) => {
    try {
      const pulled = await window.musedesk.listPending(sessionId);
      setApprovals(pulled.approvals);
      setPrompts(pulled.userInputs);
    } catch (e) {
      setNotice(e instanceof Error ? `Pending requests unavailable: ${e.message}` : String(e));
    }
  }, []);

  // Read a baseline, recover unavailable history through pages, and replay
  // the live suffix. This changes no server-side turn or lease state.
  const resyncSession = React.useCallback(async (sessionId: string, auto: boolean) => {
    const previous = storesRef.current.get(sessionId);
    if (!previous) return;
    if (!auto) setBusy(true);
    try {
      const hadActive = previous.snapshot().activeTurnId;
      const { result: read, warning } = await recoveryRef.current!.resync(sessionId);
      const store = storesRef.current.get(sessionId)!;
      setRecoveryWarnings((prev) => {
        const next = { ...prev };
        if (warning) next[sessionId] = warning;
        else delete next[sessionId];
        return next;
      });
      const readUsage = snapshotContextUsage(read.history);
      if (readUsage) setCtxUsage((prev) => ({ ...prev, [sessionId]: readUsage }));
      const readTokens = snapshotTokenUsage(read.history);
      if (readTokens) setTokTotals((prev) => ({ ...prev, [sessionId]: readTokens }));
      const readTodos = snapshotTodoList(read.history);
      if (readTodos) setTodos((prev) => ({ ...prev, [sessionId]: readTodos }));
      setSessions((prev) =>
        prev ? prev.map((s) => (s.sessionId === sessionId ? read.session : s)) : prev,
      );
      if (activeRef.current === sessionId) setSnap(store.snapshot());
      const stillActive = store.snapshot().activeTurnId;
      if (activeRef.current === sessionId) await reconcilePending(sessionId);
      if (hadActive && hadActive !== stillActive) {
        setNotice(
          auto
            ? 'Re-synced with the server — the turn had already ended.'
            : 'Session re-synced with the server.',
        );
      } else if (!auto) {
        setNotice('Session re-synced with the server.');
      }
    } catch (e) {
      setRecoveryWarnings((prev) => ({ ...prev, [sessionId]: `Re-sync failed: ${humanizeError(e)}` }));
    } finally {
      if (!auto) setBusy(false);
    }
  }, [reconcilePending]);

  // Throws on failure (caller decides: surface or fall through to the next).
  const tryOpenSession = React.useCallback(
    async (sessionId: string, known?: Session[]) => {
      if (!recoveryRef.current!.isHydrated(sessionId)) {
        const { result: resumed, warning } = await recoveryRef.current!.open(sessionId);
        setRecoveryWarnings((prev) => {
          const next = { ...prev };
          if (warning) next[sessionId] = warning;
          else delete next[sessionId];
          return next;
        });
        const snapUsage = snapshotContextUsage(resumed.history);
        if (snapUsage) setCtxUsage((prev) => ({ ...prev, [sessionId]: snapUsage }));
        const snapTokens = snapshotTokenUsage(resumed.history);
        if (snapTokens) setTokTotals((prev) => ({ ...prev, [sessionId]: snapTokens }));
        const snapTodos = snapshotTodoList(resumed.history);
        if (snapTodos) setTodos((prev) => ({ ...prev, [sessionId]: snapTodos }));
        setSessions((prev) =>
          prev ? prev.map((s) => (s.sessionId === sessionId ? resumed.session : s)) : (known ?? null),
        );
      }
      await reconcilePending(sessionId);
      activeRef.current = sessionId;
      setActiveId(sessionId);
      setSnap(recoveryRef.current!.storeFor(sessionId).snapshot());
    },
    [reconcilePending],
  );

  const openSession = React.useCallback(
    async (sessionId: string, known?: Session[]) => {
      setBusy(true);
      setNotice(null);
      setSendError(null);
      setApprovals([]);
      setPrompts([]);
      setPendingCounts((prev) => {
        if (!(sessionId in prev)) return prev;
        const rest = { ...prev };
        delete rest[sessionId];
        return rest;
      });
      try {
        await tryOpenSession(sessionId, known);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [tryOpenSession],
  );

  // Expand-on-select (one shot): opening a session reveals its project, but
  // the user stays free to collapse it afterwards. Stable identity so boot
  // can depend on it without refiring.
  const expandFolder = React.useCallback((folder: string | null) => {
    setProjectStore((prev) => {
      const norm = folder ? folder.replace(/\/+$/, '') : '';
      if (!prev.collapsed[norm]) return prev;
      const collapsed = { ...prev.collapsed };
      delete collapsed[norm];
      const next = { ...prev, collapsed };
      saveProjects(next);
      return next;
    });
  }, []);

  // Boot: open the newest resumable session (skipping ones held by other
  // windows), or start fresh when none opens.
  React.useEffect(() => {
    if (status?.state !== 'ready' || bootedRef.current || restartingRef.current) return;
    bootedRef.current = true;
    (async () => {
      setBusy(true);
      setNotice(null);
      setSendError(null);
      try {
        let folder: string | null = null;
        try {
          folder = localStorage.getItem('musedesk.workspace');
        } catch {
          folder = null;
        }
        if (!folder) {
          try {
            folder = await window.musedesk.defaultWorkspace();
          } catch {
            folder = null;
          }
        }
        if (folder) setLastFolder(folder);
        const found = await refresh();
        let opened = false;
        for (const s of found.slice(0, 5)) {
          try {
            await tryOpenSession(s.sessionId, found);
            expandFolder(s.workspaceRoot ?? null);
            opened = true;
            break;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (!/sessionInUse|already in use|sessionNotFound|session .*not found/i.test(message)) throw e;
          }
        }
        if (!opened) {
          const started = await window.musedesk.startSession(folder ? { workspaceRoot: folder } : {});
          setSessions((prev) => (prev ? [started.session, ...prev] : [started.session]));
          recoveryRef.current!.markStarted(started.session.sessionId);
          activeRef.current = started.session.sessionId;
          setActiveId(started.session.sessionId);
          setSnap(storesRef.current.get(started.session.sessionId)!.snapshot());
          expandFolder(folder);
        }
      } catch (e) {
        bootedRef.current = false;
        fail(e);
      } finally {
        setBusy(false);
      }
    })();
  }, [status, refresh, tryOpenSession, expandFolder]);

  const groups = React.useMemo(() => {
    if (!sessions) return null;
    const hidden = new Set(projectStore.hidden);
    return groupSessions(sessions, projectStore.folders).filter((g) => !hidden.has(g.id));
  }, [sessions, projectStore.folders, projectStore.hidden]);

  // Models follow the active session.
  React.useEffect(() => {
    if (!activeId) {
      setModels(null);
      return;
    }
    let live = true;
    window.musedesk
      .listModels(activeId)
      .then((m) => {
        if (live) setModels(m);
      })
      .catch(() => {
        if (live) setModels(null);
      });
    return () => {
      live = false;
    };
  }, [activeId]);

  // Reconcile all silent running sessions, including background chats.
  React.useEffect(() => {
    if (status?.state !== 'ready' || busy) return undefined;
    const t = setInterval(() => {
      const now = Date.now();
      for (const [id, store] of storesRef.current) {
        if (!store.snapshot().activeTurnId) continue;
        if (now - (lastEventRef.current.get(id) ?? 0) < STUCK_SILENCE_MS) continue;
        if (now - (resyncAtRef.current.get(id) ?? 0) < STUCK_SILENCE_MS) continue;
        resyncAtRef.current.set(id, now);
        void resyncSession(id, true);
      }
    }, 10000);
    return () => clearInterval(t);
  }, [status?.state, busy, resyncSession]);

  const active = sessions?.find((s) => s.sessionId === activeId) ?? null;
  const activeCtx = activeId ? (ctxUsage[activeId] ?? null) : null;
  const activeCtxPct = activeCtx ? contextPct(activeCtx) : null;
  const activeTok = activeId ? (tokTotals[activeId] ?? null) : null;
  const activeTodos = activeId ? (todos[activeId] ?? []) : [];

  const restartHost = async () => {
    if (busy) return;
    restartingRef.current = true;
    setBusy(true);
    setSendError(null);
    try {
      const runningIds = (sessions ?? []).filter((s) => s.status === 'running').map((s) => s.sessionId);
      for (const [id, store] of storesRef.current) {
        if (store.snapshot().activeTurnId) runningIds.push(id);
      }
      await assertHostRestartable(window.musedesk, runningIds);
      const nextStatus = await window.musedesk.restartHost();
      setStatus(nextStatus);
      await waitForReady();
      recoveryRef.current!.clear();
      setSnap((previous) => previous ? { ...previous, activeTurnId: null } : null);
      setApprovals([]);
      setPrompts([]);
      setPendingCounts({});
      setRecoveryWarnings({});
      setQueued({});
      queuedRef.current = {};
      lastEventRef.current.clear();
      resyncAtRef.current.clear();
      seenUiCursorsRef.current.clear();
      const found = await refresh();
      const id = activeRef.current;
      if (id) await tryOpenSession(id, found);
      else bootedRef.current = false;
      setNotice('Host restarted. Check the last message before sending again.');
    } catch (e) {
      fail(e);
    } finally {
      restartingRef.current = false;
      setBusy(false);
    }
  };

  const toggleFullAccess = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setSendError(null);
    try {
      const runningIds = (sessions ?? []).filter((s) => s.status === 'running').map((s) => s.sessionId);
      for (const [id, store] of storesRef.current) {
        if (store.snapshot().activeTurnId) runningIds.push(id);
      }
      await assertHostRestartable(window.musedesk, runningIds);
      const s = await window.musedesk.setFullAccess(next);
      setStatus(s);
      if (s.fullAccess !== next) return; // confirm dismissed — nothing changed
      await waitForReady();
      await refresh();
      recoveryRef.current!.clear();
      setRecoveryWarnings({});
      seenUiCursorsRef.current.clear();
      lastEventRef.current.clear();
      resyncAtRef.current.clear();
      setSnap(null);
      setApprovals([]);
      setPrompts([]);
      setPendingCounts({});
      const id = activeRef.current;
      if (id) await selectSession(id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const newChatIn = async (folder: string | null) => {
    setBusy(true);
    setNotice(null);
    setSendError(null);
    setApprovals([]);
    setPrompts([]);
    try {
      const started = await window.musedesk.startSession(folder ? { workspaceRoot: folder } : {});
      setSessions((prev) => (prev ? [started.session, ...prev] : [started.session]));
      recoveryRef.current!.markStarted(started.session.sessionId);
      activeRef.current = started.session.sessionId;
      setActiveId(started.session.sessionId);
      setSnap(storesRef.current.get(started.session.sessionId)!.snapshot());
      expandFolder(folder);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const toggleProject = (id: string) => {
    const collapsed = { ...projectStore.collapsed };
    if (collapsed[id]) delete collapsed[id];
    else collapsed[id] = true;
    const next = { ...projectStore, collapsed };
    setProjectStore(next);
    saveProjects(next);
  };

  const selectSession = (id: string) => {
    const s = sessions?.find((x) => x.sessionId === id);
    if (s) expandFolder(s.workspaceRoot ?? null);
    setView('chat');
    return openSession(id);
  };

  // Sidebar-only: the folder's sessions are untouched and come back with
  // their chats when the folder is added again via + New Project.
  const hideProject = (folder: string | null, name: string) => {
    const norm = folder ? folder.replace(/\/+$/, '') : '';
    if (projectStore.hidden.includes(norm)) return;
    const next = { ...projectStore, hidden: [...projectStore.hidden, norm] };
    setProjectStore(next);
    saveProjects(next);
    setNotice(`"${name}" hidden from the sidebar — add it again with + New Project to restore.`);
  };

  const addProject = async () => {
    try {
      const picked = await window.musedesk.pickWorkspace(lastFolder ?? undefined);
      if (!picked) return;
      setLastFolder(picked);
      try {
        localStorage.setItem('musedesk.workspace', picked);
      } catch {
        /* storage unavailable */
      }
      const norm = picked.replace(/\/+$/, '');
      const folders = projectStore.folders.some((f) => f.replace(/\/+$/, '') === norm)
        ? projectStore.folders
        : [...projectStore.folders, norm];
      const collapsed = { ...projectStore.collapsed };
      delete collapsed[norm];
      // Re-adding restores a hidden project with its old chats.
      const hidden = projectStore.hidden.filter((h) => h !== norm);
      const next = { folders, collapsed, hidden };
      setProjectStore(next);
      saveProjects(next);
    } catch (e) {
      fail(e);
    }
  };

  const send = (text: string) => {
    if (!activeId || status?.state !== 'ready' || busy) return;
    const sessionId = activeId;
    const attached = shotsRef.current;
    const attachments = attached.map((s) => ({
      base64Data: s.dataUrl.split(',')[1] ?? '',
      mediaType: s.mediaType,
    }));
    if (text.trim() === '' && attachments.length === 0) return;
    setSendError(null);
    setDraft('');
    setShots([]);
    bumpSending(sessionId, 1);
    window.musedesk
      .sendTurn(sessionId, text, { reasoningEffort: effort, attachments })
      .then((ack) => {
        if (attached.length > 0) {
          const map = shotsMapRef.current;
          map.set(
            ack.commandId,
            attached.map((s) => s.dataUrl),
          );
          while (map.size > 100) {
            const oldest = map.keys().next();
            if (oldest.done) break;
            map.delete(oldest.value);
          }
        }
        // The ack is the only signal for non-started submits (there is no
        // turn/queued notification): never clear-and-forget on it.
        const outcome = classifySendOutcome(ack.disposition);
        if (outcome === 'queued') {
          setQueued((prev) => ({
            ...prev,
            [sessionId]: addQueuedTurn(prev[sessionId] ?? [], {
              turnId: ack.turnId,
              commandId: ack.commandId,
              text,
              shotCount: attached.length,
            }),
          }));
          setNotice('Turn queued behind the running turn — it will start when the current turn ends.');
        } else if (outcome === 'steered') {
          setNotice('Input steered into the running turn.');
        } else if (outcome === 'unknown') {
          setDraft(text);
          setShots(attached);
          setNotice(
            `Send was not started (disposition: ${String(ack.disposition)}) — draft restored. Resync or restart the host and try again.`,
          );
        }
      })
      .catch((e: unknown) => {
        setDraft(text);
        setShots(attached);
        fail(e);
      })
      .finally(() => bumpSending(sessionId, -1));
  };

  const pickImages = () => {
    window.musedesk
      .pickImages()
      .then((picked) => {
        if (picked.length === 0) return;
        if (shotsRef.current.length + picked.length > MAX_ATTACHMENTS) {
          fail(`up to ${MAX_ATTACHMENTS} images per message`);
          return;
        }
        setShots([...shotsRef.current, ...picked]);
      })
      .catch(fail);
  };

  const pasteImages = (imgs: PastedImage[]) => {
    const valid = imgs.filter((i) => i.mediaType.startsWith('image/') && i.dataUrl !== '');
    if (valid.length === 0) return;
    for (const v of valid) {
      if (v.sizeBytes > MAX_IMAGE_BYTES) {
        fail(`"${v.name}" is over 10 MB — attach a smaller image`);
        return;
      }
    }
    if (shotsRef.current.length + valid.length > MAX_ATTACHMENTS) {
      fail(`up to ${MAX_ATTACHMENTS} images per message`);
      return;
    }
    setShots([
      ...shotsRef.current,
      ...valid.map((v) => ({ id: newDraftId(), ...v })),
    ]);
  };

  const interrupt = () => {
    if (!activeId || !snap?.activeTurnId) return;
    window.musedesk.interruptTurn(activeId, snap.activeTurnId).catch(fail);
  };

  const setEffort = (v: ReasoningEffort) => {
    setEffortState(v);
    try {
      localStorage.setItem('musedesk.effort', v);
    } catch {
      /* storage unavailable */
    }
  };

  const updatePanel = (next: PanelState) => {
    setPanel(next);
    try {
      localStorage.setItem('musedesk.panel', JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const changeModel = (modelId: string) => {
    if (!activeId) return;
    const entry = models?.models.find((m) => m.modelId === modelId);
    if (!entry) return;
    const model: ModelSelection = { modelId: entry.modelId, providerId: entry.providerId };
    if (entry.profileId) model.profileId = entry.profileId;
    if (entry.displayLabel) model.displayLabel = entry.displayLabel;
    window.musedesk.setModel(activeId, model).catch(fail);
  };

  const changeApprovalMode = (mode: ApprovalMode) => {
    if (!activeId) return;
    window.musedesk
      .setApprovalMode(activeId, mode)
      .then((r) => {
        setSessions((prev) =>
          prev
            ? prev.map((s) => (s.sessionId === activeId ? { ...s, approvalMode: r.effectiveMode } : s))
            : prev,
        );
      })
      .catch(fail);
  };

  const titleFor = (s: Session): string => {
    const store = storesRef.current.get(s.sessionId);
    const firstUser = store?.snapshot().items.find((i) => i.kind === 'userMessage');
    return sessionTitle(s, firstUser?.text);
  };

  const currentApproval = approvals.length > 0 ? approvals[0] : null;
  const currentPrompt = !currentApproval && prompts.length > 0 ? prompts[0] : null;

  // Built late on purpose: it reads titleFor + handlers declared above.
  const paletteCommands: PaletteCommand[] = (() => {
    const cmds: PaletteCommand[] = (sessions ?? []).map((s) => ({
      id: `go-${s.sessionId}`,
      title: `Go to ${titleFor(s)}`,
      detail: s.workspaceRoot ?? 'default folder',
      run: () => void selectSession(s.sessionId),
    }));
    cmds.push(
      {
        id: 'view',
        title: view === 'overview' ? 'Back to chat' : 'Go to mission control',
        run: () => setView(view === 'overview' ? 'chat' : 'overview'),
      },
      { id: 'new-project', title: 'New project…', run: () => void addProject() },
      ...(active?.workspaceRoot
        ? [
            {
              id: 'new-here',
              title: `New chat in ${projectName(active.workspaceRoot)}`,
              run: () => void newChatIn(active.workspaceRoot),
            } as PaletteCommand,
          ]
        : []),
      { id: 'resync', title: 'Resync active session', run: () => activeId && void resyncSession(activeId, false) },
      { id: 'restart', title: 'Restart host', run: () => void restartHost() },
      {
        id: 'panel',
        title: panel.open ? 'Hide tasks panel' : 'Show tasks panel',
        run: () => updatePanel({ open: !panel.open, tab: panel.tab }),
      },
      ...(models?.models.map((m) => ({
        id: `model-${m.modelId}`,
        title: `Model: ${m.displayLabel ?? m.modelId}`,
        run: () => changeModel(m.modelId),
      })) ?? []),
      ...EFFORTS.map((e) => ({
        id: `effort-${e}`,
        title: `Effort: ${e}`,
        run: () => setEffort(e),
      })),
    );
    return cmds;
  })();

  const overviewCards = (sessions ?? []).map((s) => ({
    session: s,
    title: titleFor(s),
    folderName: projectName(s.workspaceRoot),
    running: s.status === 'running',
    pending: pendingCounts[s.sessionId] ?? 0,
    tokens: tokTotals[s.sessionId] ?? null,
    todos: todos[s.sessionId] ?? [],
  }));

  const stopSession = (id: string) => {
    window.musedesk.interruptTurn(id).catch(fail);
  };

  if (!everReady) {
    return <StatusScreen status={status} busy={busy} onRestart={() => void restartHost()} />;
  }

  const connected = status?.state === 'ready';
  const connectionLabel = connected ? 'connected' : status?.state === 'starting' ? 'reconnecting' : 'disconnected';
  const recoveryWarning = activeId ? recoveryWarnings[activeId] : null;

  if (view === 'overview') {
    return (
      <main className="app">
        {!connected && (
          <div className="banner error">
            {status?.error ?? 'Connection unavailable.'}
            <button className="btn small" disabled={busy || status?.state === 'starting'} onClick={() => void restartHost()}>
              Restart host
            </button>
          </div>
        )}
        <Overview
          cards={overviewCards}
          onOpen={(id) => void selectSession(id)}
          onStop={stopSession}
          onBack={() => setView('chat')}
        />
        {paletteOpen && (
          <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
        )}
      </main>
    );
  }

  return (
    <main className="app layout">
      <Sidebar
        projects={groups}
        activeId={activeId}
        busy={busy}
        pendingCounts={pendingCounts}
        collapsed={projectStore.collapsed}
        titleFor={titleFor}
        onSelect={(id) => void selectSession(id)}
        onToggle={toggleProject}
        onHide={hideProject}
        onNewProject={() => void addProject()}
        onNewChatIn={(folder) => void newChatIn(folder)}
        onRefresh={() => void refresh().catch(fail)}
      />
      <div className="main">
        <header className="topbar">
          <span className="brand">MuseDesk</span>
          <span className={`pill ${connected ? 'ok' : 'error'}`}>{connectionLabel} · {status?.cliVersion ?? ''}</span>
          {active && (
            <span className="ws" title={active.workspaceRoot ?? 'server default'}>
              {baseName(active.workspaceRoot) ?? 'default folder'}
            </span>
          )}
          <label
            className={`fullaccess${status?.fullAccess ? ' on' : ''}`}
            title="Full access runs every session without the shell sandbox. Only for work you trust."
          >
            <input
              type="checkbox"
              checked={status?.fullAccess ?? false}
              disabled={busy}
              onChange={(e) => void toggleFullAccess(e.target.checked)}
            />
            Full access
          </label>
          {activeCtxPct !== null && activeCtx && activeCtx.windowTokens !== null && (
            <span
              className="ctx"
              title={`Context window: ${activeCtx.usedTokens.toLocaleString()} / ${activeCtx.windowTokens.toLocaleString()} tokens · pressure: ${activeCtx.pressure}`}
            >
              <span className="ctx-bar">
                <span
                  className={`ctx-fill${activeCtx.pressure === 'blocked' ? ' blocked' : activeCtx.pressure === 'warning' ? ' warn' : ''}`}
                  style={{ width: `${activeCtxPct}%` }}
                />
              </span>
              <span className="ctx-label">ctx {activeCtxPct}%</span>
            </span>
          )}
          {activeTok && (
            <span
              className="tok"
              title={`Session tokens: ${activeTok.totalTokens.toLocaleString()} total · ${activeTok.promptTokens.toLocaleString()} prompt · ${activeTok.outputTokens.toLocaleString()} output`}
            >
              tok {formatTokens(activeTok.totalTokens)}
            </span>
          )}
          {active && <span className="session-id">{active.sessionId.slice(0, 8)}</span>}
          <button
            className="btn icon"
            onClick={() => activeId && void resyncSession(activeId, false)}
            disabled={busy || !activeId || !connected}
            title="Re-sync active session with the server"
          >
            ⟳
          </button>
          {!connected && (
            <button className="btn small" disabled={busy || status?.state === 'starting'} onClick={() => void restartHost()}>
              Restart host
            </button>
          )}
          <button
            className={`btn panel-toggle${panel.open ? ' on' : ''}`}
            onClick={() => updatePanel({ open: !panel.open, tab: panel.tab })}
            title="Toggle tasks/changes panel"
          >
            Tasks
          </button>
          <button
            className="btn panel-toggle"
            onClick={() => setView('overview')}
            title="Mission control: all sessions at a glance"
          >
            Overview
          </button>
        </header>
        {active && (
          <ControlsBar
            session={active}
            models={models}
            effort={effort}
            disabled={busy || !connected}
            onModelChange={changeModel}
            onEffortChange={setEffort}
            onApprovalModeChange={changeApprovalMode}
          />
        )}
        {status?.state === 'starting' && <div className="banner">Reconnecting to host…</div>}
        {status?.state === 'error' && <div className="banner error">{status.error ?? 'host error'}</div>}
        {!status && <div className="banner error">Connection status unavailable. Restart host to reconnect.</div>}
        {recoveryWarning && <div className="banner warn">{recoveryWarning}</div>}
        {status?.cliArch === 'x86_64' && (
          <div className="banner warn">
            The `muse` CLI is Intel-only and runs under Rosetta — Apple will drop Intel support in a
            future macOS. Reinstall the Apple Silicon build of the Muse Code CLI, then restart MuseDesk.
          </div>
        )}
        {sendError && <div className="banner error">{sendError}</div>}
        {notice && <div className="banner">{notice}</div>}
        {busy && !snap && <div className="banner">Loading…</div>}
        {!snap && !busy && <div className="empty">Select a session or start a new chat.</div>}
        {snap && (
          <ChatView
            snapshot={snap}
            shotsFor={shotsFor}
            busy={busy}
            connected={connected}
            queued={activeId ? (queued[activeId] ?? []) : []}
            onRestartHost={() => void restartHost()}
          />
        )}
        {snap && snap.items.length === 0 && !snap.activeTurnId && !busy && (
          <Suggestions onPick={setDraft} />
        )}
        <Composer
          running={!!snap?.activeTurnId}
          disabled={!activeId || busy || !connected}
          sending={activeId ? (sending[activeId] ?? 0) > 0 : false}
          draft={draft}
          shots={shots}
          onDraftChange={setDraft}
          onSend={send}
          onInterrupt={interrupt}
          onPickImages={pickImages}
          onPasteImages={pasteImages}
          onRemoveShot={(id) => setShots(shotsRef.current.filter((s) => s.id !== id))}
          onAttachError={fail}
        />
        {currentApproval && activeId && (
          <ApprovalDialog
            request={currentApproval}
            queueCount={approvals.length}
            onDecide={async (choiceId, feedback) => {
              await window.musedesk.decideApproval({
                sessionId: activeId,
                approvalId: currentApproval.approvalId,
                choiceId,
                requirementId: currentApproval.currentRequirementId,
                feedback,
              });
            }}
            onRefresh={() => reconcilePending(activeId)}
          />
        )}
        {currentPrompt && activeId && (
          <UserInputDialog
            request={currentPrompt}
            queueCount={prompts.length}
            onAnswer={async (answers: UserInputAnswer[]) => {
              await window.musedesk.answerUserInput(activeId, currentPrompt.userInputId, answers);
            }}
            onCancel={async () => {
              await window.musedesk.cancelUserInput(activeId, currentPrompt.userInputId);
            }}
          />
        )}
      </div>
      {panel.open && (
        <SidePanel
          tab={panel.tab}
          onTab={(tab) => updatePanel({ open: true, tab })}
          todos={activeTodos}
          folder={active?.workspaceRoot ?? null}
          gitNonce={gitNonce}
        />
      )}
      {paletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      )}
    </main>
  );
}
