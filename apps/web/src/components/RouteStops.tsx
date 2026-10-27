import type { Job, RouteView } from '@shibutz/contracts';
import { time } from '../map';

export function RouteStops({ route, jobById }: { route: RouteView; jobById: Map<number, Job> }): React.JSX.Element {
  return (
    <>
      <h2>Route {route.date}</h2>
      {route.stops.length === 0 && <p>No stops.</p>}
      <ol>
        {route.stops.map((s) => (
          <li key={s.jobId}>
            Job {s.jobId} ({jobById.get(s.jobId)?.status ?? '?'}): ETA {time(s.eta)}, leave {time(s.etd)}
          </li>
        ))}
      </ol>
    </>
  );
}
