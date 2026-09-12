import { contextBridge, ipcRenderer } from 'electron';
import type { ChatEventFrame, MuseDeskBridge } from './shared/bridge';
import { IPC } from './shared/channels';

const api: MuseDeskBridge = {
  getStatus: () => ipcRenderer.invoke(IPC.status),
  startSession: (opts) => ipcRenderer.invoke(IPC.sessionStart, opts ?? {}),
  sendTurn: (sessionId, text, opts) =>
    ipcRenderer.invoke(IPC.turnSend, { sessionId, text, opts: opts ?? {} }),
  interruptTurn: (sessionId, turnId, retract) =>
    ipcRenderer.invoke(IPC.turnInterrupt, { sessionId, turnId, retract: retract ?? false }),
  pageView: (sessionId, opts) => ipcRenderer.invoke(IPC.viewPage, { sessionId, opts: opts ?? {} }),
  listSessions: (opts) => ipcRenderer.invoke(IPC.sessionList, opts ?? {}),
  resumeSession: (sessionId, opts) =>
    ipcRenderer.invoke(IPC.sessionResume, { sessionId, opts: opts ?? {} }),
  readSession: (sessionId, excludeItems) =>
    ipcRenderer.invoke(IPC.sessionRead, { sessionId, excludeItems: excludeItems ?? true }),
  listModels: (sessionId) => ipcRenderer.invoke(IPC.modelList, { sessionId }),
  setModel: (sessionId, model) => ipcRenderer.invoke(IPC.modelSet, { sessionId, model }),
  setApprovalMode: (sessionId, mode) => ipcRenderer.invoke(IPC.approvalModeSet, { sessionId, mode }),
  decideApproval: (args) => ipcRenderer.invoke(IPC.approvalDecide, args),
  listPending: (sessionId) => ipcRenderer.invoke(IPC.approvalPending, { sessionId }),
  answerUserInput: (sessionId, userInputId, answers) =>
    ipcRenderer.invoke(IPC.userInputAnswer, { sessionId, userInputId, answers }),
  cancelUserInput: (sessionId, userInputId, reason) =>
    ipcRenderer.invoke(IPC.userInputCancel, { sessionId, userInputId, reason }),
  pickImages: () => ipcRenderer.invoke(IPC.imagePick),
  setFullAccess: (fullAccess) => ipcRenderer.invoke(IPC.hostSetFullAccess, { fullAccess }),
  pickWorkspace: (defaultPath) => ipcRenderer.invoke(IPC.workspacePick, { defaultPath }),
  defaultWorkspace: () => ipcRenderer.invoke(IPC.workspaceDefault),
  onChatEvent: (cb) => {
    const listener = (_e: unknown, frame: ChatEventFrame) => cb(frame);
    ipcRenderer.on(IPC.chatEvent, listener);
    return () => {
      ipcRenderer.removeListener(IPC.chatEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld('musedesk', api);
