type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
function storage(): StorageLike | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }

export function shortCliVersion(raw: string | null | undefined): string {
  if (!raw) return '';
  const match = /Muse Code\s+([^\s(]+)/.exec(raw);
  return match ? 'Muse Code ' + match[1] : raw.split(' (')[0];
}

export function likeKey(sessionId: string, responseId: string): string {
  return JSON.stringify([sessionId, responseId]);
}
export function loadLikes(store: StorageLike | null = storage()): string[] {
  try {
    const raw: unknown = JSON.parse(store?.getItem('musedesk.likes') ?? '[]');
    return Array.isArray(raw) && raw.every((key) => typeof key === 'string') ? raw.slice(-1000) : [];
  } catch { return []; }
}
export function saveLikes(likes: string[], store: StorageLike | null = storage()): void {
  try { store?.setItem('musedesk.likes', JSON.stringify([...new Set(likes)].slice(-1000))); } catch { /* storage unavailable */ }
}
export function dayLabel(iso: string, now = new Date()): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, now)) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
