import { JOB_STATUSES, statusColor } from '../map';

export function Legend(): React.JSX.Element {
  return (
    <ul className="legend">
      {JOB_STATUSES.map((s) => (
        <li key={s}>
          <span className="dot" style={{ background: statusColor(s) }} /> {s.replace('_', ' ')}
        </li>
      ))}
      <li>
        <span className="dot home" /> technician home
      </li>
    </ul>
  );
}
