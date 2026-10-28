import { useEffect, useRef, useState } from 'react';
import type { DaySummary } from '@shibutz/contracts';
import { pluralKey } from '../i18n';
import type { Key } from '../i18n';
import { Ltr, useLang } from '../lang';
import { addDays, today } from '../map';

interface Props {
  date: string;
  summary: DaySummary | null;
  busy: boolean;
  loading: boolean;
  onDate: (date: string) => void;
  onRefresh: () => void;
  onOptimize: () => void;
  onUnassigned: () => void;
  onAdd: () => void;
}

export function TopBar({ date, summary, busy, loading, onDate, onRefresh, onOptimize, onUnassigned, onAdd }: Props): React.JSX.Element {
  const { lang, t, toggle } = useLang();
  const [confirming, setConfirming] = useState(false);
  const planRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const totals = summary?.totals;
  const started = !!summary?.technicians.some((tech) => tech.stops.some((s) => s.status === 'in_progress' || s.status === 'done'));
  const close = (): void => {
    setConfirming(false);
    planRef.current?.focus();
  };
  const kpi = (key: Key, value: string, attention = false, onClick?: () => void): React.JSX.Element => {
    const text = <Ltr>{attention && <span aria-hidden="true">▲ </span>}{value}</Ltr>;
    return (
      <div role="group" aria-label={t(key)} className={attention ? 'kpi attention' : 'kpi'}>
        <span className="muted">{t(key)}</span>
        <b>{onClick ? <button className="plain" aria-label={`${t(key)} ${value}`} onClick={onClick}>{text}</button> : text}</b>
      </div>
    );
  };
  // Escape closes the dialog; Tab stays between its two buttons.
  const onDialogKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === keepRef.current ? okRef.current : keepRef.current)?.focus();
    }
  };

  return (
    <header className="topbar">
      <div className="date">
        <button aria-label={t('date.prev')} onClick={() => onDate(addDays(date, -1))}><span aria-hidden="true" className="mirror">‹</span></button>
        <input type="date" aria-label={t('date.label')} value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
        <button aria-label={t('date.next')} onClick={() => onDate(addDays(date, 1))}><span aria-hidden="true" className="mirror">›</span></button>
        <button onClick={() => onDate(today())}>{t('date.today')}</button>
      </div>
      {totals && (
        <div className="kpis">
          {kpi('kpi.assigned', `${totals.assigned}/${totals.total}`)}
          {kpi('kpi.unassigned', String(totals.unassigned), totals.unassigned > 0, onUnassigned)}
          {kpi('kpi.done', `${totals.done}/${totals.total}`)}
          {kpi('kpi.drive', t('duration.min', { n: Math.round(totals.driveS / 60) }))}
        </div>
      )}
      <div className="actions">
        {loading && <span className="muted" role="status">{t('loading')}</span>}
        <button onClick={onAdd}>{t('job.add')}</button>
        <button onClick={onRefresh} disabled={loading}>{t('refresh')}</button>
        {started && <span id="plan-why" className="muted">{t('plan.disabled')}</span>}
        <button
          ref={planRef}
          className="primary"
          aria-describedby={started ? 'plan-why' : undefined}
          disabled={busy || started}
          onClick={() => (totals && totals.assigned > 0 ? setConfirming(true) : onOptimize())}
        >
          {busy ? t('plan.busy') : t('plan.action')}
        </button>
        <button lang={lang === 'he' ? 'en' : 'he'} aria-label={t('lang.toggle.label')} onClick={toggle}>
          {t('lang.toggle')}
        </button>
      </div>
      {confirming && totals && (
        <div className="overlay">
          <div role="alertdialog" aria-modal="true" aria-labelledby="plan-confirm-title" className="dialog" onKeyDown={onDialogKey}>
            <h2 id="plan-confirm-title">{t('plan.confirm.title')}</h2>
            <p>{t('plan.confirm.body', { jobs: t(pluralKey(lang, totals.assigned, 'plan.confirm.jobs'), { n: totals.assigned }) })}</p>
            <button ref={keepRef} onClick={close}>{t('plan.confirm.keep')}</button>{' '}
            <button ref={okRef} onClick={() => { close(); onOptimize(); }}>{t('plan.confirm.ok')}</button>
          </div>
        </div>
      )}
    </header>
  );
}
