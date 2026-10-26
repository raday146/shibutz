import type { JobStatus } from '@shibutz/contracts';
import { toDaySeconds } from './time';

export interface PositionStop {
  status: JobStatus;
  /** Actual arrival when known, else planned. Seconds on the day scale (see ./time). */
  arrivalS: number;
  /** Actual departure when known, else planned. */
  departureS: number;
  serviceS: number;
}

/**
 * Where a technician is and when they can leave, given the route's stops in order (spec: Current position):
 * the in_progress stop, else the last done stop, else home. `stop` is the index into `stops`, null for home.
 * Known limitation: after a done stop we assume the technician is still there (no live location).
 */
export function currentPosition(stops: PositionStop[], shiftStartS: number, nowS: number): { stop: number | null; departureS: number } {
  const active = stops.findIndex((s) => s.status === 'in_progress');
  const last = active >= 0 ? active : stops.findLastIndex((s) => s.status === 'done');
  const at = stops[last];
  if (!at) return { stop: null, departureS: Math.max(shiftStartS, nowS) };
  return { stop: last, departureS: Math.max(at.status === 'in_progress' ? at.arrivalS + at.serviceS : at.departureS, nowS) };
}

/** A stored route stop as a position input: actual times win over planned ones. */
export function toPositionStop(
  s: { status: JobStatus; eta: Date; etd: Date; actualArrival: Date | null; actualDeparture: Date | null; serviceS: number },
  date: string,
): PositionStop {
  return {
    status: s.status,
    arrivalS: toDaySeconds(s.actualArrival ?? s.eta, date),
    departureS: toDaySeconds(s.actualDeparture ?? s.etd, date),
    serviceS: s.serviceS,
  };
}
