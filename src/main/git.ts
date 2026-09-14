import { execFile } from 'node:child_process';
import { statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** One changed file from `git status --porcelain`. */
export interface GitFile {
  path: string;
  /** Staged (index) status letter, ' ' when clean, '?' when untracked. */
  staged: string;
  /** Unstaged (worktree) status letter. */
  unstaged: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  files: GitFile[];
}

/** Cap diff payloads so a huge generated file can't flood the renderer. */
const MAX_DIFF_BYTES = 100_000;
const MAX_PREVIEW_LINES = 200;

/**
 * Parse `git status --porcelain=v1 -b` output. The `##` header carries the
 * branch; every other line is `XY path` (`R` renames resolve to the new path).
 */
export function parsePorcelain(out: string): GitStatus {
  const files: GitFile[] = [];
  let branch: string | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('## ')) {
      const head = line.slice(3).split('...')[0];
      const m = /^No commits yet on (.+)$/.exec(head);
      branch = (m ? m[1] : head) || null;
      continue;
    }
    if (line.length < 4) continue;
    const staged = line[0];
    const unstaged = line[1];
    let filePath = line.slice(3);
    const arrow = filePath.indexOf(' -> ');
    if (arrow >= 0) filePath = filePath.slice(arrow + 4);
    if (!filePath) continue;
    files.push({ path: filePath, staged, unstaged });
  }
  return { isRepo: true, branch, files };
}

function validatedRoot(root: string): string {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error('git operations need an absolute workspace path');
  }
  let st;
  try {
    st = statSync(root);
  } catch {
    throw new Error(`workspace not found: ${root}`);
  }
  if (!st.isDirectory()) throw new Error(`not a directory: ${root}`);
  return root;
}

async function runGit(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      timeout: 15000,
      maxBuffer: MAX_DIFF_BYTES * 2,
    });
    return stdout;
  } catch (e) {
    const err = e as { code?: unknown; stderr?: unknown };
    // `git -C` outside a repo (or git missing) is a state, not a crash.
    if (err?.code !== 0 || typeof err?.stderr === 'string') {
      throw new Error(`git unavailable in ${root}`);
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/** Read-only status snapshot for a workspace root. Never writes. */
export async function gitStatus(root: string): Promise<GitStatus> {
  const dir = validatedRoot(root);
  try {
    return parsePorcelain(await runGit(dir, ['status', '--porcelain=v1', '-b']));
  } catch {
    return { isRepo: false, branch: null, files: [] };
  }
}

/**
 * Unified diff of one file against HEAD (staged + unstaged together), or the
 * whole tree when no path is given. Untracked files render as an all-add
 * preview. Output is byte-capped with a truncation marker.
 */
export async function gitDiff(root: string, filePath?: string): Promise<string> {
  const dir = validatedRoot(root);
  if (filePath !== undefined && (filePath.includes('\0') || path.isAbsolute(filePath))) {
    throw new Error('diff path must be repo-relative');
  }
  if (filePath) {
    const status = await gitStatus(dir);
    const entry = status.files.find((f) => f.path === filePath);
    if (entry && entry.staged === '?' && entry.unstaged === '?') {
      return previewUntracked(dir, filePath);
    }
  }
  const args = filePath
    ? ['diff', '--no-color', 'HEAD', '--', filePath]
    : ['diff', '--no-color', 'HEAD'];
  const out = await runGit(dir, args);
  return capDiff(out === '' ? '(no changes vs HEAD)\n' : out);
}

function previewUntracked(dir: string, filePath: string): string {
  const abs = path.join(dir, filePath);
  // Stay inside the repo: refuse escapes via `..` segments.
  if (path.relative(dir, abs).startsWith('..')) throw new Error('diff path escapes the repo');
  let text: string;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    return '(unreadable file — no preview)\n';
  }
  const lines = text.split('\n').slice(0, MAX_PREVIEW_LINES);
  const body = lines.map((l) => `+${l}`).join('\n');
  const clipped = text.split('\n').length > MAX_PREVIEW_LINES ? '\n… (preview clipped)' : '';
  return capDiff(`--- /dev/null\n+++ b/${filePath}\n${body}${clipped}\n`);
}

function capDiff(out: string): string {
  if (Buffer.byteLength(out, 'utf8') <= MAX_DIFF_BYTES) return out;
  return (
    Buffer.from(out, 'utf8').subarray(0, MAX_DIFF_BYTES).toString('utf8') +
    '\n… (diff clipped at 100 KB)\n'
  );
}
