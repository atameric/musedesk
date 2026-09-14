import { spawnSync } from 'node:child_process';
import { statSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probeCliArch, type CliArchKind } from './arch';

export interface MuseInstall {
  binPath: string;
  version: string;
  /** CPU slices the CLI binary was built for ('unknown' when undetectable). */
  arch: CliArchKind;
}

function isExecutable(file: string): boolean {
  try {
    const st = statSync(file);
    return st.isFile() && (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Ask the user's login shell where `muse` resolves. Packaged GUI apps do
 * not inherit the shell PATH, so this is what finds user-local installs
 * (e.g. ~/.local/bin) at runtime. Best effort: null when unresolvable.
 */
export function resolveViaLoginShell(shell = process.env.SHELL || '/bin/zsh'): string | null {
  try {
    const r = spawnSync(shell, ['-l', '-c', 'command -v muse'], { encoding: 'utf8', timeout: 10000 });
    if (r.status !== 0) return null;
    const found = (r.stdout || '').trim().split('\n')[0]?.trim() ?? '';
    // `command -v` can print functions/aliases; only accept real executables.
    if (found !== '' && !found.includes('\n') && isExecutable(found)) return found;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Find the official `muse` CLI: explicit PATH first, then well-known
 * install locations, then the login shell's PATH. MuseDesk never bundles or
 * downloads a CLI binary; without a local install it refuses to start.
 */
export function discoverMusePath(envPath = process.env.PATH ?? ''): string {
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'muse');
    if (isExecutable(candidate)) return candidate;
  }
  const home = os.homedir();
  for (const candidate of [
    path.join(home, '.local', 'bin', 'muse'),
    '/opt/homebrew/bin/muse',
    '/usr/local/bin/muse',
  ]) {
    if (isExecutable(candidate)) return candidate;
  }
  const viaShell = resolveViaLoginShell();
  if (viaShell) return viaShell;
  throw new Error(
    'muse CLI not found on PATH. Install the official Muse Code CLI first; Muse will not bundle or fetch one.',
  );
}

export function getMuseVersion(binPath: string): string {
  const r = spawnSync(binPath, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) throw new Error(`muse --version failed: ${(r.stderr || '').slice(0, 300)}`);
  return (r.stdout || '').trim().split('\n')[0];
}

export function discoverMuse(): MuseInstall {
  const binPath = discoverMusePath();
  return { binPath, version: getMuseVersion(binPath), arch: probeCliArch(binPath) };
}

/** Pinned expectations generated from the CLI this build was verified against. */
export function readPinned(dir: string): { cliVersion: string; fingerprint: string } {
  return {
    cliVersion: readFileSync(path.join(dir, 'CLI_VERSION.txt'), 'utf8').trim(),
    fingerprint: readFileSync(path.join(dir, 'FINGERPRINT.txt'), 'utf8').trim(),
  };
}
