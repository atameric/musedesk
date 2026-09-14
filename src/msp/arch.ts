import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** CPU slices a `muse` CLI binary was built for ('unknown' when undetectable). */
export type CliArchKind = 'arm64' | 'x86_64' | 'universal' | 'unknown';

export interface ExecResult {
  status: number | null;
  stdout: string;
}

/** Test seam: runs a probe command, null when the tool is missing. */
export type ExecFn = (cmd: string, args: string[]) => ExecResult | null;

function defaultExec(cmd: string, args: string[]): ExecResult | null {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10000 });
    return { status: r.status, stdout: r.stdout || '' };
  } catch {
    return null;
  }
}

function parseLipo(out: string): CliArchKind | null {
  const archs = out.trim().split(/\s+/).filter(Boolean);
  if (archs.length === 0) return null;
  const hasArm = archs.includes('arm64');
  const hasX64 = archs.includes('x86_64');
  if (hasArm && hasX64) return 'universal';
  if (hasArm) return 'arm64';
  if (hasX64) return 'x86_64';
  return null;
}

function parseFile(out: string): CliArchKind | null {
  const lower = out.toLowerCase();
  if (!lower.includes('mach-o')) return null;
  const hasArm = lower.includes('arm64');
  const hasX64 = lower.includes('x86_64') || lower.includes('x86-64');
  if (hasArm && hasX64) return 'universal';
  if (hasArm) return 'arm64';
  if (hasX64) return 'x86_64';
  return null;
}

function probeMachO(file: string, exec: ExecFn): CliArchKind {
  const lipo = exec('lipo', ['-archs', file]);
  if (lipo && lipo.status === 0) {
    const kind = parseLipo(lipo.stdout);
    if (kind) return kind;
  }
  const info = exec('file', ['-b', file]);
  if (info && info.status === 0) {
    const kind = parseFile(info.stdout);
    if (kind) return kind;
  }
  return 'unknown';
}

function isScript(file: string): boolean {
  try {
    return readFileSync(file, 'utf8').slice(0, 2) === '#!';
  } catch {
    return false;
  }
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Same version gate the launcher applies before trusting its state file. */
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+-R[0-9]+(\.[0-9]+)?$/;

/**
 * Resolve the payload behind the `muse` launcher script: the sibling
 * `muse-bin-<version>` named by `.muse-version`. Falls back to every
 * `muse-bin-*` sibling when the state file is missing or untrusted.
 */
function resolvePayloads(binPath: string): string[] {
  const dir = path.dirname(binPath);
  try {
    const version = readFileSync(path.join(dir, '.muse-version'), 'utf8').trim().split('\n')[0].trim();
    if (VERSION_PATTERN.test(version)) {
      const target = path.join(dir, `muse-bin-${version}`);
      if (isFile(target) && !isScript(target)) return [target];
    }
  } catch {
    /* fall through to the sibling scan */
  }
  try {
    return readdirSync(dir)
      .filter((n) => n.startsWith('muse-bin-'))
      .map((n) => path.join(dir, n))
      .filter((f) => isFile(f) && !isScript(f));
  } catch {
    return [];
  }
}

/**
 * Best-effort architecture probe for the `muse` entry point.
 *
 * The official installer fronts the real binary with a launcher script, so a
 * script resolves to its `muse-bin-*` payload (the binary macOS would run —
 * under Rosetta when it is Intel-only). Never throws: 'unknown' covers
 * non-macOS platforms, missing probe tools, and unrecognized layouts.
 */
export function probeCliArch(
  binPath: string,
  opts?: { platform?: NodeJS.Platform; exec?: ExecFn },
): CliArchKind {
  if ((opts?.platform ?? process.platform) !== 'darwin') return 'unknown';
  const exec = opts?.exec ?? defaultExec;
  try {
    if (!isFile(binPath)) return 'unknown';
    if (!isScript(binPath)) return probeMachO(binPath, exec);
    let found: CliArchKind = 'unknown';
    for (const payload of resolvePayloads(binPath)) {
      const kind = probeMachO(payload, exec);
      // Any Intel-only payload can trigger the macOS deprecation warning
      // attributed to this app, so it wins over newer native siblings.
      if (kind === 'x86_64') return 'x86_64';
      if (found === 'unknown') found = kind;
      else if (found !== kind) found = 'universal';
    }
    return found;
  } catch {
    return 'unknown';
  }
}
