import React from 'react';
import type { AttachmentDraft, HostStatus } from '../shared/bridge';
import { MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from '../shared/limits';
import type {
  ApprovalMode,
  ApprovalRequestParams,
  Item,
  ModelListResult,
  ModelSelection,
  ReasoningEffort,
  Session,
  SessionHistory,
  UserInputAnswer,
  UserInputRequestParams,
} from '../msp/msp';
import { createTranscriptStore, type TranscriptSnapshot, type TranscriptStore } from '../msp/transcript';
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
import { groupSessions, loadProjects, saveProjects, type ProjectStore } from '../shared/projects';
import { humanizeError } from '../shared/errors';
import { ChatView } from './ChatView';
import { Composer, type PastedImage } from './Composer';
import { Sidebar, sessionTitle } from './Sidebar';
import { SidePanel, type PanelTab } from './SidePanel';
import { Suggestions } from './Suggestions';
import { ControlsBar } from './ControlsBar';
import { ApprovalDialog } from './ApprovalDialog';
import { UserInputDialog } from './UserInputDialog';

function StatusScreen({ status }: { status: HostStatus | null }) {
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
      {!window.musedesk && <p>Waiting for preload bridge…</p>}
    </main>
  );
}

function seedFromHistory(store: TranscriptStore, history: SessionHistory): string | null {
  if (history.mode === 'inline' && history.items) {
    store.seed(history.items);
    return null;
  }
  if ((history.mode === 'snapshot' || history.mode === 'anchoredSnapshot') && history.snapshot) {
    store.seed(history.snapshot.state.items);
    return null;
  }
  return 'Showing new messages only — older history was not served for this session.';
}

function itemsFromHistory(history: SessionHistory): Item[] | null {
  if (history.mode === 'inline' && history.items) return history.items;
  if ((history.mode === 'snapshot' || history.mode === 'anchoredSnapshot') && history.snapshot) {
    return history.snapshot.state.items;
  }
  return null;
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
  const [approvals, setApprovals] = React.useState<ApprovalRequestParams[]>([]);
  const [prompts, setPrompts] = React.useState<UserInputRequestParams[]>([]);
  const [pendingCounts, setPendingCounts] = React.useState<Record<string, number>>({});
  const [ctxUsage, setCtxUsage] = React.useState<Record<string, SessionContextUsage>>({});
  const [tokTotals, setTokTotals] = React.useState<Record<string, SessionTokenTotals>>({});
  const [todos, setTodos] = React.useState<Record<string, TodoView[]>>({});
  const [panel, setPanel] = React.useState<PanelState>(loadPanel);
  const [gitNonce, setGitNonce] = React.useState(0);
  const [models, setModels] = React.useState<ModelListResult | null>(null);
  const [effort, setEffortState] = React.useState<ReasoningEffort>(loadEffort);
  const [draft, setDraft] = React.useState('');
  const [lastFolder, setLastFolder] = React.useState<string | null>(null);
  const [projectStore, setProjectStore] = React.useState<ProjectStore>(loadProjects);
  const [shots, setShots] = React.useState<AttachmentDraft[]>([]);
  const shotsRef = React.useRef<AttachmentDraft[]>([]);
  const shotsMapRef = React.useRef(new Map<string, string[]>());
  const storesRef = React.useRef(new Map<string, TranscriptStore>());
  const activeRef = React.useRef<string | null>(null);
  const bootedRef = React.useRef(false);
  const lastEventRef = React.useRef(new Map<string, number>());
  const resyncAtRef = React.useRef(new Map<string, number>());

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

  // Route every live event: transcript stores always, dialogs when active,
  // badges + session fields otherwise.
  React.useEffect(
    () =>
      window.musedesk.onChatEvent((frame) => {
        lastEventRef.current.set(frame.sessionId, Date.now());
        const p = (frame.params ?? {}) as Record<string, unknown>;
        const isActive = frame.sessionId === activeRef.current;
        switch (frame.method) {
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
        let store = storesRef.current.get(frame.sessionId);
        if (!store) {
          store = createTranscriptStore();
          storesRef.current.set(frame.sessionId, store);
        }
        store.apply(frame.method, frame.params);
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

  const fail = (e: unknown) => setSendError(humanizeError(e));

  // NOTE: every hook must run on every render — keep all React.use* calls
  // above the `!everReady` early return or React unmounts the whole tree.
  const shotsFor = React.useCallback(
    (commandId?: string): string[] => (commandId ? (shotsMapRef.current.get(commandId) ?? []) : []),
    [],
  );

  const refresh = React.useCallback(async () => {
    const list = await window.musedesk.listSessions({ limit: 50 });
    setSessions(list.sessions);
    return list.sessions;
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

  // Rebuild the transcript from a point-in-time server read and reconcile the
  // active turn against it. Read-only server-side (no re-subscribe), so it is
  // safe to run on a live turn: a no-op when the server agrees it is running.
  const resyncSession = React.useCallback(async (sessionId: string, auto: boolean) => {
    const store = storesRef.current.get(sessionId);
    if (!store) return;
    setBusy(true);
    try {
      const read = await window.musedesk.readSession(sessionId, false);
      const hadActive = store.snapshot().activeTurnId;
      store.resyncFromHistory(itemsFromHistory(read.history), read.session.activeTurnId);
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
      if (stillActive) lastEventRef.current.set(sessionId, Date.now());
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
      if (!auto) setSendError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // Throws on failure (caller decides: surface or fall through to the next).
  const tryOpenSession = React.useCallback(
    async (sessionId: string, known?: Session[]) => {
      let store = storesRef.current.get(sessionId);
      if (!store) {
        store = createTranscriptStore();
        storesRef.current.set(sessionId, store);
        try {
          const resumed = await window.musedesk.resumeSession(sessionId, { history: 'inline' });
          setNotice(seedFromHistory(store, resumed.history));
          const snapUsage = snapshotContextUsage(resumed.history);
          if (snapUsage) setCtxUsage((prev) => ({ ...prev, [sessionId]: snapUsage }));
          const snapTokens = snapshotTokenUsage(resumed.history);
          if (snapTokens) setTokTotals((prev) => ({ ...prev, [sessionId]: snapTokens }));
          const snapTodos = snapshotTodoList(resumed.history);
          if (snapTodos) setTodos((prev) => ({ ...prev, [sessionId]: snapTodos }));
          setSessions((prev) =>
            prev ? prev.map((s) => (s.sessionId === sessionId ? resumed.session : s)) : (known ?? null),
          );
          if (resumed.pendingRequests.length > 0) await reconcilePending(sessionId);
        } catch (e) {
          storesRef.current.delete(sessionId);
          throw e;
        }
      }
      setActiveId(sessionId);
      setSnap(store.snapshot());
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
    if (status?.state !== 'ready' || bootedRef.current) return;
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
          } catch {
            /* in use or stale — try the next most recent */
          }
        }
        if (!opened) {
          const started = await window.musedesk.startSession(folder ? { workspaceRoot: folder } : {});
          setSessions((prev) => (prev ? [started.session, ...prev] : [started.session]));
          storesRef.current.set(started.session.sessionId, createTranscriptStore());
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

  // Stuck-turn watchdog: an active turn silent on the live stream for a full
  // minute gets one server re-read per silence window (at most one RPC/min).
  React.useEffect(() => {
    if (!everReady || busy) return undefined;
    const t = setInterval(() => {
      const id = activeRef.current;
      if (!id) return;
      const active = storesRef.current.get(id)?.snapshot().activeTurnId;
      if (!active) return;
      const now = Date.now();
      if (now - (lastEventRef.current.get(id) ?? 0) < STUCK_SILENCE_MS) return;
      if (now - (resyncAtRef.current.get(id) ?? 0) < STUCK_SILENCE_MS) return;
      resyncAtRef.current.set(id, now);
      void resyncSession(id, true);
    }, 10000);
    return () => clearInterval(t);
  }, [everReady, busy, resyncSession]);

  if (!everReady) return <StatusScreen status={status} />;

  const active = sessions?.find((s) => s.sessionId === activeId) ?? null;
  const activeCtx = activeId ? (ctxUsage[activeId] ?? null) : null;
  const activeCtxPct = activeCtx ? contextPct(activeCtx) : null;
  const activeTok = activeId ? (tokTotals[activeId] ?? null) : null;
  const activeTodos = activeId ? (todos[activeId] ?? []) : [];

  const restartHost = async () => {
    if ((sessions?.some((s) => s.status === 'running') ?? false) || snap?.activeTurnId) {
      fail('Stop all running turns before restarting the host.');
      return;
    }
    setBusy(true);
    setSendError(null);
    try {
      await window.musedesk.restartHost();
      await waitForReady();
      await refresh();
      storesRef.current.clear();
      setSnap(null);
      setApprovals([]);
      setPrompts([]);
      setPendingCounts({});
      const id = activeRef.current;
      if (id) await selectSession(id);
      setNotice('Host restarted — send again to retry the turn.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const toggleFullAccess = async (next: boolean) => {
    if ((sessions?.some((s) => s.status === 'running') ?? false) || snap?.activeTurnId) {
      fail('Stop all running turns before switching access mode.');
      return;
    }
    setBusy(true);
    setSendError(null);
    try {
      const s = await window.musedesk.setFullAccess(next);
      if (s.fullAccess !== next) return; // confirm dismissed — nothing changed
      await waitForReady();
      await refresh();
      storesRef.current.clear();
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
      storesRef.current.set(started.session.sessionId, createTranscriptStore());
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
    if (!activeId) return;
    const attached = shotsRef.current;
    const attachments = attached.map((s) => ({
      base64Data: s.dataUrl.split(',')[1] ?? '',
      mediaType: s.mediaType,
    }));
    if (text.trim() === '' && attachments.length === 0) return;
    setSendError(null);
    setDraft('');
    setShots([]);
    window.musedesk
      .sendTurn(activeId, text, { reasoningEffort: effort, attachments })
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
      })
      .catch((e: unknown) => {
        setDraft(text);
        setShots(attached);
        fail(e);
      });
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
          <span className="pill ok">connected · {status?.cliVersion ?? ''}</span>
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
            disabled={busy || !activeId}
            title="Re-sync active session with the server"
          >
            ⟳
          </button>
          <button
            className={`btn panel-toggle${panel.open ? ' on' : ''}`}
            onClick={() => updatePanel({ open: !panel.open, tab: panel.tab })}
            title="Toggle tasks/changes panel"
          >
            Tasks
          </button>
        </header>
        {active && (
          <ControlsBar
            session={active}
            models={models}
            effort={effort}
            disabled={busy}
            onModelChange={changeModel}
            onEffortChange={setEffort}
            onApprovalModeChange={changeApprovalMode}
          />
        )}
        {status?.state === 'starting' && <div className="banner">Reconnecting to host…</div>}
        {status?.state === 'error' && <div className="banner error">{status.error ?? 'host error'}</div>}
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
            onRestartHost={() => void restartHost()}
          />
        )}
        {snap && snap.items.length === 0 && !snap.activeTurnId && !busy && (
          <Suggestions onPick={setDraft} />
        )}
        <Composer
          running={!!snap?.activeTurnId}
          disabled={!activeId || busy}
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
    </main>
  );
}
