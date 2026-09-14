/** Unified-diff line class for renderer coloring. */
export type DiffLineClass = 'hunk' | 'add' | 'del' | 'ctx';

export function classifyDiffLine(line: string): DiffLineClass {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}
