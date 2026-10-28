import { useEffect, useRef, useState } from 'react';
import type { LonLat, Skill } from '@shibutz/contracts';
import { Ltr, useLang } from '../lang';
import { skillName } from '../map';

export interface JobDraft {
  title: string;
  address: string;
  skillIds: number[];
  minutes: number;
  from: string;
  to: string;
}

interface Props {
  date: string;
  skills: Skill[];
  busy: boolean;
  /** Set by the last map pick; the map shows it too. */
  at: LonLat | null;
  picking: boolean;
  /** Message from a failed create, shown inside the dialog. */
  failure: string | null;
  onPicking: (picking: boolean) => void;
  /** Takes the point under the map's center crosshair. */
  onUsePoint: () => void;
  onSubmit: (draft: JobDraft) => void;
  onClose: () => void;
}

const FOCUSABLE = 'input, button:not(:disabled)';

export function NewJobModal({ date, skills, busy, at, picking, failure, onPicking, onUsePoint, onSubmit, onClose }: Props): React.JSX.Element {
  const { lang, t } = useLang();
  const [draft, setDraft] = useState<JobDraft>({ title: '', address: '', skillIds: [], minutes: 30, from: '09:00', to: '14:00' });
  // Errors show once the user has tried to create, then follow the fields as they are fixed.
  const [tried, setTried] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const wasPicking = useRef(false);
  const [leaving, setLeaving] = useState(false); // a pointer Cancel fades out first; the keyboard closes at once
  const { title, address, skillIds, minutes, from, to } = draft;

  const errors = {
    title: title.trim() ? '' : t('validation.title'),
    address: address.trim() ? '' : t('validation.address'),
    skills: skillIds.length > 0 ? '' : t('validation.skills'),
    duration: minutes > 0 ? '' : t('validation.duration'),
    window: from < to ? '' : t('validation.window'),
    location: at ? '' : t('validation.location'),
  };
  type Field = keyof typeof errors;
  const shown = (k: Field): string => (tried ? errors[k] : '');
  const aria = (k: Field): { 'aria-invalid': boolean; 'aria-describedby': string | undefined } => ({
    'aria-invalid': !!shown(k),
    'aria-describedby': shown(k) ? `job-${k}-error` : undefined,
  });
  const error = (k: Field): React.JSX.Element | null =>
    shown(k) ? <span id={`job-${k}-error`} role="alert" className="error">{errors[k]}</span> : null;

  useEffect(() => titleRef.current?.focus(), []);
  // Into the bar when map-pick starts, back to "Set location on map" when it ends.
  useEffect(() => {
    if (picking) bar.current?.focus();
    else if (wasPicking.current) locationRef.current?.focus();
    wasPicking.current = picking;
  }, [picking]);
  // Escape closes only the topmost layer: map-pick, then the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (picking) onPicking(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picking, onPicking, onClose]);

  const trap = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const [first, last] = [items[0], items[items.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  const create = (): void => {
    setTried(true);
    if (Object.values(errors).every((m) => !m)) onSubmit(draft);
  };
  const set = (patch: Partial<JobDraft>): void => setDraft({ ...draft, ...patch });

  return (
    <>
      <div className={leaving ? 'overlay leaving' : 'overlay'} hidden={picking}>
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="job-modal-title" className="dialog form" onKeyDown={trap}>
          <h2 id="job-modal-title">{t('job.new')} (<bdi dir="ltr">{date}</bdi>)</h2>
          <div className="field">
            <label htmlFor="job-title">{t('field.title')}</label>
            <input id="job-title" ref={titleRef} dir="auto" value={title} onChange={(e) => set({ title: e.target.value })} {...aria('title')} />
            {error('title')}
          </div>
          <div className="field">
            <label htmlFor="job-address">{t('field.address')}</label>
            <input id="job-address" dir="auto" value={address} onChange={(e) => set({ address: e.target.value })} {...aria('address')} />
            {error('address')}
          </div>
          <fieldset>
            <legend>{t('field.skills')}</legend>
            {skills.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={skillIds.includes(s.id)}
                  onChange={(e) => set({ skillIds: e.target.checked ? [...skillIds, s.id] : skillIds.filter((x) => x !== s.id) })}
                />{' '}
                {skillName(s, lang)}
              </label>
            ))}
            {error('skills')}
          </fieldset>
          <div className="field">
            <label htmlFor="job-duration">{t('field.duration')}</label>
            <input id="job-duration" type="number" min={1} value={minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} {...aria('duration')} />
            {error('duration')}
          </div>
          <fieldset>
            <legend>{t('field.window')}</legend>
            <Ltr>
              <input type="time" aria-label={t('field.window.from')} value={from} onChange={(e) => set({ from: e.target.value })} {...aria('window')} />
              {' – '}
              <input type="time" aria-label={t('field.window.to')} value={to} onChange={(e) => set({ to: e.target.value })} {...aria('window')} />
            </Ltr>
            {error('window')}
          </fieldset>
          <div className="field">
            {t('location.label')}
            <span>
              <button ref={locationRef} type="button" onClick={() => onPicking(true)} {...aria('location')}>
                {at ? t('location.change') : t('location.pick')}
              </button>{' '}
              {at && <span className="muted">{t('location.set')}: <Ltr>{at[1].toFixed(4)}, {at[0].toFixed(4)}</Ltr></span>}
            </span>
            {error('location')}
          </div>
          {failure && <p className="error" role="alert">{failure}</p>}
          <div>
            <button onClick={create} disabled={busy}>{t('modal.create')}</button>{' '}
            <button onClick={(e) => { if (e.detail === 0) onClose(); else { setLeaving(true); setTimeout(onClose, 120); } }}>{t('modal.close')}</button>
          </div>
        </div>
      </div>
      {picking && (
        <div ref={bar} tabIndex={-1} role="group" aria-label={t('location.label')} className="pickbar">
          <span>{t('location.picking')}</span>
          <button onClick={onUsePoint}>{t('location.use')}</button>
          <button onClick={() => onPicking(false)}>{t('location.back')}</button>
        </div>
      )}
    </>
  );
}
