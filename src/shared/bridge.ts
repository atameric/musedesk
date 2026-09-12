import type {
  ApprovalDecideResult,
  ApprovalListPendingResult,
  ApprovalMode,
  ApprovalRequirementRef,
  HistoryPreference,
  IfBusy,
  ModelListResult,
  ModelSelection,
  ReasoningEffort,
  SessionListResult,
  SessionReadResult,
  SessionResumeResult,
  SessionSetApprovalModeResult,
  SessionSetModelResult,
  SessionStartResult,
  TurnInterruptResult,
  TurnStartResult,
  UserInputAnswer,
  UserInputAnswerResult,
  UserInputCancelResult,
  ViewPageDirection,
  ViewPageResult,
} from '../msp/msp';

/** Read-only host status (P0 surface, unchanged). */
export interface HostStatus {
  state: 'starting' | 'ready' | 'error';
  cliVersion: string | null;
  serverVersion: string | null;
  fingerprint: string | null;
  fingerprintMatch: boolean | null;
  error: string | null;
  /** True when the host runs with `--disable-sandbox`. */
  fullAccess: boolean;
}

/** One forwarded MSP view notification (plus synthetic muse/* recovery frames). */
export interface ChatEventFrame {
  sessionId: string;
  method: string;
  params: unknown;
}

export interface StartSessionOptions {
  providerId?: string;
  workspaceRoot?: string;
  modelId?: string;
  approvalMode?: ApprovalMode;
}

export interface TurnAttachmentWire {
  base64Data: string;
  mediaType: string;
}

export interface SendTurnOptions {
  reasoningEffort?: ReasoningEffort;
  ifBusy?: IfBusy;
  displayText?: string;
  attachments?: TurnAttachmentWire[];
}

export interface AttachmentDraft {
  id: string;
  name: string;
  sizeBytes: number;
  mediaType: string;
  dataUrl: string;
}

export interface PageViewOptions {
  cursor?: string;
  limit?: number;
  direction?: ViewPageDirection;
}

export interface ListSessionsOptions {
  cursor?: string;
  limit?: number;
  updatedAfter?: string;
  workspaceRoot?: string;
}

export interface ResumeSessionOptions {
  cursor?: string;
  excludeItems?: boolean;
  history?: HistoryPreference;
}

/**
 * Renderer-facing bridge. Grows per phase; every method rejects with an
 * Error when the host is not ready or the MSP call fails.
 */
export interface MuseDeskBridge {
  getStatus(): Promise<HostStatus>;
  startSession(opts?: StartSessionOptions): Promise<SessionStartResult>;
  sendTurn(sessionId: string, text: string, opts?: SendTurnOptions): Promise<TurnStartResult>;
  interruptTurn(sessionId: string, turnId?: string, retract?: boolean): Promise<TurnInterruptResult>;
  pageView(sessionId: string, opts?: PageViewOptions): Promise<ViewPageResult>;
  listSessions(opts?: ListSessionsOptions): Promise<SessionListResult>;
  resumeSession(sessionId: string, opts?: ResumeSessionOptions): Promise<SessionResumeResult>;
  readSession(sessionId: string, excludeItems?: boolean): Promise<SessionReadResult>;
  listModels(sessionId?: string): Promise<ModelListResult>;
  setModel(sessionId: string, model: ModelSelection): Promise<SessionSetModelResult>;
  setApprovalMode(sessionId: string, mode: ApprovalMode): Promise<SessionSetApprovalModeResult>;
  decideApproval(args: {
    sessionId: string;
    approvalId: string;
    choiceId: string;
    requirementId: ApprovalRequirementRef;
    feedback?: string | null;
  }): Promise<ApprovalDecideResult>;
  listPending(sessionId: string): Promise<ApprovalListPendingResult>;
  answerUserInput(
    sessionId: string,
    userInputId: string,
    answers: UserInputAnswer[],
  ): Promise<UserInputAnswerResult>;
  cancelUserInput(sessionId: string, userInputId: string, reason?: string): Promise<UserInputCancelResult>;
  pickImages(): Promise<AttachmentDraft[]>;
  setFullAccess(fullAccess: boolean): Promise<HostStatus>;
  /** Folder dialog; opens at `defaultPath` when it names a usable location. */
  pickWorkspace(defaultPath?: string): Promise<string | null>;
  defaultWorkspace(): Promise<string>;
  onChatEvent(cb: (frame: ChatEventFrame) => void): () => void;
}

declare global {
  interface Window {
    musedesk: MuseDeskBridge;
  }
}
