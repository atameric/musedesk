import React from 'react';

const SUGGESTIONS = [
  { title: 'Summarize this workspace', prompt: 'Summarize this workspace: what is it and where do I start?' },
  { title: 'Review recent changes', prompt: 'Review my recent changes and point out risks.' },
  { title: 'Explain a file', prompt: 'Explain what @src/main.ts does.' },
];

export function Suggestions({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="suggestions">
      {SUGGESTIONS.map((s) => (
        <button key={s.title} className="sugg-card" onClick={() => onPick(s.prompt)}>
          <span className="sugg-title">{s.title}</span>
          <span className="sugg-prompt">{s.prompt}</span>
        </button>
      ))}
    </div>
  );
}
