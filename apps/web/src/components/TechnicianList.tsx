import type { Skill, Technician } from '@shibutz/contracts';
import { sortByName } from '../i18n';
import { Ltr, useLang } from '../lang';
import { routeVar, shiftLabel, skillLabel } from '../map';

interface Props {
  technicians: Technician[];
  skills: Skill[];
  selected: number | null;
  onSelect: (technicianId: number | null) => void;
}

export function TechnicianList({ technicians, skills, selected, onSelect }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  return (
    <>
      <h2>{t('techs.title')}</h2>
      <ul>
        {sortByName(lang, technicians).map((tech) => (
          <li key={tech.id}>
            <button className={tech.id === selected ? 'on' : ''} dir="auto" onClick={() => onSelect(tech.id === selected ? null : tech.id)}>
              <span className="swatch" style={{ background: routeVar(tech.color) }} aria-hidden="true" />
              {tech.name}
            </button>
            <div className="muted">
              <Ltr>{shiftLabel(tech.shiftStart, tech.shiftEnd)}</Ltr> · {skillLabel(tech.skillIds, skills, lang) || t('tech.noSkills')}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
