import type { IMspClient, MspEvent } from './host';
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
} from './msp';
import { uuidv7 } from './uuid';
import { MAX_ATTACHMENTS } from '../shared/limits';

/**
 * Typed session/turn driver over an MSP connection. Owns no UI state:
 * it issues commands and forwards every server notification (plus gap
 * recovery) to subscribers. The renderer folds events with transcript.ts.
 */
export type ChatEventSink = (sessionId: string, method: string, params: unknown) => void;

export interface StartSessionOptions {
  providerId?: string;
  workspaceRoot?: string;
  modelId?: string;
  approvalMode?: ApprovalMode;
}

export interface TurnAttachment {
  base64Data: string;
  mediaType: string;
}

export interface SendTurnOptions {
  reasoningEffort?: ReasoningEffort;
  ifBusy?: IfBusy;
  displayText?: string;
  attachments?: TurnAttachment[];
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

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export class ChatManager {
  private sinks = new Set<ChatEventSink>();
  private recoveredGaps = new Set<string>();

  constructor(private readonly client: IMspClient) {
    client.onNotification((n) => void this.dispatch(n));
  }

  onEvent(fn: ChatEventSink): () => void {
    this.sinks.add(fn);
    return () => {
      this.sinks.delete(fn);
    };
  }

  async startSession(opts: StartSessionOptions = {}): Promise<SessionStartResult> {
    return (await this.client.request(
      'session/start',
      stripUndefined({ commandId: uuidv7(), ...opts }),
    )) as SessionStartResult;
  }

  async sendTurn(sessionId: string, text: string, opts: SendTurnOptions = {}): Promise<TurnStartResult> {
    const attachments = opts.attachments ?? [];
    if (!text.trim() && attachments.length === 0) throw new Error('cannot send an empty turn');
    if (attachments.length > MAX_ATTACHMENTS) {
      throw new Error(`cannot attach more than ${MAX_ATTACHMENTS} images to one turn`);
    }
    for (const a of attachments) {
      if (!a.base64Data || !a.mediaType.startsWith('image/')) {
        throw new Error('each attachment needs image mediaType and base64 data');
      }
    }
    const input: Array<Record<string, unknown>> = [];
    if (text !== '') input.push({ type: 'text', text });
    for (const a of attachments) {
      input.push({ type: 'image', base64Data: a.base64Data, mediaType: a.mediaType });
    }
    return (await this.client.request(
      'turn/start',
      stripUndefined({
        commandId: uuidv7(),
        sessionId,
        input,
        displayText: opts.displayText ?? (text === '' ? undefined : text),
        reasoningEffort: opts.reasoningEffort,
        ifBusy: opts.ifBusy,
      }),
    )) as TurnStartResult;
  }

  async interruptTurn(sessionId: string, turnId?: string, retract = false): Promise<TurnInterruptResult> {
    return (await this.client.request(
      'turn/interrupt',
      stripUndefined({ commandId: uuidv7(), sessionId, turnId, retract }),
    )) as TurnInterruptResult;
  }

  async pageView(sessionId: string, opts: PageViewOptions = {}): Promise<ViewPageResult> {
    return (await this.client.request(
      'view/page',
      stripUndefined({ sessionId, limit: 100, ...opts }),
    )) as ViewPageResult;
  }

  async listSessions(opts: ListSessionsOptions = {}): Promise<SessionListResult> {
    return (await this.client.request(
      'session/list',
      stripUndefined({ limit: 50, ...opts }),
    )) as SessionListResult;
  }

  async resumeSession(sessionId: string, opts: ResumeSessionOptions = {}): Promise<SessionResumeResult> {
    return (await this.client.request(
      'session/resume',
      stripUndefined({ commandId: uuidv7(), sessionId, ...opts }),
    )) as SessionResumeResult;
  }

  async readSession(sessionId: string, excludeItems = true): Promise<SessionReadResult> {
    return (await this.client.request(
      'session/read',
      stripUndefined({ sessionId, excludeItems }),
    )) as SessionReadResult;
  }

  async listModels(sessionId?: string): Promise<ModelListResult> {
    return (await this.client.request(
      'model/list',
      stripUndefined({ sessionId }),
    )) as ModelListResult;
  }

  async setModel(sessionId: string, model: ModelSelection): Promise<SessionSetModelResult> {
    return (await this.client.request(
      'session/setModel',
      stripUndefined({ commandId: uuidv7(), sessionId, model }),
    )) as SessionSetModelResult;
  }

  async setApprovalMode(sessionId: string, mode: ApprovalMode): Promise<SessionSetApprovalModeResult> {
    return (await this.client.request(
      'session/setApprovalMode',
      stripUndefined({ commandId: uuidv7(), sessionId, mode }),
    )) as SessionSetApprovalModeResult;
  }

  async decideApproval(args: {
    sessionId: string;
    approvalId: string;
    choiceId: string;
    requirementId: ApprovalRequirementRef;
    feedback?: string | null;
  }): Promise<ApprovalDecideResult> {
    return (await this.client.request(
      'approval/decide',
      stripUndefined({ commandId: uuidv7(), ...args }),
    )) as ApprovalDecideResult;
  }

  async listPending(sessionId: string): Promise<ApprovalListPendingResult> {
    return (await this.client.request('approval/listPending', { sessionId })) as ApprovalListPendingResult;
  }

  async answerUserInput(
    sessionId: string,
    userInputId: string,
    answers: UserInputAnswer[],
  ): Promise<UserInputAnswerResult> {
    return (await this.client.request(
      'userInput/answer',
      stripUndefined({ commandId: uuidv7(), sessionId, userInputId, answers }),
    )) as UserInputAnswerResult;
  }

  async cancelUserInput(
    sessionId: string,
    userInputId: string,
    reason?: string,
  ): Promise<UserInputCancelResult> {
    return (await this.client.request(
      'userInput/cancel',
      stripUndefined({ commandId: uuidv7(), sessionId, userInputId, reason }),
    )) as UserInputCancelResult;
  }

  private emit(sessionId: string, method: string, params: unknown): void {
    for (const fn of this.sinks) {
      try {
        fn(sessionId, method, params);
      } catch {
        /* sink errors must not break dispatch */
      }
    }
  }

  private async dispatch(n: MspEvent): Promise<void> {
    const params = (n.params ?? {}) as Record<string, unknown>;
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
    if (n.method === 'view/gap' && sessionId !== '') {
      const { after, next } = params;
      this.emit(sessionId, n.method, params);
      if (typeof after === 'string' && typeof next === 'string') {
        const key = `${sessionId}|${after}|${next}`;
        if (!this.recoveredGaps.has(key)) {
          this.recoveredGaps.add(key);
          try {
            await this.client.request('view/subscribe', { sessionId, after });
            this.emit(sessionId, 'muse/resubscribed', { sessionId, after, next });
          } catch (e) {
            this.emit(sessionId, 'muse/resubscribeFailed', {
              sessionId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
      return;
    }
    this.emit(sessionId, n.method, params);
  }
}
