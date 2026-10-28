import { useEffect, useState } from 'react';
import type { Job, Skill } from '@shibutz/contracts';
import { useLang, withLtrNumbers } from '../lang';
import { skillLabel, time, toLatLng } from '../map';
import type { Point } from './MapView';
import { SlotOptions } from './SlotOptions';
import type { Props as SlotProps } from './SlotOptions';

interface Props {
  jobs: Job[];
  skills: Skill[];
  highlighted: number | null;
  busy: boolean;
  /** A failed slot search or assignment, shown at that job's row. */
  failure: { jobId: number; message: string } | null;
  onFocus: (at: Point) => void;
  onFind: (jobId: number) => void;
  /** The open options (for one job) with their handlers. */
  slot: Omit<SlotProps, 'busy'> | null;
}

export function UnassignedList({ jobs, skills, highlighted, busy, failure, onFocus, onFind, slot }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    document.getElementById(`job-${highlighted}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted]);
  if (jobs.length === 0) return <p className="muted">{t('unassigned.empty')}</p>;
  return (
    <ul aria-label={t('unassigned.title')}>
      {jobs.map((j) => (
        <li key={j.id} id={`job-${j.id}`} className={j.id === highlighted ? 'row on' : 'row'} aria-current={j.id === highlighted ? 'true' : undefined}>
          <button
            aria-expanded={open === j.id}
            onClick={() => {
              setOpen(open === j.id ? null : j.id);
              onFocus(toLatLng(j.location));
            }}
          >
            <b dir="auto">{j.title}</b>
          </button>
          <p className="muted">{t(j.unassignedReason ? `reason.${j.unassignedReason}` : 'reason.none')}</p>
          {open === j.id && (
            <div className="muted">
              <p dir="auto">{j.address || t('job.noAddress')}</p>
              <p>{withLtrNumbers(t('job.window', { start: time(j.windowStart), end: time(j.windowEnd) }))}</p>
              <p>{skillLabel(j.skillIds, skills, lang)}</p>
            </div>
          )}
          {slot?.suggestions.jobId === j.id ? (
            <SlotOptions {...slot} busy={busy} />
          ) : (
            <button disabled={busy} onClick={() => onFind(j.id)}>{t('slot.action')}</button>
          )}
          {failure?.jobId === j.id && <p role="alert" className="error">{failure.message}</p>}
        </li>
      ))}
    </ul>
  );
}
