/** Unified-diff line class for renderer coloring. */
export type DiffLineClass = 'hunk' | 'add' | 'del' | 'ctx';

export function classifyDiffLine(line: string): DiffLineClass {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

/** Added/removed line counts from unified-diff text (headers excluded). */
export function countDiffLines(diff: string): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const line of diff.split('\n')) {
    const cls = classifyDiffLine(line);
    if (cls === 'add') add += 1;
    else if (cls === 'del') del += 1;
  }
  return { add, del };
}
