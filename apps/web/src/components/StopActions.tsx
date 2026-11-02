import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JobStatus, RouteView } from '@shibutz/contracts';
import type { Key } from '../i18n';
import { useLang } from '../lang';
import { knownKey, statusKey } from '../serverError';
import { Anchored } from './Anchored';

type Stop = RouteView['stops'][number];

interface Props {
  stop: Stop;
  /** The stops before this one, in order. */
  earlier: Stop[];
  /** Resolves once the server accepted the change and the data was reloaded; rejects with the refusal. */
  onStatus: (jobId: number, status: JobStatus, reason?: string) => Promise<void>;
  onEdit: (jobId: number) => void;
}

/** The stop's primary action (Start or Finish) and an overflow menu with Edit job, Unassign and Cancel job. Not optimistic: the server can refuse. */
export function StopActions({ stop, earlier, onStatus, onEdit }: Props): React.JSX.Element | null {
  const { t } = useLang();
  const [busy, setBusy] = useState<JobStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState<'unassigned' | 'cancelled' | null>(null);
  const [reason, setReason] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (menu) item.current?.focus();
  }, [menu]);
  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);

  const live = stop.status === 'assigned' || stop.status === 'in_progress';
  if (!live && stop.status !== 'done') return null; // a done stop keeps only Edit job, which shows it read-only
  const blocked: Key | null =
    stop.status !== 'assigned' ? null : earlier.some((s) => s.status === 'in_progress') ? 'blocked.busy' : earlier.some((s) => s.status !== 'done') ? 'blocked.order' : null;
  const whyId = `stop-${stop.jobId}-why`;
  const cancelling = confirming === 'cancelled';
  const next: JobStatus = stop.status === 'assigned' ? 'in_progress' : 'done';

  const run = async (to: JobStatus, why?: string): Promise<void> => {
    setBusy(to);
    setFailed(null);
    try {
      await onStatus(stop.jobId, to, why);
    } catch (e) {
      const known = knownKey(e);
      setFailed(known ? t(known) : t('error.action', { message: t(statusKey(e)) }));
    } finally {
      setBusy(null);
    }
  };
  const closeConfirm = (): void => {
    setConfirming(null);
    more.current?.focus();
  };
  const onDialogKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // only the topmost layer closes
      closeConfirm();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const all = [...(dialog.current?.querySelectorAll<HTMLElement>('textarea,button') ?? [])];
      const at = all.indexOf(document.activeElement as HTMLElement);
      all[(at + (e.shiftKey ? -1 : 1) + all.length) % all.length]?.focus();
    }
  };

  return (
    <div className="stop-actions">
      {live && <button
        aria-busy={busy === next || undefined}
        aria-disabled={blocked || busy ? true : undefined}
        aria-describedby={blocked ? whyId : undefined}
        onClick={() => !blocked && !busy && void run(next)}
      >
        {t(stop.status === 'assigned' ? 'action.start' : 'action.finish')}{busy === next && '…'}
      </button>}
      {blocked && <span id={whyId} className="muted">{t(blocked)}</span>}
      {(
        <span className="menu">
          <button ref={more} aria-haspopup="menu" aria-expanded={menu} aria-busy={busy === 'unassigned' || undefined} aria-label={t('action.more')} onClick={() => setMenu(!menu)}>
            <span aria-hidden="true">⋯</span>
          </button>
          {menu && (
            <Anchored
              trigger={more}
              role="menu"
              onClose={() => setMenu(false)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                e.preventDefault();
                const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
                const to = items.indexOf(document.activeElement as HTMLElement) + (e.key === 'ArrowDown' ? 1 : -1);
                items[(to + items.length) % items.length]?.focus();
              }}
            >
              <button ref={item} role="menuitem" onClick={() => { setMenu(false); onEdit(stop.jobId); }}>{t('job.edit')}</button>
              {stop.status === 'assigned' && (
                <button role="menuitem" onClick={() => { setMenu(false); setConfirming('unassigned'); }}>{t('action.unassign')}</button>
              )}
              {live && <button role="menuitem" onClick={() => { setMenu(false); setReason(''); setConfirming('cancelled'); }}>{t('action.cancelJob')}</button>}
            </Anchored>
          )}
        </span>
      )}
      {failed && <p role="alert" className="error">{failed}</p>}
      {confirming && createPortal(
        <div className="overlay">
          <div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={`confirm-${stop.jobId}-title`} className="dialog" onKeyDown={onDialogKey}>
            <h2 id={`confirm-${stop.jobId}-title`} dir="auto">{cancelling ? t('cancel.title', { title: stop.title }) : t('unassign.title', { title: stop.title })}</h2>
            <p>{cancelling ? t('cancel.body') : t('unassign.body')}</p>
            {cancelling && (
              <label>
                {t('cancel.reason')}
                <textarea dir="auto" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            )}
            <button ref={keep} onClick={closeConfirm}>{cancelling ? t('cancel.keep') : t('unassign.keep')}</button>{' '}
            <button ref={ok} onClick={() => { setConfirming(null); more.current?.focus(); void run(confirming, cancelling ? reason.trim() : undefined); }}>{cancelling ? t('cancel.ok') : t('unassign.ok')}</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
