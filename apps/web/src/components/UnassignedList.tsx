import { isKey } from '../i18n';
import { useLang } from '../lang';
import { toLatLng } from '../map';
import type { UnassignedRow } from '../map';
import type { Point } from './MapView';

export function UnassignedList({ rows, onFocus }: { rows: UnassignedRow[]; onFocus: (at: Point) => void }): React.JSX.Element | null {
  const { t } = useLang();
  if (rows.length === 0) return null;
  return (
    <>
      <h2>{t('unassigned.title')} ({rows.length})</h2>
      <ul>
        {rows.map((u) => {
          const reasonKey = `reason.${u.reason}`;
          return (
            <li key={u.jobId}>
              <button onClick={() => onFocus(toLatLng(u.location))}>
                <b dir="auto">{u.title}</b>
                <div className="muted" dir="auto">{u.address || t('job.noAddress')}</div>
                {u.reason && <div className="muted">{isKey(reasonKey) ? t(reasonKey) : u.reason}</div>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
