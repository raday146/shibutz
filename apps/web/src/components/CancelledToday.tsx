import { useEffect, useState } from 'react';
import type { Cancellation } from '@shibutz/contracts';
import { fetchCancellations } from '../api';
import { useLang, withLtrNumbers } from '../lang';
import { time } from '../map';

interface Props {
  technicianId: number;
  date: string;
  /** Changes whenever the day was reloaded; refetches the list. */
  stamp: unknown;
}

/** Jobs cancelled from this technician's day, with reason and times. Renders nothing when there are none or the read fails. */
export function CancelledToday({ technicianId, date, stamp }: Props): React.JSX.Element | null {
  const { t } = useLang();
  const [rows, setRows] = useState<Cancellation[]>([]);
  useEffect(() => {
    let current = true;
    // ponytail: a failed read hides the list; the day's main error banner already covers a dead server.
    fetchCancellations(technicianId, date).then((r) => current && setRows(r), () => current && setRows([]));
    return () => { current = false; };
  }, [technicianId, date, stamp]);

  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="cancelled-title">
      <h3 id="cancelled-title">{t('cancelled.title')}</h3>
      <ul>
        {rows.map((c) => (
          <li key={c.jobId}>
            <b dir="auto">{c.title}</b>
            <span className="muted">
              {' · '}{withLtrNumbers(t('cancelled.at', { time: time(c.cancelledAt) }))}
              {c.actualArrival && <>{' · '}{withLtrNumbers(t('cancelled.arrived', { time: time(c.actualArrival) }))}</>}
            </span>
            {c.reason && <div className="muted" dir="auto">{t('cancelled.reason', { reason: c.reason })}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
