import React from 'react';
import { Dropdown } from './Primitives';
import { Icon } from './Icons';
export function OverflowMenu({ sessionId, busy, canResync, onResync, onRestart, onCopyId }: {
  sessionId: string | null; busy: boolean; canResync: boolean;
  onResync: () => void; onRestart: () => void; onCopyId: () => void;
}) {
  return <Dropdown label="More actions" className="btn icon" options={[
    { value: 'resync', label: 'Resync session', icon: 'refresh', disabled: !canResync },
    { value: 'restart', label: 'Restart host', icon: 'refresh', disabled: busy },
    ...(sessionId ? [{ value: 'copy', label: 'Copy session ID', description: sessionId, icon: 'copy' as const }] : []),
  ]} onChange={(value) => { if (value === 'resync') onResync(); else if (value === 'restart') onRestart(); else onCopyId(); }}>
    <Icon name="more" />
  </Dropdown>;
}
