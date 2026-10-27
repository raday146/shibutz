import type { InsertionOption, InsertionSuggestions } from '@shibutz/contracts';
import { useLang, withLtrTimes } from '../lang';
import { time } from '../map';

interface Props {
  suggestions: InsertionSuggestions;
  notice: string;
  busy: boolean;
  techName: (id: number) => string;
  onChoose: (option: InsertionOption) => void;
  onClose: () => void;
}

export function Suggestions({ suggestions, notice, busy, techName, onChoose, onClose }: Props): React.JSX.Element {
  const { t } = useLang();
  // null neighbours are the technician's home
  const side = (id: number | null): string => (id === null ? t('slot.home') : t('job.ref', { id }));
  return (
    <>
      <h2>{t('slot.title')}: {t('job.ref', { id: suggestions.jobId })}</h2>
      {notice && <p className="error" role="alert">{notice}</p>}
      {suggestions.options.length === 0 && <p>{t('slot.none')}</p>}
      <ol className="options">
        {suggestions.options.map((o) => (
          <li key={`${o.technicianId}-${o.position.afterJobId}-${o.position.beforeJobId}`}>
            <button disabled={busy} onClick={() => onChoose(o)}>
              <b dir="auto">{techName(o.technicianId)}</b>: {t('slot.position', { prev: side(o.position.afterJobId), next: side(o.position.beforeJobId) })},{' '}
              {t('slot.detour', { n: Math.round(o.detourS / 60) })}
              <div className="muted">{withLtrTimes(o.etas.map((e) => `${t('job.ref', { id: e.jobId })} ${time(e.eta)}`).join(' → '))}</div>
            </button>
          </li>
        ))}
      </ol>
      {suggestions.options.length === 0 && (
        <ul>
          {suggestions.rejections.map((r) => (
            <li key={r.technicianId}>
              <span dir="auto">{techName(r.technicianId)}</span>: {t(`slot.rejection.${r.reason}`)}
            </li>
          ))}
        </ul>
      )}
      <button onClick={onClose}>{t('slot.close')}</button>
    </>
  );
}
