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
  SessionHistory,
  UserInputAnswer,
  UserInputRequestParams,
} from '../msp/msp';
import { createTranscriptStore, type TranscriptSnapshot, type TranscriptStore } from '../msp/transcript';
import { humanizeError } from '../shared/errors';
import { ChatView } from './ChatView';
import { Composer, type PastedImage } from './Composer';
import { Sidebar, sessionTitle } from './Sidebar';
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
  const [models, setModels] = React.useState<ModelListResult | null>(null);
  const [effort, setEffortState] = React.useState<ReasoningEffort>(loadEffort);
  const [draft, setDraft] = React.useState('');
  const [newChatFolder, setNewChatFolder] = React.useState<string | null>(null);
  const [shots, setShots] = React.useState<AttachmentDraft[]>([]);
  const shotsRef = React.useRef<AttachmentDraft[]>([]);
  const shotsMapRef = React.useRef(new Map<string, string[]>());
  const storesRef = React.useRef(new Map<string, TranscriptStore>());
  const activeRef = React.useRef<string | null>(null);
  const bootedRef = React.useRef(false);

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
        if (folder) setNewChatFolder(folder);
        const found = await refresh();
        let opened = false;
        for (const s of found.slice(0, 5)) {
          try {
            await tryOpenSession(s.sessionId, found);
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
        }
      } catch (e) {
        bootedRef.current = false;
        fail(e);
      } finally {
        setBusy(false);
      }
    })();
  }, [status, refresh, tryOpenSession]);

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

  if (!everReady) return <StatusScreen status={status} />;

  const active = sessions?.find((s) => s.sessionId === activeId) ?? null;

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
      if (id) await openSession(id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const newChat = async (folder?: string) => {
    setBusy(true);
    setNotice(null);
    setSendError(null);
    setApprovals([]);
    setPrompts([]);
    try {
      const root = folder ?? newChatFolder;
      const started = await window.musedesk.startSession(root ? { workspaceRoot: root } : {});
      setSessions((prev) => (prev ? [started.session, ...prev] : [started.session]));
      storesRef.current.set(started.session.sessionId, createTranscriptStore());
      setActiveId(started.session.sessionId);
      setSnap(storesRef.current.get(started.session.sessionId)!.snapshot());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
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

  const pickFolderAndStart = async () => {
    try {
      const picked = await window.musedesk.pickWorkspace(newChatFolder ?? undefined);
      if (!picked) return;
      setNewChatFolder(picked);
      try {
        localStorage.setItem('musedesk.workspace', picked);
      } catch {
        /* storage unavailable */
      }
      await newChat(picked);
    } catch (e) {
      fail(e);
    }
  };

  const currentApproval = approvals.length > 0 ? approvals[0] : null;
  const currentPrompt = !currentApproval && prompts.length > 0 ? prompts[0] : null;

  return (
    <main className="app layout">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        busy={busy}
        pendingCounts={pendingCounts}
        newChatFolder={newChatFolder}
        titleFor={titleFor}
        onSelect={(id) => void openSession(id)}
        onNew={() => void pickFolderAndStart()}
        onNewHere={() => void newChat()}
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
          {active && <span className="session-id">{active.sessionId.slice(0, 8)}</span>}
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
        {sendError && <div className="banner error">{sendError}</div>}
        {notice && <div className="banner">{notice}</div>}
        {busy && !snap && <div className="banner">Loading…</div>}
        {!snap && !busy && <div className="empty">Select a session or start a new chat.</div>}
        {snap && <ChatView snapshot={snap} shotsFor={shotsFor} />}
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
    </main>
  );
}
