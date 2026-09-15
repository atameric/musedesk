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
  // Client-side RPC timeout (host.ts): the host stopped answering mid-flight.
  // Not an MSP wire error, so it never reaches parseMspError below.
  const timedOut = /MSP request (\S+) timed out after \d+\s*ms/.exec(stripped);
  if (timedOut) {
    return (
      `The host stopped responding (${timedOut[1]} timed out). ` +
      'Try ⟳ Resync, or Restart host (Cmd+K) if it persists.'
    );
  }
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

/**
 * Turn failure classes that point at the host runtime rather than the turn
 * input (`configError` observed live as "invalid run configuration: MCP
 * startup audit failed; …" with retryable=false). Resending never clears
 * these — the host process must restart.
 */
const INFRA_TURN_KINDS: ReadonlySet<string> = new Set([
  'configError',
  'environmentError',
  'launchError',
]);

export function isInfraTurnError(kind: string): boolean {
  return INFRA_TURN_KINDS.has(kind);
}

/** Recovery guidance for infra turn failures; null when the kind is not infra. */
export function infraTurnErrorGuidance(kind: string): string | null {
  if (!isInfraTurnError(kind)) return null;
  return 'The session runtime is degraded (host-side configuration error). Restart the host, then send again.';
}
