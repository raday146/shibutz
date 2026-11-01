import { useEffect, useRef, useState } from 'react';
import type { JobStatus, RouteView, Skill, Technician } from '@shibutz/contracts';
import { Ltr, useLang, withLtrNumbers } from '../lang';
import { DayEnd } from './DayEnd';
import { jerusalemToIso, routeVar, skillLabel, time } from '../map';
import { CancelledToday } from './CancelledToday';
import { StopActions } from './StopActions';
import { NoteField } from './NoteField';
import { RegionError, Skeleton } from './Feedback';

interface Props {
  technician: Technician;
  /** Undefined when the technician has no stops that day. */
  route: RouteView | undefined;
  date: string;
  skills: Skill[];
  /** Set when a map marker was clicked: that stop's row opens. A new object each click. */
  link: { jobId: number } | null;
  /** Opened from the keyboard: no animation. */
  instant: boolean;
  /** The day's data is loading: stops show as a skeleton. */
  pending: boolean;
  /** The route could not be loaded (already localized). */
  error: string | null;
  onRetry: () => void;
  onLink: (jobId: number) => void;
  /** Records day progress; resolves once the data is reloaded, rejects with the server's refusal. */
  onStatus: (jobId: number, status: JobStatus, reason?: string) => Promise<void>;
  onEdit: (jobId: number) => void;
  /** A note was saved: the route view must reflect it, since it outlives this drawer. */
  onNoted: (jobId: number, hasNote: boolean) => void;
  /** Changes whenever the day's data was reloaded, so the cancelled list refetches. */
  stamp: unknown;
  onClose: () => void;
  /** An incident was added or reviewed. */
  onDayChanged: () => void;
}

const GLYPH: Record<JobStatus, string> = { unassigned: '', assigned: '○', in_progress: '●', done: '✓', cancelled: '✕' };
const minutes = (s: number): number => Math.round(s / 60);

/** The work-day drawer: summary header and a timeline of stops that expand for detail. */
export function Drawer({ technician, route, date, skills, link, instant, pending, error, onRetry, onLink, onStatus, onEdit, onNoted, stamp, onClose, onDayChanged }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const heading = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  // A pointer close fades out first; the keyboard (Escape, Enter on Close) closes at once.
  const [leaving, setLeaving] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(closing.current), []);
  const stops = route?.stops ?? [];
  const summary = route?.summary;

  useEffect(() => heading.current?.focus(), []);
  // A stop that leaves the route sends focus to the heading; Finish unmounts its own button, so focus stays on the stop's row.
  const refocus = (id: number, to: JobStatus): void => {
    if (to === 'unassigned' || to === 'cancelled') heading.current?.focus();
    if (to === 'done') document.querySelector<HTMLElement>(`#stop-${id} > button`)?.focus();
  };
  useEffect(() => {
    if (!link) return;
    setOpen((o) => new Set(o).add(link.jobId));
    document.getElementById(`stop-${link.jobId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [link]);
  // Escape closes the drawer unless a dialog is above it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog],[role=alertdialog]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finish = summary?.expectedFinish ?? null;
  const late = finish ? Math.ceil((Date.parse(finish) - Date.parse(jerusalemToIso(date, technician.shiftEnd.slice(0, 5)))) / 60_000) : 0;
  const toggle = (jobId: number): void => {
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(jobId)) next.add(jobId);
      return next;
    });
    onLink(jobId);
  };

  return (
    <aside className={[instant ? 'drawer' : 'drawer animate', leaving && 'leaving'].filter(Boolean).join(' ')} aria-label={technician.name} style={{ '--c': routeVar(technician.color) } as React.CSSProperties}>
      <header>
        <h2 ref={heading} tabIndex={-1} dir="auto">{technician.name}</h2>
        <button onClick={(e) => { if (e.detail === 0) onClose(); else { setLeaving(true); closing.current = setTimeout(onClose, 140); } }}>{t('drawer.close')}</button>
      </header>
      <p className="muted">
        {withLtrNumbers(t('drawer.shift', { start: technician.shiftStart.slice(0, 5), end: technician.shiftEnd.slice(0, 5) }))}
        {' · '}{skillLabel(technician.skillIds, skills, lang) || t('tech.noSkills')}
      </p>
      {pending ? (
        <Skeleton rows={3} />
      ) : error ? (
        <RegionError message={error} onRetry={onRetry} />
      ) : stops.length === 0 ? (
        <p className="muted">{t('drawer.empty')}</p>
      ) : (
        <>
          <p>
            {withLtrNumbers(t('tech.progress', { done: summary?.doneCount ?? 0, total: stops.length }))}{' · '}
            {t('kpi.drive')} {withLtrNumbers(t('duration.min', { n: minutes(summary?.driveS ?? 0) }))}
          </p>
          {finish && (
            <p>
              {withLtrNumbers(t('drawer.finish', { time: time(finish) }))}
              {late > 0 && <span className="late"> · {withLtrNumbers(t('drawer.late', { n: late }))}</span>}
            </p>
          )}
          <ol aria-label={t('drawer.stops')} className="timeline">
            {stops.map((s, i) => {
              const expanded = open.has(s.jobId);
              return (
                <li key={s.jobId} id={`stop-${s.jobId}`}>
                  <button aria-expanded={expanded} aria-controls={`stop-${s.jobId}-detail`} onClick={() => toggle(s.jobId)}>
                    <span className="stop-no" aria-hidden="true">{i + 1}</span>
                    <Ltr>{time(s.eta)}</Ltr>
                    <b dir="auto">{s.title}</b>
                    {s.hasNote && <span role="img" aria-label={t('note.has')}>✎</span>}
                    <span className={`pill ${s.status}`}><span aria-hidden="true">{GLYPH[s.status]} </span>{t(`status.${s.status}`)}</span>
                  </button>
                  {expanded && (
                    <div id={`stop-${s.jobId}-detail`} className="detail">
                      <p dir="auto">{s.address || t('job.noAddress')}</p>
                      <p>{skillLabel(s.skillIds, skills, lang)}</p>
                      <p className="muted">{withLtrNumbers(t('stop.duration', { n: minutes(s.serviceDurationS) }))}{' · '}{withLtrNumbers(t('stop.drive', { n: minutes(s.driveS) }))}</p>
                      <StopActions stop={s} earlier={stops.slice(0, i)} onEdit={onEdit} onStatus={async (id, to, reason) => { await onStatus(id, to, reason); refocus(id, to); }} />
                      <NoteField jobId={s.jobId} hasNote={s.hasNote} date={date} onSaved={onNoted} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <CancelledToday technicianId={technician.id} date={date} stamp={stamp} />
      <DayEnd technicianId={technician.id} date={date} stops={stops} onChanged={onDayChanged} />
    </aside>
  );
}
