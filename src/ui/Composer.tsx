import React from 'react';
import type { AttachmentDraft } from '../shared/bridge';
import { MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from '../shared/limits';
import type { ApprovalMode, ModelListResult, ReasoningEffort, Session } from '../msp/msp';
import { Icon } from './Icons';
import { Dropdown, IconButton } from './Primitives';

export interface PastedImage { name: string; mediaType: string; sizeBytes: number; dataUrl: string }
const EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const MODES: ApprovalMode[] = ['allowAll', 'promptUnmatched', 'onRequest', 'denyUnmatched'];
const MODE_LABELS = { allowAll: 'Allow all', promptUnmatched: 'Prompt new', onRequest: 'On request', denyUnmatched: 'Deny new' };
interface ComposerProps {
  running: boolean; disabled: boolean; sending: boolean; draft: string; shots: AttachmentDraft[];
  session: Session | null; models: ModelListResult | null; effort: ReasoningEffort;
  onDraftChange: (text: string) => void; onSend: (text: string) => void; onInterrupt: () => void;
  onPickImages: () => void; onPasteImages: (imgs: PastedImage[]) => void; onRemoveShot: (id: string) => void;
  onAttachError: (message: string) => void; onModelChange: (modelId: string, providerId?: string) => Promise<void>;
  onEffortChange: (effort: ReasoningEffort) => void; onApprovalModeChange: (mode: ApprovalMode) => Promise<void>;
}
export function Composer(props: ComposerProps) {
  const { running, disabled, sending, draft, shots, session, models, effort, onDraftChange, onSend, onInterrupt,
    onPickImages, onPasteImages, onRemoveShot, onAttachError, onModelChange, onEffortChange, onApprovalModeChange } = props;
  const textarea = React.useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [changing, setChanging] = React.useState(false);
  const sessionRef = React.useRef(session?.sessionId); sessionRef.current = session?.sessionId;
  React.useLayoutEffect(() => {
    const el = textarea.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = Math.min(220, Math.max(64, el.scrollHeight)) + 'px';
  }, [draft]);
  const active = models?.models.find((m) => m.isActive) ?? models?.models.find((m) => m.modelId === session?.modelId && m.providerId === session?.providerId);
  const efforts = Array.isArray(active?.variants) ? active.variants : EFFORTS;
  const unsupported = !efforts.includes(effort);
  const canSend = draft.trim() !== '' || shots.length > 0;
  const send = () => { if (canSend && !disabled && !sending && !changing && !unsupported) { onSend(draft.trim()); textarea.current?.focus(); } };
  const ingest = (files: FileList | undefined) => {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return false;
    if (shots.length + images.length > MAX_ATTACHMENTS) { onAttachError('Up to 5 images per message.'); return true; }
    if (images.some((file) => file.size > MAX_IMAGE_BYTES)) { onAttachError('Each image must be 10 MB or smaller.'); return true; }
    const owner = session?.sessionId;
    void Promise.all(images.map((file) => new Promise<PastedImage>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve({ name: file.name || 'pasted-image.png', mediaType: file.type, sizeBytes: file.size, dataUrl: String(reader.result ?? '') });
      reader.onerror = () => reject(new Error('Could not read ' + file.name)); reader.readAsDataURL(file);
    }))).then((images) => { if (owner === sessionRef.current) onPasteImages(images); else onAttachError('Chat changed while reading images. Please attach them again.'); }).catch((e: unknown) => onAttachError(e instanceof Error ? e.message : String(e)));
    return true;
  };
  const change = async (action: () => Promise<void>) => {
    if (changing) return; setChanging(true);
    try { await action(); } finally { setChanging(false); }
  };
  return <div className="composer-wrap">
    <div className={'composer' + (dragging ? ' dragging' : '')}
      onDragEnter={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) ingest(e.dataTransfer.files); }}>
      {shots.length > 0 && <div className="shots-row">{shots.map((shot) => <span key={shot.id} className="thumb" title={shot.name}>
        <img src={shot.dataUrl} alt={shot.name} /><IconButton icon="close" label={'Remove ' + shot.name} onClick={() => onRemoveShot(shot.id)} />
      </span>)}</div>}
      <textarea ref={textarea} value={draft} onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        onPaste={(e) => { if (!disabled && ingest(e.clipboardData.files)) e.preventDefault(); }}
        placeholder={sending ? 'Sending…' : running ? 'Type to queue a follow-up…' : 'Muse’a bir şey sor…'} rows={2} disabled={disabled} aria-label="Message Muse" />
      <div className="composer-bar">
        <Dropdown label="Add to message" className="btn icon" disabled={disabled || shots.length >= MAX_ATTACHMENTS}
          options={[{ value: 'image', label: 'Attach images', description: 'PNG, JPEG, GIF, WebP · 5 images · 10 MB each', icon: 'image' }]} onChange={onPickImages}><Icon name="plus" /></Dropdown>
        <IconButton icon="image" label="Attach images" onClick={onPickImages} disabled={disabled || shots.length >= MAX_ATTACHMENTS} />
        <span className="composer-sep" />
        <Dropdown label="Model" className="csel model-select" select disabled={disabled || changing || !models?.models.length}
          value={active ? JSON.stringify([active.providerId, active.modelId]) : undefined}
          options={models?.models.map((m) => ({ value: JSON.stringify([m.providerId, m.modelId]), label: m.displayLabel || m.modelId, description: m.providerId + (m.isDefault ? ' · default' : '') })) ?? []}
          onChange={(value) => { const [provider, model] = JSON.parse(value) as [string, string]; void change(() => onModelChange(model, provider)); }}>
          <span>{active?.modelId ?? session?.modelId ?? 'Choose model'}</span>
        </Dropdown>
        <span className="composer-sep" />
        <Dropdown label="Reasoning effort" className="csel effort-select" select value={effort} disabled={disabled || changing}
          options={efforts.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} onChange={(v) => onEffortChange(v as ReasoningEffort)}>
          {effort.charAt(0).toUpperCase() + effort.slice(1)}
        </Dropdown>
        <Dropdown label="Approval mode" className="csel approval-select" select value={session?.approvalMode?.mode} disabled={disabled || changing}
          options={MODES.map((v) => ({ value: v, label: MODE_LABELS[v] }))} onChange={(v) => void change(() => onApprovalModeChange(v as ApprovalMode))} />
        <span className="spacer" />
        {running && <IconButton icon="stop" label="Stop turn" className="stop" disabled={disabled} onClick={onInterrupt} />}
        <button className="btn send send-square" disabled={disabled || !canSend || sending || changing || unsupported} onClick={send}
          aria-label={running ? 'Queue follow-up' : 'Send message'} title={running ? 'Queue follow-up (Enter)' : 'Send (Enter)'}>
          {sending ? <span className="spinner" /> : <Icon name="arrowUp" size={20} />}
        </button>
      </div>
      {unsupported && <div className="composer-warning" role="status">This model does not support {effort}. Choose a supported reasoning effort.</div>}
    </div>
    <div className="composer-hint">{running ? 'Enter to queue' : 'Enter to send'} · Shift + Enter for new line</div>
  </div>;
}
