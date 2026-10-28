import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JobStatus, RouteView } from '@shibutz/contracts';
import type { Key } from '../i18n';
import { useLang } from '../lang';
import { Anchored } from './Anchored';

type Stop = RouteView['stops'][number];

/** The API's English refusals that have a localized text (docs/console-copy.md, Server messages). */
const KNOWN: Record<string, Key> = {
  'Only the first not-done stop of a route can be started': 'blocked.order',
  'Technician already has a stop in progress': 'blocked.busy',
  'Route changed concurrently; retry': 'error.stale',
  'Route changed since the suggestion': 'error.stale',
  'A stop that day has already started': 'plan.disabled',
};

interface Props {
  stop: Stop;
  /** The stops before this one, in order. */
  earlier: Stop[];
  /** Resolves once the server accepted the change and the data was reloaded; rejects with the refusal. */
  onStatus: (jobId: number, status: JobStatus, reason?: string) => Promise<void>;
}

/** The stop's primary action (Start or Finish) and an overflow menu with Unassign and Cancel job. Not optimistic: the server can refuse. */
export function StopActions({ stop, earlier, onStatus }: Props): React.JSX.Element | null {
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

  if (stop.status !== 'assigned' && stop.status !== 'in_progress') return null;
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
      const message = e instanceof Error ? e.message : String(e);
      const known = KNOWN[message];
      setFailed(e instanceof TypeError ? t('error.network') : known ? t(known) : t('error.action', { message }));
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
      <button
        aria-busy={busy === next || undefined}
        aria-disabled={blocked || busy ? true : undefined}
        aria-describedby={blocked ? whyId : undefined}
        onClick={() => !blocked && !busy && void run(next)}
      >
        {t(stop.status === 'assigned' ? 'action.start' : 'action.finish')}{busy === next && '…'}
      </button>
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
              {stop.status === 'assigned' && (
                <button ref={item} role="menuitem" onClick={() => { setMenu(false); setConfirming('unassigned'); }}>{t('action.unassign')}</button>
              )}
              <button ref={stop.status === 'assigned' ? undefined : item} role="menuitem" onClick={() => { setMenu(false); setReason(''); setConfirming('cancelled'); }}>{t('action.cancelJob')}</button>
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
