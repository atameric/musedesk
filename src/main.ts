import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from 'electron';
import os from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { discoverMuse } from './msp/discovery';
import { MspHost } from './msp/host';
import { ChatManager } from './msp/chat';
import { imageFileToDraft } from './msp/images';
import { MAX_ATTACHMENTS } from './shared/limits';
import { loadPrefs, savePrefs, serveArgsFor } from './main/prefs';
import { gitDiff, gitStatus } from './main/git';
import { dialogPathFor } from './main/workspace';
import { PINNED_CLI_VERSION, PINNED_FINGERPRINT } from './msp/pinned';
import { IPC } from './shared/channels';
import type { HostStatus } from './shared/bridge';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const status: HostStatus = {
  state: 'starting',
  cliVersion: null,
  serverVersion: null,
  fingerprint: null,
  fingerprintMatch: null,
  error: null,
  fullAccess: false,
  cliArch: 'unknown',
};

let host: MspHost | null = null;
let chat: ChatManager | null = null;
let mainWindow: BrowserWindow | null = null;
let fullAccess = false;
let hostStartQueue: Promise<void> = Promise.resolve();
let probingHost: MspHost | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    title: 'MuseDesk',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  const window = mainWindow;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

function requireChat(): ChatManager {
  if (!chat || !host?.connected || status.state !== 'ready') {
    throw new Error(status.error ?? 'MSP host is not ready yet');
  }
  return chat;
}

function startHostWith(opts: { fullAccess: boolean }): Promise<void> {
  const start = hostStartQueue.then(() => startHostNow(opts));
  hostStartQueue = start.catch(() => { /* allow the next restart */ });
  return start;
}

async function startHostNow(opts: { fullAccess: boolean }) {
  status.state = 'starting';
  status.error = null;
  status.fullAccess = opts.fullAccess;
  chat = null;
  if (host) {
    try {
      await host.close();
    } catch {
      /* previous host already gone */
    }
  }
  host = null;
  try {
    const install = discoverMuse();
    status.cliVersion = install.version;
    status.cliArch = install.arch;
    const h = new MspHost(install.binPath, 'musedesk', app.getVersion(), serveArgsFor(opts.fullAccess));
    host = h;
    h.onHealthChange((error) => {
      // Ignore late failures from an intentionally replaced process.
      if (host !== h || status.state === 'starting' || !status.fingerprintMatch) return;
      status.state = error ? 'error' : 'ready';
      status.error = error?.message ?? null;
    });
    const init = await h.connect();
    status.serverVersion = `${init.serverInfo.name}/${init.serverInfo.version}`;
    status.fingerprint = init.schema.fingerprint;
    status.fingerprintMatch = init.schema.fingerprint === PINNED_FINGERPRINT;
    if (!status.fingerprintMatch) {
      status.state = 'error';
      status.error =
        `MSP fingerprint mismatch: host=${init.schema.fingerprint} pinned=${PINNED_FINGERPRINT}. ` +
        `This MuseDesk build was verified against ${PINNED_CLI_VERSION}; refusing to drive an unknown protocol.`;
      await h.close();
      host = null;
      return;
    }
    const manager = new ChatManager(h);
    chat = manager;
    manager.onEvent((sessionId, method, params) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.chatEvent, { sessionId, method, params });
      }
    });
    if (!h.connected || h.error) throw h.error ?? new Error('MSP host disconnected during startup');
    status.state = 'ready';
  } catch (e) {
    status.state = 'error';
    status.error = e instanceof Error ? e.message : String(e);
    const failedHost = host;
    host = null;
    chat = null;
    await failedHost?.close();
  }
}

// Read-only heartbeat: a sleeping/hung process can still have live stdio.
// This runs in main so renderer timer throttling cannot mask transport loss.
async function probeHost(): Promise<void> {
  const h = host;
  const isStarting = () => status.state === 'starting';
  if (!h?.connected || !chat || isStarting() || probingHost === h) return;
  probingHost = h;
  try {
    await h.request('session/list', { limit: 1 });
  } catch (e) {
    if (host === h && status.state !== 'starting') {
      status.state = 'error';
      status.error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    if (probingHost === h) probingHost = null;
  }
}

ipcMain.handle(IPC.status, () => ({ ...status }));
ipcMain.handle(IPC.sessionStart, (_e, opts) => requireChat().startSession(opts ?? {}));
ipcMain.handle(IPC.turnSend, (_e, args) =>
  requireChat().sendTurn(args.sessionId, args.text, args.opts ?? {}),
);
ipcMain.handle(IPC.turnInterrupt, (_e, args) =>
  requireChat().interruptTurn(args.sessionId, args.turnId, args.retract ?? false),
);
ipcMain.handle(IPC.viewPage, (_e, args) => requireChat().pageView(args.sessionId, args.opts ?? {}));
ipcMain.handle(IPC.viewSubscribe, (_e, args) => requireChat().subscribeView(args.sessionId, args.after));
ipcMain.handle(IPC.sessionList, (_e, opts) => requireChat().listSessions(opts ?? {}));
ipcMain.handle(IPC.sessionResume, (_e, args) =>
  requireChat().resumeSession(args.sessionId, args.opts ?? {}),
);
ipcMain.handle(IPC.sessionRead, (_e, args) =>
  requireChat().readSession(args.sessionId, args.excludeItems ?? true),
);
ipcMain.handle(IPC.modelList, (_e, args) => requireChat().listModels(args?.sessionId));
ipcMain.handle(IPC.modelSet, (_e, args) => requireChat().setModel(args.sessionId, args.model));
ipcMain.handle(IPC.approvalModeSet, (_e, args) =>
  requireChat().setApprovalMode(args.sessionId, args.mode),
);
ipcMain.handle(IPC.approvalDecide, (_e, args) =>
  requireChat().decideApproval({
    sessionId: args.sessionId,
    approvalId: args.approvalId,
    choiceId: args.choiceId,
    requirementId: args.requirementId,
    feedback: args.feedback,
  }),
);
ipcMain.handle(IPC.approvalPending, (_e, args) => requireChat().listPending(args.sessionId));
ipcMain.handle(IPC.userInputAnswer, (_e, args) =>
  requireChat().answerUserInput(args.sessionId, args.userInputId, args.answers),
);
ipcMain.handle(IPC.userInputCancel, (_e, args) =>
  requireChat().cancelUserInput(args.sessionId, args.userInputId, args.reason),
);
ipcMain.handle(IPC.imagePick, async () => {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('no window to attach to');
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Attach images',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  });
  if (picked.canceled) return [];
  if (picked.filePaths.length > MAX_ATTACHMENTS) {
    throw new Error(`pick up to ${MAX_ATTACHMENTS} images at a time`);
  }
  return picked.filePaths.map(imageFileToDraft);
});

ipcMain.handle(IPC.hostSetFullAccess, async (_e, args) => {
  const next = args?.fullAccess === true;
  if (next === fullAccess) return { ...status };
  if (next && mainWindow && !mainWindow.isDestroyed()) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Disable sandbox'],
      defaultId: 0,
      cancelId: 0,
      title: 'Enable full access?',
      message: 'Disable the shell sandbox for every session?',
      detail:
        'The agent will run shells and file operations without sandbox restrictions. ' +
        'Only enable this for workspaces you trust.',
    });
    if (response !== 1) return { ...status };
  }
  fullAccess = next;
  savePrefs(app.getPath('userData'), { fullAccess });
  await startHostWith({ fullAccess });
  return { ...status };
});

ipcMain.handle(IPC.hostRestart, async () => {
  await startHostWith({ fullAccess });
  return { ...status };
});

ipcMain.handle(IPC.workspacePick, async (_e, args) => {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('no window');
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose working folder',
    properties: ['openDirectory'],
    defaultPath: dialogPathFor(args?.defaultPath),
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  return picked.filePaths[0];
});

ipcMain.handle(IPC.workspaceDefault, () => os.homedir());

ipcMain.handle(IPC.gitStatus, (_e, args) => gitStatus(args?.root));
ipcMain.handle(IPC.gitDiff, (_e, args) => gitDiff(args?.root, args?.path));

app.on('ready', () => {
  createWindow();
  fullAccess = loadPrefs(app.getPath('userData')).fullAccess;
  void startHostWith({ fullAccess });
  setInterval(() => void probeHost(), 15000).unref();
  powerMonitor.on('resume', () => void probeHost());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  void host?.close();
});
