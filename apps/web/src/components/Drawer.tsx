import { useEffect, useRef, useState } from 'react';
import type { JobStatus, RouteView, Skill, Technician } from '@shibutz/contracts';
import { Ltr, useLang, withLtrTimes } from '../lang';
import { jerusalemToIso, skillLabel, time } from '../map';

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
  onLink: (jobId: number) => void;
  onClose: () => void;
}

const GLYPH: Record<JobStatus, string> = { unassigned: '', assigned: '○', in_progress: '●', done: '✓', cancelled: '✕' };
const minutes = (s: number): number => Math.round(s / 60);

/** The work-day drawer: summary header and a timeline of stops that expand for detail. */
export function Drawer({ technician, route, date, skills, link, instant, onLink, onClose }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const heading = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const stops = route?.stops ?? [];
  const summary = route?.summary;

  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (!link) return;
    setOpen((o) => new Set(o).add(link.jobId));
    document.getElementById(`stop-${link.jobId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [link]);
  // Escape closes the drawer unless a dialog is above it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) onClose();
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
    <aside className={instant ? 'drawer' : 'drawer animate'} aria-label={technician.name}>
      <header>
        <h2 ref={heading} tabIndex={-1} dir="auto">{technician.name}</h2>
        <button onClick={onClose}>{t('drawer.close')}</button>
      </header>
      <p className="muted">
        {withLtrTimes(t('drawer.shift', { start: technician.shiftStart.slice(0, 5), end: technician.shiftEnd.slice(0, 5) }))}
        {' · '}{skillLabel(technician.skillIds, skills, lang) || t('tech.noSkills')}
      </p>
      {stops.length === 0 ? (
        <p className="muted">{t('drawer.empty')}</p>
      ) : (
        <>
          <p>
            <Ltr>{t('tech.progress', { done: summary?.doneCount ?? 0, total: stops.length })}</Ltr>{' · '}
            {t('kpi.drive')} <Ltr>{t('duration.min', { n: minutes(summary?.driveS ?? 0) })}</Ltr>
          </p>
          {finish && (
            <p>
              {withLtrTimes(t('drawer.finish', { time: time(finish) }))}
              {late > 0 && <span className="late"> · {t('drawer.late', { n: late })}</span>}
            </p>
          )}
          <ol aria-label={t('drawer.stops')} className="timeline">
            {stops.map((s) => {
              const expanded = open.has(s.jobId);
              return (
                <li key={s.jobId} id={`stop-${s.jobId}`}>
                  <button aria-expanded={expanded} aria-controls={`stop-${s.jobId}-detail`} onClick={() => toggle(s.jobId)}>
                    <Ltr>{time(s.eta)}</Ltr>
                    <b dir="auto">{s.title}</b>
                    {s.hasNote && <span role="img" aria-label={t('note.has')}>✎</span>}
                    <span className="muted"><span aria-hidden="true">{GLYPH[s.status]} </span>{t(`status.${s.status}`)}</span>
                  </button>
                  {expanded && (
                    <div id={`stop-${s.jobId}-detail`} className="detail">
                      <p dir="auto">{s.address || t('job.noAddress')}</p>
                      <p>{skillLabel(s.skillIds, skills, lang)}</p>
                      <p className="muted"><Ltr>{t('stop.duration', { n: minutes(s.serviceDurationS) })}</Ltr>{' · '}<Ltr>{t('stop.drive', { n: minutes(s.driveS) })}</Ltr></p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </aside>
  );
}
