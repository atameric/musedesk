/** One command-palette row: a label plus the action it runs. */
export interface PaletteCommand {
  id: string;
  title: string;
  /** Secondary match text (folder, session meta). Never rendered alone. */
  detail?: string;
  run: () => void;
}

/** Case-insensitive substring filter over title + detail; stable order. */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...commands];
  return commands.filter((c) => `${c.title} ${c.detail ?? ''}`.toLowerCase().includes(q));
}
