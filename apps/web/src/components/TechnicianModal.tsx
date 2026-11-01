import { useEffect, useRef, useState } from 'react';
import type { CreateTechnician, LonLat, Skill, Technician } from '@shibutz/contracts';
import { Ltr, useLang } from '../lang';
import { formatLatLon, routeVar, shiftLabel, skillLabel, skillName } from '../map';
import { MiniMap } from './MiniMap';
import { PickBar } from './PickBar';
import { technicianWarnings } from '../techWarnings';

interface Props {
  skills: Skill[];
  /** The loaded roster, active and inactive, for the review warnings. */
  technicians: Technician[];
  /** The route color the new technician will get (lowest free among active). */
  color: number;
  busy: boolean;
  /** Set by the last map pick; the map shows it too. */
  at: LonLat | null;
  picking: boolean;
  /** Message from a failed create, shown inside the dialog. */
  failure: string | null;
  onPicking: (picking: boolean) => void;
  /** Takes the point under the map's center crosshair. */
  onUsePoint: () => void;
  onSubmit: (technician: CreateTechnician) => void;
  onClose: () => void;
}

const FOCUSABLE = 'input, button:not(:disabled)';

/** Add a technician in two steps in one dialog: the form, then a read-only review. The form state survives going back. */
export function TechnicianModal({ skills, technicians, color, busy, at, picking, failure, onPicking, onUsePoint, onSubmit, onClose }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const [name, setName] = useState('');
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('16:00');
  const [reviewing, setReviewing] = useState(false);
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
  const toReview = (): void => {
    setTried(true);
    if (Object.values(errors).every((m) => !m)) setReviewing(true);
  };
  const confirm = (): void => {
    if (at) onSubmit({ name: name.trim(), home: at, shiftStart: `${from}:00`, shiftEnd: `${to}:00`, skillIds });
  };
  const warnings = reviewing && at ? technicianWarnings({ name, home: at, from, to, skillIds }, technicians) : [];
  const swatch = <span className="swatch" style={{ background: routeVar(color) }} aria-hidden="true" />;

  return (
    <>
      <div className="overlay" hidden={picking}>
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tech-modal-title" className="dialog form" onKeyDown={trap}>
          <div className="dialog-head">
            <h2 id="tech-modal-title">{reviewing ? t('review.title.new') : t('tech.new.title')}</h2>
            <button type="button" className="icon" aria-label={t('modal.x')} onClick={onClose}><span aria-hidden="true">×</span></button>
          </div>
          {reviewing ? (
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
              {warnings.length > 0 && (
                <div className="warnings">
                  <h3>{t('review.warnings')}</h3>
                  <ul>{warnings.map((w) => <li key={w.key}>{t(w.key, w.params)}</li>)}</ul>
                </div>
              )}
              {failure && <p className="error" role="alert">{failure}</p>}
              <div>
                <button onClick={confirm} disabled={busy}>{t('review.confirm.new')}</button>{' '}
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
                  <input type="time" aria-label={t('tech.field.shift.from')} value={from} onChange={(e) => setFrom(e.target.value)} {...aria('shift')} />
                  {' – '}
                  <input type="time" aria-label={t('tech.field.shift.to')} value={to} onChange={(e) => setTo(e.target.value)} {...aria('shift')} />
                </Ltr>
                {error('shift')}
              </fieldset>
              <fieldset>
                <legend>{t('tech.field.skills')}</legend>
                {skills.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
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
                  <button ref={homeRef} type="button" onClick={() => onPicking(true)} {...aria('home')}>
                    {at ? t('location.change') : t('location.pick')}
                  </button>{' '}
                  <span className="muted">{at ? <Ltr>{formatLatLon(at)}</Ltr> : t('tech.field.home.hint')}</span>
                </span>
                {error('home')}
              </div>
              <p className="muted">{swatch}{t('tech.color.note')}</p>
              <div>
                <button onClick={toReview}>{t('tech.toReview')}</button>{' '}
                <button onClick={onClose}>{t('modal.close')}</button>
              </div>
            </>
          )}
        </div>
      </div>
      {picking && <PickBar onUsePoint={onUsePoint} onBack={() => onPicking(false)} />}
    </>
  );
}
