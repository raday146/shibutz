import { useLang } from '../lang';

interface Props {
  date: string;
  busy: boolean;
  loading: boolean;
  error: string;
  onDate: (date: string) => void;
  onOptimize: () => void;
}

export function TopBar({ date, busy, loading, error, onDate, onOptimize }: Props): React.JSX.Element {
  const { lang, t, toggle } = useLang();
  return (
    <header className="topbar">
      <input type="date" aria-label={t('date.label')} value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
      <button className="primary" onClick={onOptimize} disabled={busy}>
        {busy ? t('plan.busy') : t('plan.action')}
      </button>
      <button lang={lang === 'he' ? 'en' : 'he'} aria-label={t('lang.toggle.label')} onClick={toggle}>
        {t('lang.toggle')}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="muted">{t('loading')}</p>}
    </header>
  );
}
