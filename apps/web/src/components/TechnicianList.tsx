import type { Skill, Technician } from '@shibutz/contracts';
import { shiftLabel, skillLabel } from '../map';

interface Props {
  technicians: Technician[];
  skills: Skill[];
  selected: number | null;
  onSelect: (technicianId: number | null) => void;
}

export function TechnicianList({ technicians, skills, selected, onSelect }: Props): React.JSX.Element {
  return (
    <>
      <h2>Technicians</h2>
      <ul>
        {technicians.map((t) => (
          <li key={t.id}>
            <button className={t.id === selected ? 'on' : ''} onClick={() => onSelect(t.id === selected ? null : t.id)}>
              {t.name}
            </button>
            <div className="muted">{shiftLabel(t.shiftStart, t.shiftEnd)} · {skillLabel(t.skillIds, skills) || 'no skills'}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
