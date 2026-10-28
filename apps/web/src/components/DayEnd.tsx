import { useEffect, useRef, useState } from 'react';
import type { Incident, RouteView } from '@shibutz/contracts';
import { addIncident, fetchIncidents, fetchReport, reviewIncident, saveReport } from '../api';
import { Ltr, useLang } from '../lang';
import { time } from '../map';

interface Props {
  technicianId: number;
  date: string;
  stops: RouteView['stops'];
  /** An incident was added or reviewed: the day summary (badge, counts) is stale. */
  onChanged: () => void;
}

type Save = 'idle' | 'saving' | 'saved' | 'error';

/** The drawer's end-of-day summary (autosaves on blur, flushes when it goes away) and the day's incidents. */
export function DayEnd({ technicianId, date, stops, onChanged }: Props): React.JSX.Element {
  const { t } = useLang();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(''); // what the server has
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [save, setSave] = useState<Save>('idle');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [expanded, setExpanded] = useState<boolean | null>(null); // null follows the default rule
  const [draft, setDraft] = useState('');
  const [jobId, setJobId] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ text, saved });
  latest.current = { text, saved };

  useEffect(() => {
    let stale = false;
    setText('');
    setSaved('');
    setUpdatedAt(null);
    setSave('idle');
    setIncidents([]);
    setExpanded(null);
    setLoadFailed(false);
    Promise.all([fetchReport(technicianId, date), fetchIncidents(technicianId, date)]).then(
      ([report, list]) => {
        if (stale) return;
        setText(report?.body ?? '');
        setSaved(report?.body ?? '');
        setUpdatedAt(report?.updatedAt ?? null);
        setIncidents(list);
      },
      () => !stale && setLoadFailed(true),
    );
    return () => {
      stale = true;
      // Leaving (drawer closed, other day or technician) must not lose typed text.
      const { text: now, saved: before } = latest.current;
      if (now.trim() && now !== before) void saveReport(technicianId, date, now).catch(() => undefined);
    };
  }, [technicianId, date, attempt]);

  const autosave = async (): Promise<void> => {
    if (!text.trim() || text === saved) return;
    // "Saving" shows only when the save is slow, so quick saves do not flicker.
    const slow = setTimeout(() => setSave('saving'), 400);
    try {
      const report = await saveReport(technicianId, date, text);
      setSaved(text);
      setUpdatedAt(report.updatedAt);
      setSave('saved');
      setTimeout(() => setSave((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch {
      setSave('error');
    } finally {
      clearTimeout(slow);
    }
  };

  const add = async (): Promise<void> => {
    try {
      const incident = await addIncident(technicianId, date, { body: draft, jobId: jobId ? Number(jobId) : null });
      setIncidents((list) => [...list, incident]);
      setDraft('');
      setJobId('');
      setFailure(null);
      onChanged();
    } catch (e) {
      setFailure(t('error.action', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  const review = async (id: number): Promise<void> => {
    try {
      const done = await reviewIncident(id);
      setIncidents((list) => list.map((i) => (i.id === id ? done : i)));
      setFailure(null);
      onChanged();
    } catch (e) {
      setFailure(t('error.action', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  const open = expanded ?? ((stops.length > 0 && stops.every((s) => s.status === 'done')) || incidents.length > 0);
  const titleOf = (id: number): string => stops.find((s) => s.jobId === id)?.title ?? t('job.ref', { id });
  return (
    <section className="dayend">
      <h3>
        <button aria-expanded={open} aria-controls="dayend-body" onClick={() => setExpanded(!open)}>
          <span aria-hidden="true" className="mirror">{open ? '▾' : '▸'} </span>{t('report.title')}
        </button>
      </h3>
      {open && (
        <div id="dayend-body">
          {loadFailed && (
            <p role="alert" className="error">
              {t('error.network')} <button onClick={() => setAttempt((n) => n + 1)}>{t('error.retry')}</button>
            </p>
          )}
          <textarea dir="auto" rows={3} aria-label={t('report.title')} placeholder={t('report.placeholder')} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => void autosave()} />
          <p className="muted">
            {save === 'saving' && <span role="status">{t('note.saving')}</span>}
            {save === 'saved' && <span role="status">{t('note.saved')}</span>}
            {updatedAt && save !== 'saving' && save !== 'saved' && <Ltr>{t('note.updated', { time: time(updatedAt) })}</Ltr>}
          </p>
          {save === 'error' && (
            <p role="alert" className="error">
              {t('note.error')} <button onClick={() => void autosave()}>{t('error.retry')}</button>
            </p>
          )}
          <h4>{t('incidents.title')}</h4>
          {incidents.length === 0 ? (
            <p className="muted">{t('incident.none')}</p>
          ) : (
            <ul aria-label={t('incidents.title')} className="incidents">
              {incidents.map((i) => (
                <li key={i.id}>
                  <p dir="auto">{i.body}</p>
                  <p className="muted">
                    {i.status === 'open' ? <span className="badge">{t('incident.open')}</span> : <span><span aria-hidden="true">✓ </span>{t('incident.reviewed')}</span>}
                    {i.jobId !== null && <> · <bdi dir="auto">{titleOf(i.jobId)}</bdi></>}
                  </p>
                  {i.status === 'open' && <button onClick={() => void review(i.id)}>{t('incident.mark')}</button>}
                </li>
              ))}
            </ul>
          )}
          <div className="incident-form">
            <textarea dir="auto" rows={2} aria-label={t('incident.placeholder')} placeholder={t('incident.placeholder')} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <label className="field">
              {t('incident.link')}
              <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">—</option>
                {stops.map((s) => (
                  <option key={s.jobId} value={s.jobId}>{s.title}</option>
                ))}
              </select>
            </label>
            <button disabled={!draft.trim()} onClick={() => void add()}>{t('incident.add')}</button>
          </div>
          {failure && <p role="alert" className="error">{failure}</p>}
        </div>
      )}
    </section>
  );
}
