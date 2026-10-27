import type { LonLat, Skill } from '@shibutz/contracts';

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
  const { skillIds, minutes, from, to } = draft;
  return (
    <>
      <h2>New job ({date})</h2>
      {!picking && !at ? (
        <button onClick={onStart}>Add job: click the map</button>
      ) : (
        <div className="form">
          <p className="muted">{at ? `Location ${at[1].toFixed(4)}, ${at[0].toFixed(4)} (click the map to move it)` : 'Click the map to set the location'}</p>
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
          <label>Duration (min) <input type="number" min={1} value={minutes} onChange={(e) => onDraft({ ...draft, minutes: Number(e.target.value) })} /></label>
          <label>Window <input type="time" value={from} onChange={(e) => onDraft({ ...draft, from: e.target.value })} /> - <input type="time" value={to} onChange={(e) => onDraft({ ...draft, to: e.target.value })} /> (Israel time)</label>
          <div>
            <button onClick={onSubmit} disabled={busy || !at}>Create and suggest</button>{' '}
            <button onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
