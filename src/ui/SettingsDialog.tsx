import React from 'react';
import { Modal } from './Primitives';
import type { HostStatus } from '../shared/bridge';

interface SettingsDialogProps {
  status: HostStatus | null;
  lastFolder: string | null;
  busy: boolean;
  onToggleFullAccess: (next: boolean) => void;
  onPickFolder: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  status,
  lastFolder,
  busy,
  onToggleFullAccess,
  onPickFolder,
  onClose,
}: SettingsDialogProps) {
  const fullAccess = status?.fullAccess === true;
  return (
    <Modal title="Settings" onClose={onClose}>
        <div className="set-row">
          <span className="set-label">Full access</span>
          <span className="set-value">{fullAccess ? 'on — sandbox disabled' : 'off — sandboxed'}</span>
          <button
            className="btn small"
            disabled={busy}
            onClick={() => onToggleFullAccess(!fullAccess)}
            title="Full access runs every session without the shell sandbox. Only for work you trust."
          >
            {fullAccess ? 'Disable' : 'Enable'}
          </button>
        </div>
        <div className="set-row">
          <span className="set-label">Default folder</span>
          <span className="set-value" title={lastFolder ?? ''}>{lastFolder ?? '—'}</span>
          <button className="btn small" disabled={busy} onClick={onPickFolder}>
            Change…
          </button>
        </div>
        <div className="set-row">
          <span className="set-label">CLI</span>
          <span className="set-value">{status?.cliVersion ?? '—'}</span>
        </div>
        <div className="set-row">
          <span className="set-label">Protocol</span>
          <span className="set-value">
            {status?.fingerprint ? status.fingerprint.slice(0, 12) : '—'}
            {status?.fingerprintMatch === true ? ' · pinned' : ''}
          </span>
        </div>
        <div className="dlg-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
    </Modal>
  );
}
