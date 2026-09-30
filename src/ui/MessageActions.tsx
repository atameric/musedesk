import React from 'react';
import { copyText } from '../shared/clipboard';
import { likeKey, loadLikes, saveLikes } from '../shared/uiState';
import { IconButton } from './Primitives';

export function MessageActions({ text, sessionId, responseId }: { text: string; sessionId: string; responseId: string }) {
  const key = likeKey(sessionId, responseId);
  const [liked, setLiked] = React.useState(() => loadLikes().includes(key));
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <div className="message-actions">
    <IconButton icon={copyState === 'copied' ? 'check' : 'copy'} label={copyState === 'copied' ? 'Answer copied' : 'Copy answer'}
      onClick={() => void copyText(text).then((ok) => {
        setCopyState(ok ? 'copied' : 'failed');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopyState('idle'), 2000);
      })} />
    <IconButton icon="like" label={liked ? 'Remove like (this device only)' : 'Like answer (this device only)'}
      className={liked ? 'liked' : ''} aria-pressed={liked} onClick={() => {
        const next = !liked;
        const likes = loadLikes().filter((value) => value !== key);
        if (next) likes.push(key);
        saveLikes(likes);
        setLiked(next);
      }} />
    <span className="action-feedback" role="status">{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Could not copy. Select the text to copy it.' : ''}</span>
  </div>;
}
