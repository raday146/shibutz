import type { InsertionOption, InsertionSuggestions } from '@shibutz/contracts';
import { positionLabel, time } from '../map';

interface Props {
  suggestions: InsertionSuggestions;
  notice: string;
  busy: boolean;
  techName: (id: number) => string;
  onChoose: (option: InsertionOption) => void;
  onClose: () => void;
}

export function Suggestions({ suggestions, notice, busy, techName, onChoose, onClose }: Props): React.JSX.Element {
  return (
    <>
      <h2>Options for Job {suggestions.jobId}</h2>
      {notice && <p className="error">{notice}</p>}
      {suggestions.options.length === 0 && <p>No technician can take it:</p>}
      <ol className="options">
        {suggestions.options.map((o) => (
          <li key={`${o.technicianId}-${o.position.afterJobId}-${o.position.beforeJobId}`}>
            <button disabled={busy} onClick={() => onChoose(o)}>
              <b>{techName(o.technicianId)}</b>: {positionLabel(o.position)}, detour {Math.round(o.detourS / 60)} min
              <div className="muted">{o.etas.map((e) => `Job ${e.jobId} ${time(e.eta)}`).join(' → ')}</div>
            </button>
          </li>
        ))}
      </ol>
      {suggestions.options.length === 0 && (
        <ul>
          {suggestions.rejections.map((r) => (
            <li key={r.technicianId}>{techName(r.technicianId)}: {r.reason}</li>
          ))}
        </ul>
      )}
      <button onClick={onClose}>Close (job stays unassigned)</button>
    </>
  );
}
