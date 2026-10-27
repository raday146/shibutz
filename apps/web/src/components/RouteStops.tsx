import type { Job, RouteView } from '@shibutz/contracts';
import { formatDay, pluralKey } from '../i18n';
import { useLang, withLtrTimes } from '../lang';
import { time } from '../map';

export function RouteStops({ route, jobById }: { route: RouteView; jobById: Map<number, Job> }): React.JSX.Element {
  const { lang, t } = useLang();
  return (
    <>
      <h2>{t('route.title', { date: formatDay(lang, route.date) })}</h2>
      <p className="muted">{route.stops.length === 0 ? t('tech.noStops') : t(pluralKey(lang, route.stops.length, 'stops'), { n: route.stops.length })}</p>
      <ol>
        {route.stops.map((s) => {
          const status = jobById.get(s.jobId)?.status;
          return (
            <li key={s.jobId}>
              <span dir="auto">{s.title}</span>{status ? ` (${t(`status.${status}`)})` : ''}, <span dir="auto">{s.address || t('job.noAddress')}</span>:{' '}
              {withLtrTimes(t('stop.line', { eta: time(s.eta), etd: time(s.etd) }))}
            </li>
          );
        })}
      </ol>
    </>
  );
}
