import React from 'react';
import { filterCommands, type PaletteCommand } from '../shared/palette';

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [index, setIndex] = React.useState(0);
  const results = React.useMemo(() => filterCommands(commands, query), [commands, query]);
  const selected = results.length === 0 ? 0 : Math.min(index, results.length - 1);

  const runSelected = () => {
    const cmd = results[selected];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          placeholder="Type a command or search sessions…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) =>
                results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
              );
            } else if (e.key === 'Enter') runSelected();
          }}
        />
        <div className="palette-list">
          {results.length === 0 && <div className="side-note">No matching commands.</div>}
          {results.slice(0, 12).map((c, i) => (
            <button
              key={c.id}
              className={`palette-item${i === selected ? ' selected' : ''}`}
              onClick={() => {
                onClose();
                c.run();
              }}
              onMouseEnter={() => setIndex(i)}
            >
              <span className="palette-title">{c.title}</span>
              {c.detail && <span className="palette-detail">{c.detail}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
