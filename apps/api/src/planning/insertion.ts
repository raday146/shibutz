// Pure insertion heuristic: try the new job in every slot after a technician's current position.
// Matrix cells are addressed by location index, like ./schedule.
import { scheduleRoute, type Schedule, type ScheduleInput, type ScheduleStop } from './schedule';

export type NewJob = ScheduleStop;

/** A technician's route from the current position on: `start` is the position, `stops` the not-yet-visited stops. */
export interface InsertionCandidate extends ScheduleInput {
  technicianId: number;
}

export interface InsertionOption {
  technicianId: number;
  /** The new job goes before `stops[slot]`; `slot === stops.length` means just before the trip home. */
  slot: number;
  /** t(a,new) + t(new,b) - t(a,b), where a/b are the neighbours in the old route. */
  detourS: number;
  /** Schedule of the whole route with the new job at `stops[slot]`. */
  schedule: Schedule;
  /** Position departure to arrival home. */
  totalS: number;
}

export interface InsertionRejection {
  technicianId: number;
  reason: 'ROUTE_ALREADY_LATE' | 'NO_FEASIBLE_POSITION';
}

/** Feasible options ranked by detour, then total route duration, then technician id (priority is ignored), plus rejections. */
export function suggestInsertions(
  candidates: InsertionCandidate[],
  job: NewJob,
  matrix: number[][],
): { options: InsertionOption[]; rejections: InsertionRejection[] } {
  const t = (from: number, to: number): number => matrix[from]?.[to] ?? Number.NaN;
  const options: InsertionOption[] = [];
  const rejections: InsertionRejection[] = [];

  for (const c of candidates) {
    if (scheduleRoute(c, matrix).violations.length) {
      rejections.push({ technicianId: c.technicianId, reason: 'ROUTE_ALREADY_LATE' });
      continue;
    }
    const found: InsertionOption[] = [];
    for (let slot = 0; slot <= c.stops.length; slot++) {
      const a = c.stops[slot - 1]?.index ?? c.start.index;
      const b = c.stops[slot]?.index ?? c.home.index;
      const stops = [...c.stops.slice(0, slot), job, ...c.stops.slice(slot)];
      const schedule = scheduleRoute({ ...c, stops }, matrix);
      if (schedule.violations.length) continue;
      found.push({
        technicianId: c.technicianId,
        slot,
        detourS: t(a, job.index) + t(job.index, b) - t(a, b),
        schedule,
        totalS: schedule.returnS - c.start.departureS,
      });
    }
    if (found.length) options.push(...found);
    else rejections.push({ technicianId: c.technicianId, reason: 'NO_FEASIBLE_POSITION' });
  }

  options.sort((x, y) => x.detourS - y.detourS || x.totalS - y.totalS || x.technicianId - y.technicianId || x.slot - y.slot);
  return { options, rejections };
}
