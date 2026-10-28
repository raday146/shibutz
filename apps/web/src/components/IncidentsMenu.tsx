import { useEffect, useRef, useState } from 'react';
import type { DaySummary, Incident, Technician } from '@shibutz/contracts';
import { fetchOpenIncidents, reviewIncident } from '../api';
import { Ltr, useLang } from '../lang';
import { Anchored } from './Anchored';

interface Props {
  /** A new day summary means incidents may have changed (added or reviewed in a drawer): refetch. */
  summary: DaySummary | null;
  technicians: Technician[];
  /** `from` is the indicator, where focus returns when the drawer closes. */
  onGo: (incident: Incident, from: HTMLElement) => void;
  onReviewed: () => void;
}

/** Top-bar indicator with the open-incident count across all dates, and a short list grouped by date. */
export function IncidentsMenu({ summary, technicians, onGo, onReviewed }: Props): React.JSX.Element | null {
  const { t } = useLang();
  const [list, setList] = useState<Incident[] | null>(null);
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stale = false;
    fetchOpenIncidents().then((l) => !stale && setList(l), () => undefined); // no count is better than a wrong one
    return () => { stale = true; };
  }, [summary]);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!list) return null;
  const review = async (id: number): Promise<void> => {
    try {
      await reviewIncident(id);
      setList((l) => l && l.filter((i) => i.id !== id));
      setFailure(false);
      panel.current?.focus(); // the pressed button is gone; keep focus inside the list
      onReviewed();
    } catch {
      setFailure(true);
    }
  };
  const nameOf = (id: number): string => technicians.find((x) => x.id === id)?.name ?? '';
  const dates = [...new Set(list.map((i) => i.date))]; // the server sends newest date first

  return (
    <div
      ref={root}
      className="incidents-menu"
      // Tabbing to another control closes it. A null target (a click on a button Safari and Firefox on macOS leave unfocused, or the
      // browser chrome) does not: a press outside is handled by Anchored.
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (open && to && !root.current?.contains(to) && !panel.current?.contains(to)) setOpen(false);
      }}
    >
      <button ref={trigger} aria-expanded={open} aria-controls="incidents-panel" className={list.length ? 'attention' : undefined} onClick={() => setOpen(!open)}>
        {t('incidents.indicator')} <Ltr>{list.length > 0 && <span aria-hidden="true">▲ </span>}{list.length}</Ltr>
      </button>
      {open && (
        <Anchored
          trigger={trigger}
          onClose={() => setOpen(false)}
          ref={panel}
          id="incidents-panel"
          role="dialog"
          aria-label={t('incidents.list.title')}
          tabIndex={-1}
          className="popover"
        >
          {list.length === 0 && <p className="muted">{t('incidents.list.empty')}</p>}
          {dates.map((d) => (
            <section key={d}>
              <h3><Ltr>{d}</Ltr></h3>
              <ul>
                {list.filter((i) => i.date === d).map((i) => (
                  <li key={i.id}>
                    <button className="entry" onClick={() => { setOpen(false); onGo(i, trigger.current as HTMLElement); }}>
                      <b>{nameOf(i.technicianId)}</b> <span dir="auto" className="excerpt">{i.body}</span>
                    </button>
                    <button aria-label={t('incidents.list.mark', { text: i.body })} onClick={() => void review(i.id)}>{t('incident.mark')}</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {failure && <p role="alert" className="error">{t('error.network')}</p>}
        </Anchored>
      )}
    </div>
  );
}
