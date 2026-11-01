import { useEffect, useRef, useState } from 'react';
import type { DaySummary, Skill, Technician } from '@shibutz/contracts';
import { MAX_ACTIVE_TECHNICIANS } from '@shibutz/contracts';
import { sortByName } from '../i18n';
import { Ltr, useLang, withLtrNumbers } from '../lang';
import { routeVar, shiftLabel, skillLabel } from '../map';
import { Anchored } from './Anchored';

interface Props {
  technicians: Technician[];
  days: DaySummary['technicians'];
  skills: Skill[];
  selected: number | null;
  /** `opener` is the clicked row and `keyboard` tells whether it was activated from the keyboard (no animation then). */
  onSelect: (technicianId: number | null, opener?: HTMLElement, keyboard?: boolean) => void;
  onAdd: () => void;
  onEdit: (technicianId: number) => void;
}

/** The row's overflow menu. */
function RowMenu({ onEdit }: { onEdit: () => void }): React.JSX.Element {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) item.current?.focus();
  }, [open]);
  return (
    <span className="row-menu">
      <button ref={more} aria-haspopup="menu" aria-expanded={open} aria-label={t('action.more')} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <Anchored trigger={more} role="menu" onClose={() => setOpen(false)}>
          <button ref={item} role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>{t('tech.edit')}</button>
        </Anchored>
      )}
    </span>
  );
}

export function TechnicianList({ technicians, days, skills, selected, onSelect, onAdd, onEdit }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const full = technicians.filter((x) => x.active).length >= MAX_ACTIVE_TECHNICIANS;
  const add = (
    <div className="add-tech">
      <button onClick={onAdd} disabled={full} aria-describedby={full ? 'add-tech-why' : undefined}>{t('tech.add')}</button>
      {full && <p id="add-tech-why" className="muted">{t('tech.add.disabled')}</p>}
    </div>
  );
  if (technicians.length === 0) return <>{add}<p className="muted">{t('techs.empty')}</p></>;
  return (
    <>
    {add}
    <ul aria-label={t('techs.title')}>
      {sortByName(lang, technicians).map((tech) => {
        const day = days.find((d) => d.technicianId === tech.id);
        const total = day?.stopCount ?? 0;
        const done = day?.doneCount ?? 0;
        const progress = t('tech.progress', { done, total });
        return (
          <li key={tech.id} className={['row', total === 0 && 'idle', tech.id === selected && 'on'].filter(Boolean).join(' ')} style={{ '--c': routeVar(tech.color) } as React.CSSProperties}>
            <button aria-pressed={tech.id === selected} dir="auto" onClick={(e) => onSelect(tech.id === selected ? null : tech.id, e.currentTarget, e.detail === 0)}>
              <span className="swatch" style={{ background: routeVar(tech.color) }} aria-hidden="true" />
              <b>{tech.name}</b>{' '}
              <span className="muted"><Ltr>{shiftLabel(tech.shiftStart, tech.shiftEnd)}</Ltr></span>
              {/* Open incidents that day, from the day summary. */}
              {day && day.openIncidents > 0 && <span className="badge">{t('tech.openIncidents', { n: day.openIncidents })}</span>}
              <span className="muted skills">{skillLabel(tech.skillIds, skills, lang) || t('tech.noSkills')}</span>
              {total === 0 ? (
                <span className="muted">{t('tech.noStops')}</span>
              ) : (
                <>
                  <span className="muted">{withLtrNumbers(progress)}</span>
                  <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={progress}>
                    <span style={{ inlineSize: `${(100 * done) / total}%` }} />
                  </span>
                </>
              )}
            </button>
            <RowMenu onEdit={() => onEdit(tech.id)} />
          </li>
        );
      })}
    </ul>
    </>
  );
}
