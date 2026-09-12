import React from 'react';
import type { ApprovalMode, ModelListResult, ReasoningEffort, Session } from '../msp/msp';

const EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const MODES: ApprovalMode[] = ['allowAll', 'promptUnmatched', 'onRequest', 'denyUnmatched'];

interface ControlsBarProps {
  session: Session;
  models: ModelListResult | null;
  effort: ReasoningEffort;
  disabled: boolean;
  onModelChange: (modelId: string) => void;
  onEffortChange: (effort: ReasoningEffort) => void;
  onApprovalModeChange: (mode: ApprovalMode) => void;
}

export function ControlsBar({
  session,
  models,
  effort,
  disabled,
  onModelChange,
  onEffortChange,
  onApprovalModeChange,
}: ControlsBarProps) {
  const activeModel = models?.models.find((m) => m.isActive)?.modelId ?? session.modelId ?? '';
  const approvalMode = session.approvalMode?.mode ?? '';
  return (
    <div className="controls">
      <label className="ctl">
        Model
        <select
          value={activeModel}
          disabled={disabled || !models || models.models.length === 0}
          onChange={(e) => onModelChange(e.target.value)}
          title={models ? `catalog: ${models.source}` : 'loading models…'}
        >
          {activeModel === '' && <option value="">…</option>}
          {models?.models.map((m) => (
            <option key={`${m.providerId}/${m.modelId}`} value={m.modelId}>
              {m.displayLabel}
              {m.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="ctl">
        Effort
        <select
          value={effort}
          disabled={disabled}
          onChange={(e) => onEffortChange(e.target.value as ReasoningEffort)}
          title="Reasoning tier sampled for each turn you send"
        >
          {EFFORTS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="ctl">
        Approvals
        <select
          value={approvalMode}
          disabled={disabled}
          onChange={(e) => onApprovalModeChange(e.target.value as ApprovalMode)}
          title="Approval enforcement mode for this session"
        >
          {approvalMode === '' && <option value="">…</option>}
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
