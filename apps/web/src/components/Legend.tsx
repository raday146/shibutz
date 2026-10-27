import { useLang } from '../lang';
import { JOB_STATUSES, statusColor } from '../map';

export function Legend(): React.JSX.Element {
  const { t } = useLang();
  return (
    <ul className="legend">
      {JOB_STATUSES.map((s) => (
        <li key={s}>
          <span className="dot" style={{ background: statusColor(s) }} /> {t(`status.${s}`)}
        </li>
      ))}
      <li>
        <span className="dot home" /> {t('map.legend.home')}
      </li>
    </ul>
  );
}
