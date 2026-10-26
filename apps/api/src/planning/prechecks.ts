// Pure pre-checks run before VROOM; only passing jobs are sent to the solver.
import type { UnassignedReason } from '@shibutz/contracts';
import type { PlanJob, PlanTechnician } from './vroom-mapping';

export interface UnassignedJob {
  jobId: number;
  reason: UnassignedReason;
}

const skilled = (technicians: PlanTechnician[], job: PlanJob): PlanTechnician[] =>
  technicians.filter((t) => job.skillIds.every((s) => t.skillIds.includes(s)));

// A time window constrains when service STARTS (VROOM's semantics), so a long service is not a reason to drop a job.
function reasonFor(technicians: PlanTechnician[], job: PlanJob): UnassignedReason | undefined {
  const eligible = skilled(technicians, job);
  if (!eligible.length) return 'NO_SKILLED_TECHNICIAN';
  if (!eligible.some((t) => job.window[0] < t.shift[1] && job.window[1] > t.shift[0])) return 'WINDOW_OUTSIDE_ALL_SHIFTS';
  return undefined;
}

export function precheckJobs(technicians: PlanTechnician[], jobs: PlanJob[]): { passing: PlanJob[]; unassigned: UnassignedJob[] } {
  const passing: PlanJob[] = [];
  const unassigned: UnassignedJob[] = [];
  for (const job of jobs) {
    const reason = reasonFor(technicians, job);
    if (reason) unassigned.push({ jobId: job.id, reason });
    else passing.push(job);
  }
  return { passing, unassigned };
}

/**
 * Jobs for which no skilled technician has a road both from home and back.
 * `matrix` is indexed like `planLocations(technicians, jobs)`: homes first, then jobs.
 */
export function unreachableJobIds(technicians: PlanTechnician[], jobs: PlanJob[], matrix: (number | null)[][]): number[] {
  return jobs
    .filter((job, j) => {
      const col = technicians.length + j;
      return !skilled(technicians, job).some((t) => {
        const h = technicians.indexOf(t);
        return matrix[h]?.[col] != null && matrix[col]?.[h] != null;
      });
    })
    .map((j) => j.id);
}
