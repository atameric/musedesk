/**
 * Sanitize the renderer's folder-dialog hint at the IPC boundary: only a
 * non-empty string reaches Electron's `defaultPath`, everything else falls
 * back to the dialog's own default location.
 */
export function dialogPathFor(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}
