import type { Session } from '../msp/msp';

/** One sidebar project: a working folder plus the sessions living in it. */
export interface ProjectGroup {
  /** Folder path, or '' for sessions without a workspace root. */
  id: string;
  folder: string | null;
  name: string;
  sessions: Session[];
}

export const DEFAULT_PROJECT_NAME = 'default folder';

export function projectName(folder: string | null): string {
  if (!folder) return DEFAULT_PROJECT_NAME;
  const parts = folder.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : folder;
}

function normalizeFolder(folder: string): string {
  return folder.replace(/\/+$/, '');
}

/**
 * Group sessions by workspace root, unioned with explicitly saved project
 * folders. Sorted by latest child activity (newest first); folders without
 * sessions sink to the bottom in saved order.
 */
export function groupSessions(sessions: Session[], savedFolders: string[]): ProjectGroup[] {
  const byFolder = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = s.workspaceRoot ? normalizeFolder(s.workspaceRoot) : '';
    const list = byFolder.get(key);
    if (list) list.push(s);
    else byFolder.set(key, [s]);
  }
  for (const f of savedFolders) {
    const key = normalizeFolder(f);
    if (!byFolder.has(key)) byFolder.set(key, []);
  }
  const groups: ProjectGroup[] = [...byFolder.entries()].map(([key, list]) => ({
    id: key,
    folder: key === '' ? null : key,
    name: projectName(key === '' ? null : key),
    sessions: list,
  }));
  const latest = (g: ProjectGroup): string =>
    g.sessions.reduce((m, s) => (s.updatedAt > m ? s.updatedAt : m), '');
  groups.sort((a, b) => {
    const la = latest(a);
    const lb = latest(b);
    if (la === '' || lb === '') {
      if (la === lb) return 0; // stable sort keeps saved order for empties
      return la === '' ? 1 : -1;
    }
    return lb.localeCompare(la); // ISO timestamps sort lexicographically
  });
  return groups;
}

export interface ProjectStore {
  folders: string[];
  collapsed: Record<string, boolean>;
  /** Normalized project ids hidden from the sidebar (sessions untouched). */
  hidden: string[];
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'musedesk.projects';

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isStore(v: unknown): v is ProjectStore {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.folders) &&
    o.folders.every((f) => typeof f === 'string' && f !== '') &&
    typeof o.collapsed === 'object' &&
    o.collapsed !== null &&
    Object.values(o.collapsed).every((c) => typeof c === 'boolean') &&
    (o.hidden === undefined ||
      (Array.isArray(o.hidden) && o.hidden.every((h) => typeof h === 'string')))
  );
}

export function loadProjects(store: StorageLike | null = defaultStorage()): ProjectStore {
  const fallback: ProjectStore = { folders: [], collapsed: {}, hidden: [] };
  if (!store) return fallback;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isStore(parsed)) return fallback;
    return {
      folders: [...parsed.folders],
      collapsed: { ...parsed.collapsed },
      hidden: [...(parsed.hidden ?? [])],
    };
  } catch {
    return fallback;
  }
}

export function saveProjects(
  state: ProjectStore,
  store: StorageLike | null = defaultStorage(),
): void {
  if (!store) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ folders: state.folders, collapsed: state.collapsed, hidden: state.hidden }),
    );
  } catch {
    /* storage unavailable */
  }
}
