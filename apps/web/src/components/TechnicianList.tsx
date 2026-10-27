import type { DaySummary, Skill, Technician } from '@shibutz/contracts';
import { sortByName } from '../i18n';
import { Ltr, useLang } from '../lang';
import { routeVar, shiftLabel, skillLabel } from '../map';

interface Props {
  technicians: Technician[];
  days: DaySummary['technicians'];
  skills: Skill[];
  selected: number | null;
  onSelect: (technicianId: number | null) => void;
}

export function TechnicianList({ technicians, days, skills, selected, onSelect }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  if (technicians.length === 0) return <p className="muted">{t('techs.empty')}</p>;
  return (
    <ul aria-label={t('techs.title')}>
      {sortByName(lang, technicians).map((tech) => {
        const day = days.find((d) => d.technicianId === tech.id);
        const total = day?.stopCount ?? 0;
        const done = day?.doneCount ?? 0;
        const progress = t('tech.progress', { done, total });
        return (
          <li key={tech.id} className={total === 0 ? 'row idle' : 'row'}>
            <button className={tech.id === selected ? 'on' : ''} aria-pressed={tech.id === selected} dir="auto" onClick={() => onSelect(tech.id === selected ? null : tech.id)}>
              <span className="swatch" style={{ background: routeVar(tech.color) }} aria-hidden="true" />
              <b>{tech.name}</b>{' '}
              <span className="muted"><Ltr>{shiftLabel(tech.shiftStart, tech.shiftEnd)}</Ltr></span>
              {/* Slot for the open-incident badge; incidents arrive with #50, so the day summary reports 0 until then. */}
              {day && day.openIncidents > 0 && <span className="badge">{t('tech.openIncidents', { n: day.openIncidents })}</span>}
              <span className="muted skills">{skillLabel(tech.skillIds, skills, lang) || t('tech.noSkills')}</span>
              {total === 0 ? (
                <span className="muted">{t('tech.noStops')}</span>
              ) : (
                <>
                  <span className="muted"><Ltr>{progress}</Ltr></span>
                  <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={progress}>
                    <span style={{ inlineSize: `${(100 * done) / total}%` }} />
                  </span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
