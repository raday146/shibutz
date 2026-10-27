import type { LonLat, Skill } from '@shibutz/contracts';
import { useLang } from '../lang';

export interface JobDraft {
  skillIds: number[];
  minutes: number;
  from: string;
  to: string;
}

interface Props {
  date: string;
  skills: Skill[];
  picking: boolean;
  at: LonLat | null;
  draft: JobDraft;
  busy: boolean;
  onDraft: (draft: JobDraft) => void;
  onStart: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function NewJobForm({ date, skills, picking, at, draft, busy, onDraft, onStart, onCancel, onSubmit }: Props): React.JSX.Element {
  const { t } = useLang();
  const { skillIds, minutes, from, to } = draft;
  return (
    <>
      <h2>{t('job.new')} (<bdi dir="ltr">{date}</bdi>)</h2>
      {!picking && !at ? (
        <button onClick={onStart}>{t('job.add')}: {t('location.pick')}</button>
      ) : (
        <div className="form">
          <p className="muted">{at ? <>{t('location.set')}: <bdi dir="ltr">{at[1].toFixed(4)}, {at[0].toFixed(4)}</bdi></> : t('location.picking')}</p>
          {skills.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={skillIds.includes(s.id)}
                onChange={(e) => onDraft({ ...draft, skillIds: e.target.checked ? [...skillIds, s.id] : skillIds.filter((x) => x !== s.id) })}
              />{' '}
              {s.name}
            </label>
          ))}
          <label>{t('field.duration')} <input type="number" min={1} value={minutes} onChange={(e) => onDraft({ ...draft, minutes: Number(e.target.value) })} /></label>
          <label>
            {t('field.window')}{' '}
            <bdi dir="ltr">
              <input type="time" value={from} onChange={(e) => onDraft({ ...draft, from: e.target.value })} /> – <input type="time" value={to} onChange={(e) => onDraft({ ...draft, to: e.target.value })} />
            </bdi>
          </label>
          <div>
            <button onClick={onSubmit} disabled={busy || !at}>{t('modal.create')}</button>{' '}
            <button onClick={onCancel}>{t('modal.close')}</button>
          </div>
        </div>
      )}
    </>
  );
}
