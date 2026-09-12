import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface HostPrefs {
  fullAccess: boolean;
}

/** `muse serve` argv tail for the requested posture (sandbox is host-wide). */
export function serveArgsFor(fullAccess: boolean): string[] {
  return fullAccess ? ['--disable-sandbox'] : [];
}

function prefsPath(dir: string): string {
  return path.join(dir, 'musedesk-prefs.json');
}

/** Best-effort load: missing/corrupt prefs mean locked-down defaults. */
export function loadPrefs(dir: string): HostPrefs {
  try {
    const raw: unknown = JSON.parse(readFileSync(prefsPath(dir), 'utf8'));
    const fullAccess = (raw as { fullAccess?: unknown } | null)?.fullAccess === true;
    return { fullAccess };
  } catch {
    return { fullAccess: false };
  }
}

export function savePrefs(dir: string, prefs: HostPrefs): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(prefsPath(dir), JSON.stringify(prefs, null, 2));
}
