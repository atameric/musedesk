import React from 'react';
import type { UserInputAnswer, UserInputQuestion, UserInputRequestParams } from '../msp/msp';
import { humanizeError } from '../shared/errors';

interface PerQuestion {
  selected: string[];
  freeText: string;
  note: string;
}

function emptyAnswers(questions: UserInputQuestion[]): Record<string, PerQuestion> {
  const out: Record<string, PerQuestion> = {};
  for (const q of questions) out[q.id] = { selected: [], freeText: '', note: '' };
  return out;
}

function validate(q: UserInputQuestion, a: PerQuestion): string | null {
  if (q.options.length === 0) {
    if (a.freeText.trim() === '') return 'an answer is required';
    if (a.freeText.length > 500) return 'answer must be ≤ 500 chars';
  } else if (q.selection.mode === 'single') {
    if (a.selected.length !== 1) return 'pick exactly one option';
  } else {
    const min = q.selection.minSelections ?? 1;
    const max = q.selection.maxSelections ?? q.options.length;
    if (a.selected.length < min || a.selected.length > max) {
      return `pick between ${min} and ${max} options`;
    }
  }
  if (a.note.length > 500) return 'note must be ≤ 500 chars';
  return null;
}

interface UserInputDialogProps {
  request: UserInputRequestParams;
  queueCount: number;
  onAnswer: (answers: UserInputAnswer[]) => Promise<void>;
  onCancel: () => Promise<void>;
}

export function UserInputDialog({ request, queueCount, onAnswer, onCancel }: UserInputDialogProps) {
  const [answers, setAnswers] = React.useState(() => emptyAnswers(request.questions));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAnswers(emptyAnswers(request.questions));
    setError(null);
  }, [request]);

  const patch = (id: string, p: Partial<PerQuestion>) =>
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const toggle = (q: UserInputQuestion, label: string) => {
    const cur = answers[q.id].selected;
    if (q.selection.mode === 'single') {
      patch(q.id, { selected: [label] });
    } else if (cur.includes(label)) {
      patch(q.id, { selected: cur.filter((l) => l !== label) });
    } else {
      patch(q.id, { selected: [...cur, label] });
    }
  };

  const problems = request.questions.map((q) => validate(q, answers[q.id] ?? { selected: [], freeText: '', note: '' }));
  const submittable = problems.every((p) => p === null);

  const submit = async () => {
    if (!submittable || busy) return;
    const payload: UserInputAnswer[] = request.questions.map((q) => {
      const a = answers[q.id];
      const base: UserInputAnswer = { questionId: q.id };
      if (q.options.length === 0) base.freeText = a.freeText;
      else if (q.selection.mode === 'single') base.selectedLabel = a.selected[0];
      else base.selectedLabels = a.selected;
      if (a.note.trim() !== '') base.note = a.note;
      return base;
    });
    setBusy(true);
    setError(null);
    try {
      await onAnswer(payload);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCancel();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <div className="dialog">
        <div className="dlg-head">
          <strong>Input needed · {request.toolName}</strong>
          {queueCount > 1 && <span className="pill">+{queueCount - 1} more</span>}
        </div>
        {error && <div className="banner error">{error}</div>}
        {request.questions.map((q, qi) => (
          <div key={q.id} className="q-block">
            <div className="q-head">
              <span className="q-header">{q.header}</span>
              <span className="q-text">{q.question}</span>
            </div>
            {q.options.length === 0 ? (
              <input
                value={answers[q.id]?.freeText ?? ''}
                onChange={(e) => patch(q.id, { freeText: e.target.value })}
                placeholder="Type your answer (≤ 500 chars)"
                disabled={busy}
                maxLength={500}
              />
            ) : (
              <div className="q-options">
                {q.options.map((o) => (
                  <label key={o.label} className="q-option">
                    <input
                      type={q.selection.mode === 'single' ? 'radio' : 'checkbox'}
                      name={q.id}
                      checked={(answers[q.id]?.selected ?? []).includes(o.label)}
                      onChange={() => toggle(q, o.label)}
                      disabled={busy}
                    />
                    <span>{o.label}</span>
                    {o.description && <span className="sess-meta">{o.description}</span>}
                  </label>
                ))}
              </div>
            )}
            <input
              className="q-note"
              value={answers[q.id]?.note ?? ''}
              onChange={(e) => patch(q.id, { note: e.target.value })}
              placeholder="Note for the model (optional, ≤ 500 chars)"
              disabled={busy}
              maxLength={500}
            />
            {problems[qi] && <div className="q-error">{problems[qi]}</div>}
          </div>
        ))}
        <div className="dlg-actions">
          <button className="btn" disabled={busy} onClick={() => void cancel()}>
            Cancel prompt
          </button>
          <button className="btn send" disabled={busy || !submittable} onClick={() => void submit()}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
