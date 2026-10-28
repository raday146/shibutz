import { useEffect, useRef } from 'react';
import type { InsertionOption, InsertionSuggestions, Technician } from '@shibutz/contracts';
import { useLang, withLtrNumbers } from '../lang';
import { routeVar, time } from '../map';

export interface Props {
  suggestions: InsertionSuggestions;
  notice: string;
  busy: boolean;
  technicians: Technician[];
  /** Title of a job by id. */
  titleOf: (id: number) => string;
  previewed: InsertionOption | null;
  onPreview: (option: InsertionOption) => void;
  onChoose: (option: InsertionOption) => void;
  onClose: () => void;
}

/** The best insertion options of one unassigned job, shown inside its row. Hover or focus previews, "Assign here" commits. */
export function SlotOptions({ suggestions, notice, busy, technicians, titleOf, previewed, onPreview, onChoose, onClose }: Props): React.JSX.Element {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  // Opening the options brings the row to the top of the list (DESIGN.md).
  useEffect(() => {
    ref.current?.closest('li')?.scrollIntoView?.({ block: 'start' });
  }, []);
  // A touch tap gets a hover before the click, so remember whether this option was already previewed when the finger went down.
  const touch = useRef<{ fresh: boolean } | null>(null);
  const tech = (id: number): Technician | undefined => technicians.find((x) => x.id === id);
  // null neighbours are the technician's home
  const side = (id: number | null): string => (id === null ? t('slot.home') : titleOf(id));
  return (
    <div ref={ref} aria-live="polite">
      <h3>{t('slot.title')}</h3>
      {notice && <p className="error" role="alert">{notice}</p>}
      {suggestions.options.length === 0 && <p>{t('slot.none')}</p>}
      <ol className="options" aria-label={t('slot.title')}>
        {suggestions.options.map((o) => {
          const owner = tech(o.technicianId);
          return (
            <li
              key={`${o.technicianId}-${o.position.afterJobId}-${o.position.beforeJobId}`}
              className={previewed === o ? 'option on' : 'option'}
              onMouseEnter={() => onPreview(o)}
              onFocus={() => onPreview(o)}
            >
              <span className="swatch" style={{ background: routeVar(owner?.color ?? 1) }} aria-hidden="true" />
              <b dir="auto">{owner?.name ?? `#${o.technicianId}`}</b>: {t('slot.position', { prev: side(o.position.afterJobId), next: side(o.position.beforeJobId) })},{' '}
              {withLtrNumbers(t('slot.detour', { n: Math.round(o.detourS / 60) }))}
              <div className="muted">{withLtrNumbers(o.etas.map((e) => `${titleOf(e.jobId)}: ${t('slot.eta', { time: time(e.eta) })}`).join(' → '))}</div>
              <button
                disabled={busy}
                onPointerDown={(e) => { touch.current = e.pointerType === 'touch' ? { fresh: previewed !== o } : null; }}
                onClick={() => {
                  if (touch.current?.fresh) onPreview(o); // first tap on touch only previews
                  else onChoose(o);
                  touch.current = null;
                }}
              >
                {t('slot.pick')}
              </button>
            </li>
          );
        })}
      </ol>
      {suggestions.options.length === 0 && (
        <ul>
          {suggestions.rejections.map((r) => (
            <li key={r.technicianId}>
              <span dir="auto">{tech(r.technicianId)?.name ?? `#${r.technicianId}`}</span>: {t(`slot.rejection.${r.reason}`)}
            </li>
          ))}
        </ul>
      )}
      <button onClick={onClose}>{t('slot.close')}</button>
    </div>
  );
}
