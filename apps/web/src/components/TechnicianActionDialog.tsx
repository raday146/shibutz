import { useEffect, useRef } from 'react';
import type { Technician } from '@shibutz/contracts';
import { formatDay, pluralKey } from '../i18n';
import { useLang } from '../lang';
import { routeVar } from '../map';

interface Props {
  mode: 'deactivate' | 'reactivate';
  technician: Technician;
  /** Reactivate: the route color the technician will get. */
  color: number;
  busy: boolean;
  /** Deactivate refused: every date with unfinished stops. */
  blocked: string[] | null;
  failure: string | null;
  onConfirm: () => void;
  onClose: () => void;
  onOpenDay: (date: string) => void;
}

const DATES = '\u0001'; // where the date links go in the translated sentence

/** Confirms a deactivation (naming its consequences, or listing the dates that block it), or reviews a reactivation with its color. */
export function TechnicianActionDialog({ mode, technician, color, busy, blocked, failure, onConfirm, onClose, onOpenDay }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), [blocked]);
  const keys = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose();
    if (e.key !== 'Tab') return;
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [])];
    const [head, tail] = [items[0], items[items.length - 1]];
    if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail?.focus(); }
    else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head?.focus(); }
  };

  const sentence = blocked && t(pluralKey(lang, blocked.length, 'deactivate.blocked'), { name: technician.name, dates: DATES });
  const [before = '', after = ''] = sentence?.split(DATES) ?? [];
  const links = blocked && new Intl.ListFormat(lang, { type: 'conjunction' }).formatToParts(blocked.map((_, i) => String(i)));
  const title = mode === 'deactivate' ? t('deactivate.title', { name: technician.name }) : t('review.title.reactivate');
  const ok = mode === 'deactivate' ? 'deactivate.ok' : 'review.confirm.reactivate';

  return (
    <div className="overlay">
      <div ref={dialog} role={mode === 'deactivate' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="tech-action-title" className="dialog" onKeyDown={keys}>
        <h2 id="tech-action-title" dir="auto">{title}</h2>
        {blocked ? (
          <p dir="auto">
            {before}
            {links?.map((part, i) =>
              part.type === 'literal' ? part.value : (
                <a key={i} href={`#${blocked[Number(part.value)]}`} aria-label={t('deactivate.blocked.open', { date: formatDay(lang, blocked[Number(part.value)] ?? '') })} onClick={(e) => { e.preventDefault(); onOpenDay(blocked[Number(part.value)] ?? ''); }}>
                  {formatDay(lang, blocked[Number(part.value)] ?? '')}
                </a>
              ),
            )}
            {after}
          </p>
        ) : mode === 'deactivate' ? (
          <p dir="auto">{t('deactivate.body', { name: technician.name })}</p>
        ) : (
          <dl className="review">
            <dt>{t('tech.field.name')}</dt>
            <dd dir="auto">{technician.name}</dd>
            <dt>{t('review.color')}</dt>
            <dd><span className="swatch" style={{ background: routeVar(color) }} aria-hidden="true" /></dd>
          </dl>
        )}
        {failure && <p className="error" role="alert">{failure}</p>}
        {blocked ? (
          <button ref={first} onClick={onClose}>{t('modal.close')}</button>
        ) : (
          <>
            <button ref={first} onClick={onClose}>{t(mode === 'deactivate' ? 'deactivate.keep' : 'modal.close')}</button>{' '}
            <button onClick={onConfirm} disabled={busy}>{t(ok)}</button>
          </>
        )}
      </div>
    </div>
  );
}
