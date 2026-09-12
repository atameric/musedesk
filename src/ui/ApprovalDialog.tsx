import React from 'react';
import type { ApprovalChoice, ApprovalRequestParams, ApprovalSubject } from '../msp/msp';
import { humanizeError } from '../shared/errors';

function subjectLines(subject: ApprovalSubject): string[] {
  const lines = [`type: ${subject.kind}`];
  if (subject.command) lines.push(`command: ${subject.command}`);
  if (subject.path) lines.push(`path: ${subject.path}`);
  if (subject.origin?.url) lines.push(`url: ${subject.origin.url}`);
  if (subject.host) lines.push(`host: ${subject.host}${subject.port ? `:${subject.port}` : ''}`);
  if (subject.target) lines.push(`target: ${subject.target}`);
  if (subject.toolName) lines.push(`tool: ${subject.toolName}`);
  if (subject.access) lines.push(`access: ${subject.access}`);
  if (subject.workspaceRoot) lines.push(`workspace: ${subject.workspaceRoot}`);
  return lines;
}

interface ApprovalDialogProps {
  request: ApprovalRequestParams;
  queueCount: number;
  onDecide: (choiceId: string, feedback?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function ApprovalDialog({ request, queueCount, onDecide, onRefresh }: ApprovalDialogProps) {
  const [selected, setSelected] = React.useState<ApprovalChoice | null>(null);
  const [feedback, setFeedback] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // New requirement (multi-stage) resets the local pick.
  React.useEffect(() => {
    setSelected(null);
    setFeedback('');
    setError(null);
  }, [request.approvalId, request.currentRequirementId.sourceIndex]);

  const stage = request.subject.stages?.find(
    (s) => s.requirementId.sourceIndex === request.currentRequirementId.sourceIndex,
  );

  const decide = async (choice: ApprovalChoice, fb?: string) => {
    setBusy(true);
    setError(null);
    try {
      await onDecide(choice.choiceId, fb);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRefresh();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const clickChoice = (choice: ApprovalChoice) => {
    if (busy) return;
    if (choice.acceptsFeedback && selected?.choiceId !== choice.choiceId) {
      setSelected(choice);
      return;
    }
    void decide(choice, selected?.choiceId === choice.choiceId ? feedback || undefined : undefined);
  };

  return (
    <div className="overlay">
      <div className="dialog">
        <div className="dlg-head">
          <strong>Approval needed</strong>
          {queueCount > 1 && <span className="pill">+{queueCount - 1} more</span>}
        </div>
        <div className="dlg-tool">
          {request.toolName}
          {stage && (
            <span className="sess-meta">
              {' '}
              · step {stage.position + 1} of {stage.totalStages}
            </span>
          )}
        </div>
        <pre className="dlg-subject">{subjectLines(request.subject).join('\n')}</pre>
        {request.rawArgs !== '' && <code className="dlg-args">{request.rawArgs}</code>}
        {error && (
          <div className="banner error">
            {error}{' '}
            <button className="btn inline" disabled={busy} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        )}
        <div className="dlg-choices">
          {request.availableChoices.map((c) => (
            <div key={c.choiceId}>
              <button
                className={`btn choice${c.decision.startsWith('denied') ? ' danger' : ''}`}
                disabled={busy}
                onClick={() => clickChoice(c)}
              >
                {c.label}
                <span className="scope">{c.scope}</span>
              </button>
              {c.rulePreview && <div className="rule-preview">{c.rulePreview}</div>}
              {selected?.choiceId === c.choiceId && c.acceptsFeedback && (
                <div className="feedback-row">
                  <input
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback for the model (optional)"
                    disabled={busy}
                    maxLength={2000}
                  />
                  <button className="btn send" disabled={busy} onClick={() => void decide(c, feedback || undefined)}>
                    Confirm
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {request.availableChoices.length === 0 && (
          <div className="banner warn">No choices offered by the server.</div>
        )}
      </div>
    </div>
  );
}
