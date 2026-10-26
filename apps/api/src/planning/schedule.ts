// Pure route scheduling: forward propagation over a duration matrix (seconds, see ./time for the scale).
// Matrix cells are addressed by location index, like the VROOM mapping.

export interface ScheduleStop {
  index: number;
  window: [start: number, end: number];
  serviceS: number;
}

export interface ScheduleInput {
  start: { index: number; departureS: number };
  stops: ScheduleStop[];
  /** Final leg back home, checked against the shift end. */
  home: { index: number; shiftEndS: number };
}

export type Violation = { kind: 'late'; stop: number } | { kind: 'after_shift_end' };

export interface Schedule {
  stops: { arrivalS: number; startS: number; departureS: number }[];
  returnS: number;
  violations: Violation[];
}

/** arrival = previous departure + travel; service starts at max(arrival, window start); departure = start + service. */
export function scheduleRoute({ start, stops, home }: ScheduleInput, matrix: number[][]): Schedule {
  const travel = (from: number, to: number): number => matrix[from]?.[to] ?? Number.NaN;
  const violations: Violation[] = [];
  let at = start.index;
  let departureS = start.departureS;

  const scheduled = stops.map((stop, position) => {
    const arrivalS = departureS + travel(at, stop.index);
    const startS = Math.max(arrivalS, stop.window[0]);
    if (startS > stop.window[1]) violations.push({ kind: 'late', stop: position });
    at = stop.index;
    departureS = startS + stop.serviceS;
    return { arrivalS, startS, departureS };
  });

  const returnS = departureS + travel(at, home.index);
  if (returnS > home.shiftEndS) violations.push({ kind: 'after_shift_end' });
  return { stops: scheduled, returnS, violations };
}
