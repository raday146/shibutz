import { useLang } from '../lang';

const MARKS = ['assigned', 'in_progress', 'done', 'unassigned'] as const;

/** Collapsible Map key; the marks use the same `.pin` classes as the map markers. */
export function Legend(): React.JSX.Element {
  const { t } = useLang();
  return (
    <details className="mapkey">
      <summary>{t('map.key')}</summary>
      <p>
        <span className="pin home" aria-hidden="true">A</span> {t('map.key.color')}
      </p>
      <p>{t('map.key.ring')}</p>
      <ul>
        {MARKS.map((s) => (
          <li key={s}>
            <span className={`pin ${s}`} aria-hidden="true">{s === 'done' ? '✓' : ''}</span> {t(`status.${s}`)}
          </li>
        ))}
        <li>
          <span className="pin home" aria-hidden="true" /> {t('map.legend.home')}
        </li>
      </ul>
    </details>
  );
}
