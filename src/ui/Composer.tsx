import React from 'react';
import type { AttachmentDraft } from '../shared/bridge';
import { MAX_ATTACHMENTS } from '../shared/limits';

export interface PastedImage {
  name: string;
  mediaType: string;
  sizeBytes: number;
  dataUrl: string;
}

interface ComposerProps {
  running: boolean;
  disabled: boolean;
  draft: string;
  shots: AttachmentDraft[];
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onInterrupt: () => void;
  onPickImages: () => void;
  onPasteImages: (imgs: PastedImage[]) => void;
  onRemoveShot: (id: string) => void;
  onAttachError: (message: string) => void;
}

function readImageFiles(files: FileList | File[]): Promise<PastedImage[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  return Promise.all(
    list.map(
      (f) =>
        new Promise<PastedImage>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: f.name !== '' ? f.name : 'pasted-image.png',
              mediaType: f.type,
              sizeBytes: f.size,
              dataUrl: String(reader.result ?? ''),
            });
          reader.onerror = () => reject(new Error(`could not read ${f.name || 'pasted image'}`));
          reader.readAsDataURL(f);
        }),
    ),
  );
}

export function Composer({
  running,
  disabled,
  draft,
  shots,
  onDraftChange,
  onSend,
  onInterrupt,
  onPickImages,
  onPasteImages,
  onRemoveShot,
  onAttachError,
}: ComposerProps) {
  const send = () => {
    const trimmed = draft.trim();
    if ((trimmed === '' && shots.length === 0) || disabled) return;
    onSend(trimmed);
  };

  const ingest = (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return false;
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return false;
    readImageFiles(images)
      .then(onPasteImages)
      .catch((e: unknown) => onAttachError(e instanceof Error ? e.message : String(e)));
    return true;
  };

  const canSend = draft.trim() !== '' || shots.length > 0;

  return (
    <div
      className="composer"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!disabled) ingest(e.dataTransfer?.files);
      }}
    >
      <div className="attach-row">
        <button
          className="btn attach"
          onClick={onPickImages}
          disabled={disabled || shots.length >= MAX_ATTACHMENTS}
          title="Attach screenshots (png, jpeg, gif, webp — up to 5, 10 MB each)"
        >
          + Image
        </button>
        {shots.map((s) => (
          <span key={s.id} className="thumb" title={s.name}>
            <img src={s.dataUrl} alt={s.name} />
            <button onClick={() => onRemoveShot(s.id)} title={`Remove ${s.name}`}>
              ×
            </button>
          </span>
        ))}
        {shots.length === 0 && <span className="attach-hint">paste or drop screenshots</span>}
      </div>
      <div className="input-row">
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            if (!disabled && ingest(e.clipboardData?.files)) e.preventDefault();
          }}
          placeholder={running ? 'Type to queue a follow-up…' : 'Ask anything… (Enter to send)'}
          rows={3}
          disabled={disabled}
        />
        {running ? (
          <button className="btn stop" onClick={onInterrupt} disabled={disabled}>
            Stop
          </button>
        ) : (
          <button className="btn send" onClick={send} disabled={disabled || !canSend}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
