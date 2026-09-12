/**
 * Error display helpers (pure, renderer-safe).
 *
 * MSP failures arrive as `MSP {"code":…,"message":…,"data":{"kind":…}}`,
 * wrapped by Electron IPC in `Error invoking remote method '…': Error: …`.
 * `humanizeError` unwraps both and maps known wire kinds to actionable
 * sentences. Unknown shapes pass through (prefix stripped).
 */

interface MspWireError {
  code?: number;
  message?: string;
  data?: { kind?: string; sessionId?: string };
}

function parseMspError(text: string): MspWireError | null {
  const m = /^MSP (\{.*)/s.exec(text);
  if (!m) return null;
  try {
    const o: unknown = JSON.parse(m[1]);
    if (o && typeof o === 'object') return o as MspWireError;
  } catch {
    /* truncated payload — fall through to regex salvage */
  }
  const kind = /"kind"\s*:\s*"([^"]+)"/.exec(text)?.[1];
  const message = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1];
  if (kind ?? message) return { message, data: kind ? { kind } : undefined };
  return null;
}

export function humanizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const stripped = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
  const msp = parseMspError(stripped);
  if (!msp) return stripped;
  switch (msp.data?.kind) {
    case 'sessionInUse':
      return 'This session is already open in another window (e.g. the terminal). Pick another session or start a new chat.';
    case 'sessionNotFound':
      return 'That session no longer exists. Pick another session or start a new chat.';
    case 'approvalRequirementStale':
      return 'That approval already moved to a new step. Refresh and decide again.';
    case 'approvalAlreadyResolved':
      return 'That approval was already decided in another window.';
    case 'userInputAlreadySettled':
      return 'That prompt was already answered in another window.';
    default:
      break;
  }
  if (msp.message) return msp.data?.kind ? `${msp.data.kind}: ${msp.message}` : msp.message;
  return stripped;
}
