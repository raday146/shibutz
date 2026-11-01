import { useEffect, useRef, useState } from 'react';
import type { CreateTechnician, LonLat, Skill, Technician, UpdateTechnician } from '@shibutz/contracts';
import { Ltr, useLang, withLtrNumbers } from '../lang';
import { formatLatLon, idsKey, routeVar, shiftLabel, skillLabel, skillName } from '../map';
import { ChangeLog } from './ChangeLog';
import { MiniMap } from './MiniMap';
import { PickBar } from './PickBar';
import { technicianWarnings } from '../techWarnings';

/** What differs from the saved technician; the edit's request body (without the version) and the review's list of changes. */
export function techPatch(was: Technician, now: CreateTechnician): Omit<UpdateTechnician, 'version'> {
  return {
    ...(now.name !== was.name && { name: now.name }),
    ...((now.home[0] !== was.home[0] || now.home[1] !== was.home[1]) && { home: now.home }),
    ...(now.shiftStart !== was.shiftStart && { shiftStart: now.shiftStart }),
    ...(now.shiftEnd !== was.shiftEnd && { shiftEnd: now.shiftEnd }),
    ...(idsKey(now.skillIds) !== idsKey(was.skillIds) && { skillIds: now.skillIds }),
  };
}

interface Props {
  /** Set to edit this technician: the same form, pre-filled, with a review of what changes. */
  technician?: Technician;
  skills: Skill[];
  /** The loaded roster, active and inactive, for the review warnings. */
  technicians: Technician[];
  /** The route color shown in the review: the one the new technician will get (lowest free among active), or the current one. */
  color: number | undefined;
  busy: boolean;
  /** Set by the last map pick; the map shows it too. */
  at: LonLat | null;
  picking: boolean;
  /** Message from a failed create, shown inside the dialog. */
  failure: string | null;
  onPicking: (picking: boolean) => void;
  /** Takes the point under the map's center crosshair. */
  onUsePoint: () => void;
  /** `version` is the one the user reviewed; the server refuses the save if the technician changed since. */
  onSubmit: (technician: CreateTechnician, version: number) => void;
  onClose: () => void;
}

const FOCUSABLE = 'input:not(:disabled), button:not(:disabled)';

/** Add a technician in two steps in one dialog: the form, then a read-only review. The form state survives going back. */
export function TechnicianModal({ technician, skills, technicians, color, busy, at, picking, failure, onPicking, onUsePoint, onSubmit, onClose }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const [name, setName] = useState(technician?.name ?? '');
  const [skillIds, setSkillIds] = useState<number[]>(technician?.skillIds ?? []);
  const [from, setFrom] = useState(technician?.shiftStart.slice(0, 5) ?? '08:00');
  const [to, setTo] = useState(technician?.shiftEnd.slice(0, 5) ?? '16:00');
  const [reviewing, setReviewing] = useState(false);
  const [seen, setSeen] = useState<string | null>(null); // a failure the user has moved past by reviewing again
  const message = failure === seen ? null : failure;
  const reviewed = useRef(0); // the version the user looked at when entering the review
  // An inactive technician keeps the home, shift and skills its history was built on.
  const frozen = technician !== undefined && !technician.active;
  // Errors show once the user has tried to continue, then follow the fields as they are fixed.
  const [tried, setTried] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const homeRef = useRef<HTMLButtonElement>(null);
  const wasPicking = useRef(false);

  const errors = {
    name: name.trim() ? '' : t('validation.name'),
    shift: from < to ? '' : t('validation.shift'),
    home: at ? '' : t('validation.location'),
  };
  type Field = keyof typeof errors;
  const shown = (k: Field): string => (tried ? errors[k] : '');
  const aria = (k: Field): { 'aria-invalid': boolean; 'aria-describedby': string | undefined } => ({
    'aria-invalid': !!shown(k),
    'aria-describedby': shown(k) ? `tech-${k}-error` : undefined,
  });
  const error = (k: Field): React.JSX.Element | null =>
    <span className="slot">{shown(k) && <span id={`tech-${k}-error`} role="alert" className="error">{errors[k]}</span>}</span>;

  useEffect(() => nameRef.current?.focus(), []);
  // Back to the home button when a map-pick ends.
  useEffect(() => {
    if (!picking && wasPicking.current) homeRef.current?.focus();
    wasPicking.current = picking;
  }, [picking]);
  // Escape closes only the topmost layer: map-pick (PickBar), then the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!picking && e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picking, onClose]);

  const trap = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const [first, last] = [items[0], items[items.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  const form: CreateTechnician | null = at && { name: name.trim(), home: at, shiftStart: `${from}:00`, shiftEnd: `${to}:00`, skillIds };
  const changes = technician && form ? techPatch(technician, form) : null;
  const nameOnly = changes !== null && Object.keys(changes).every((k) => k === 'name');
  const confirm = (): void => {
    if (!form) return;
    setSeen(null);
    onSubmit(form, reviewed.current);
  };
  const toReview = (): void => {
    setTried(true);
    if (!Object.values(errors).every((m) => !m)) return;
    reviewed.current = technician?.version ?? 0;
    setSeen(failure);
    if (nameOnly) confirm(); // a name-only edit needs no review
    else setReviewing(true);
  };
  // The technician changed under an open review (the roster reloaded after a stale save): back to the form to review again.
  useEffect(() => {
    if (reviewing && technician && technician.version !== reviewed.current) setReviewing(false);
  }, [reviewing, technician]);
  // An edit is compared with the others, not with itself.
  const warnings = reviewing && at ? technicianWarnings({ name, home: at, from, to, skillIds }, technicians.filter((x) => x.id !== technician?.id)) : [];
  const swatch = color === undefined ? null : <span className="swatch" style={{ background: routeVar(color) }} aria-hidden="true" />;

  return (
    <>
      <div className="overlay" hidden={picking}>
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tech-modal-title" className="dialog form" onKeyDown={trap}>
          <div className="dialog-head">
            <h2 id="tech-modal-title">{reviewing ? t(technician ? 'review.title.edit' : 'review.title.new') : technician ? t('tech.edit.title', { name: technician.name }) : t('tech.new.title')}</h2>
            <button type="button" className="icon" aria-label={t('modal.x')} onClick={onClose}><span aria-hidden="true">×</span></button>
          </div>
          {reviewing ? (
            <>
              {technician ? (
                <>
                  <ul className="review">
                    {changes?.name !== undefined && <li dir="auto">{withLtrNumbers(t('review.change', { field: t('tech.field.name'), before: technician.name, after: name.trim() }))}</li>}
                    {changes?.shiftStart !== undefined || changes?.shiftEnd !== undefined ? <li>{withLtrNumbers(t('review.change', { field: t('tech.field.shift'), before: shiftLabel(technician.shiftStart, technician.shiftEnd), after: shiftLabel(from, to) }))}</li> : null}
                    {changes?.skillIds !== undefined && <li>{t('review.change', { field: t('tech.field.skills'), before: skillLabel(technician.skillIds, skills, lang) || t('tech.noSkills'), after: skillLabel(skillIds, skills, lang) || t('tech.noSkills') })}</li>}
                    {changes?.home !== undefined && <li>{withLtrNumbers(t('review.change', { field: t('tech.field.home'), before: formatLatLon(technician.home), after: at ? formatLatLon(at) : '' }))}</li>}
                  </ul>
                  <p>{t('review.color')} {swatch}</p>
                  {changes?.home !== undefined && at && <MiniMap at={at} label={t('tech.field.home')} />}
                </>
              ) : (
                <>
                  <dl className="review">
                    <dt>{t('tech.field.name')}</dt>
                    <dd dir="auto">{name.trim()}</dd>
                    <dt>{t('tech.field.shift')}</dt>
                    <dd><Ltr>{shiftLabel(from, to)}</Ltr></dd>
                    <dt>{t('tech.field.skills')}</dt>
                    <dd>{skillLabel(skillIds, skills, lang) || t('tech.noSkills')}</dd>
                    <dt>{t('tech.field.home')}</dt>
                    <dd><Ltr>{at && formatLatLon(at)}</Ltr></dd>
                    <dt>{t('review.color')}</dt>
                    <dd>{swatch}</dd>
                  </dl>
                  {at && <MiniMap at={at} label={t('tech.field.home')} />}
                </>
              )}
              {warnings.length > 0 && (
                <div className="warnings">
                  <h3>{t('review.warnings')}</h3>
                  <ul>{warnings.map((w) => <li key={w.key}>{t(w.key, w.params)}</li>)}</ul>
                </div>
              )}
              {message && <p className="error" role="alert">{message}</p>}
              <div>
                <button onClick={confirm} disabled={busy}>{t(technician ? 'review.confirm.edit' : 'review.confirm.new')}</button>{' '}
                <button onClick={() => setReviewing(false)}>{t('review.back')}</button>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="tech-name">{t('tech.field.name')}</label>
                <input id="tech-name" ref={nameRef} dir="auto" value={name} onChange={(e) => setName(e.target.value)} {...aria('name')} />
                {error('name')}
              </div>
              <fieldset>
                <legend>{t('tech.field.shift')}</legend>
                <Ltr>
                  <input type="time" disabled={frozen} aria-label={t('tech.field.shift.from')} value={from} onChange={(e) => setFrom(e.target.value)} {...aria('shift')} />
                  {' – '}
                  <input type="time" disabled={frozen} aria-label={t('tech.field.shift.to')} value={to} onChange={(e) => setTo(e.target.value)} {...aria('shift')} />
                </Ltr>
                {error('shift')}
              </fieldset>
              <fieldset>
                <legend>{t('tech.field.skills')}</legend>
                {skills.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      disabled={frozen}
                      checked={skillIds.includes(s.id)}
                      onChange={(e) => setSkillIds(e.target.checked ? [...skillIds, s.id] : skillIds.filter((x) => x !== s.id))}
                    />{' '}
                    {skillName(s, lang)}
                  </label>
                ))}
              </fieldset>
              <div className="field">
                {t('tech.field.home')}
                <span>
                  <button ref={homeRef} type="button" disabled={frozen} onClick={() => onPicking(true)} {...aria('home')}>
                    {at ? t('location.change') : t('location.pick')}
                  </button>{' '}
                  <span className="muted">{at ? <Ltr>{formatLatLon(at)}</Ltr> : t('tech.field.home.hint')}</span>
                </span>
                {error('home')}
              </div>
              {frozen ? <p className="muted">{t('tech.inactive.editHint')}</p> : <p className="muted">{swatch}{t('tech.color.note')}</p>}
              {message && <p className="error" role="alert">{message}</p>}
              <div>
                <button onClick={toReview} disabled={busy}>{t(nameOnly ? 'tech.save' : 'tech.toReview')}</button>{' '}
                <button onClick={onClose}>{t('modal.close')}</button>
              </div>
              {technician && <ChangeLog title="changes.history" technicianId={technician.id} roster={technicians} skills={skills} />}
            </>
          )}
        </div>
      </div>
      {picking && <PickBar onUsePoint={onUsePoint} onBack={() => onPicking(false)} />}
    </>
  );
}
