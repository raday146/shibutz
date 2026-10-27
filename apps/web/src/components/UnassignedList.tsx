import { toLatLng } from '../map';
import type { UnassignedRow } from '../map';
import type { Point } from './MapView';

export function UnassignedList({ rows, onFocus }: { rows: UnassignedRow[]; onFocus: (at: Point) => void }): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <>
      <h2>Unassigned ({rows.length})</h2>
      <ul>
        {rows.map((u) => (
          <li key={u.jobId}>
            <button onClick={() => onFocus(toLatLng(u.location))}>
              Job {u.jobId}{u.reason ? `: ${u.reason}` : ''}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
