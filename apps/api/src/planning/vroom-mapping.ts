// Pure mapping between the domain and VROOM v1.15 (custom matrix, no router).
// All times are seconds since local midnight of the plan date (see ./time).
import { z } from 'zod';
import type { LonLat } from '@shibutz/contracts';

export interface PlanTechnician {
  id: number;
  home: LonLat;
  skillIds: number[];
  shift: [start: number, end: number];
}

export interface PlanJob {
  id: number;
  location: LonLat;
  skillIds: number[];
  serviceS: number;
  window: [start: number, end: number];
  priority: number;
}

export interface VroomPayload {
  vehicles: {
    id: number;
    start: LonLat;
    end: LonLat;
    start_index: number;
    end_index: number;
    skills: number[];
    time_window: [number, number];
  }[];
  jobs: {
    id: number;
    location: LonLat;
    location_index: number;
    skills: number[];
    service: number;
    time_windows: [number, number][];
    priority: number;
  }[];
  matrices: { car: { durations: number[][] } };
}

const int = z.number().int();
export const vroomSolutionSchema = z.object({
  code: z.literal(0),
  unassigned: z.array(z.object({ id: int })),
  routes: z.array(
    z.object({
      vehicle: int,
      duration: int,
      steps: z.array(
        z.object({ type: z.string(), id: int.optional(), arrival: int, setup: int, service: int, waiting_time: int }),
      ),
    }),
  ),
});
export type VroomSolution = z.infer<typeof vroomSolutionSchema>;

export interface PlannedRoute {
  technicianId: number;
  /** Total travel including the return home. */
  driveS: number;
  stops: { jobId: number; arrivalS: number; departureS: number }[];
}

/** Matrix locations: technician homes first, then jobs, in input order. */
export function planLocations(technicians: PlanTechnician[], jobs: PlanJob[]): LonLat[] {
  return [...technicians.map((t) => t.home), ...jobs.map((j) => j.location)];
}

export function toVroomPayload(technicians: PlanTechnician[], jobs: PlanJob[], durations: number[][]): VroomPayload {
  return {
    vehicles: technicians.map((t, i) => ({
      id: t.id,
      start: t.home,
      end: t.home,
      start_index: i,
      end_index: i,
      skills: t.skillIds,
      time_window: t.shift,
    })),
    jobs: jobs.map((j, i) => ({
      id: j.id,
      location: j.location,
      location_index: technicians.length + i,
      skills: j.skillIds,
      service: j.serviceS,
      time_windows: [j.window],
      priority: j.priority,
    })),
    matrices: { car: { durations } },
  };
}

export function fromVroomSolution(solution: VroomSolution): { routes: PlannedRoute[]; unassignedJobIds: number[] } {
  return {
    routes: solution.routes.map((r) => ({
      technicianId: r.vehicle,
      driveS: r.duration,
      stops: r.steps.flatMap((s) =>
        s.type === 'job' && s.id !== undefined
          ? [{ jobId: s.id, arrivalS: s.arrival, departureS: s.arrival + s.waiting_time + s.setup + s.service }]
          : [],
      ),
    })),
    unassignedJobIds: solution.unassigned.map((u) => u.id),
  };
}
