import { useEffect, useId, useRef, useState } from 'react';
import { fetchNote, saveNote } from '../api';
import { useLang, withLtrTimes } from '../lang';
import { time } from '../map';

interface Props {
  jobId: number;
  /** Whether a note is already stored; it is fetched when the field opens. */
  hasNote: boolean;
  /** The viewed date: changing it flushes a pending save. */
  date: string;
  onSaved: (jobId: number, hasNote: boolean) => void;
}

/** A job's note: saves on blur, and on close or date change; "Saving" only shows when a save takes over 400 ms. */
export function NoteField({ jobId, hasNote, date, onSaved }: Props): React.JSX.Element {
  const { t } = useLang();
  const id = useId();
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(!hasNote);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saved = useRef(''); // last text the server has
  const latest = useRef(''); // text now in the field

  useEffect(() => {
    if (!hasNote) return;
    fetchNote(jobId).then(
      (n) => {
        saved.current = latest.current = n.body;
        setText(n.body);
        setUpdatedAt(n.updatedAt);
        setLoaded(true);
      },
      () => setLoadFailed(true), // the field stays locked so an empty box can never overwrite the note
    );
  }, []); // fetched once when the field opens

  const save = async (): Promise<void> => {
    const body = latest.current;
    if (body === saved.current) return;
    const slow = setTimeout(() => setState('saving'), 400);
    try {
      const n = await saveNote(jobId, body);
      saved.current = body;
      setUpdatedAt(n.updatedAt);
      setState('saved');
      onSaved(jobId, body !== '');
    } catch {
      setState('error');
    } finally {
      clearTimeout(slow);
    }
  };

  // Cleanup runs on a date change and on unmount (drawer closed, row collapsed).
  // ponytail: a flush that fails after unmount is lost silently; the field is gone, so no retry can be offered.
  const flush = useRef(save);
  flush.current = save;
  useEffect(() => () => void flush.current(), [date]);

  const status = state === 'saving' ? t('note.saving') : state === 'saved' ? t('note.saved') : '';
  return (
    <div className="note">
      <label htmlFor={id}>{t('note.label')}</label>
      <textarea
        id={id}
        dir="auto"
        rows={3}
        value={text}
        disabled={!loaded}
        placeholder={t('note.placeholder')}
        aria-describedby={`${id}-status`}
        onChange={(e) => {
          latest.current = e.target.value;
          setText(e.target.value);
        }}
        onBlur={() => void save()}
      />
      <p id={`${id}-status`} role="status" className="muted">
        {[status, updatedAt && state !== 'saving' ? t('note.updated', { time: time(updatedAt) }) : ''].filter(Boolean).map((s, i) => (
          <span key={i}>{i > 0 && ' · '}{withLtrTimes(s)}</span>
        ))}
      </p>
      {(state === 'error' || loadFailed) && (
        <p role="alert" className="error">
          {loadFailed ? t('error.network') : t('note.error')}
          {state === 'error' && <> <button onClick={() => void save()}>{t('error.retry')}</button></>}
        </p>
      )}
    </div>
  );
}
