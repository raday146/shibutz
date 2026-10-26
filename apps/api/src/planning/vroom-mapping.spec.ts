import { fromVroomSolution, planLocations, toVroomPayload, vroomSolutionSchema } from './vroom-mapping';
import type { PlanJob, PlanTechnician } from './vroom-mapping';

// |lon| > 90 so a swapped pair could never be a valid [lon, lat].
const HOME_A: [number, number] = [100.5, 13.7];
const HOME_B: [number, number] = [100.6, 13.8];
const JOB_X: [number, number] = [100.7, 13.9];

const technicians: PlanTechnician[] = [
  { id: 7, home: HOME_A, skillIds: [1, 2], shift: [28800, 61200] },
  { id: 9, home: HOME_B, skillIds: [], shift: [32400, 50400] },
];
const jobs: PlanJob[] = [{ id: 42, location: JOB_X, skillIds: [2], serviceS: 1800, window: [36000, 43200], priority: 80 }];
const durations = [
  [0, 10, 20],
  [11, 0, 30],
  [21, 31, 0],
];

describe('VROOM mapping', () => {
  it('lists homes then job locations, keeping [lon, lat]', () => {
    expect(planLocations(technicians, jobs)).toEqual([HOME_A, HOME_B, JOB_X]);
  });

  it('maps the domain to a custom-matrix payload with integer ids and indices into planLocations', () => {
    expect(toVroomPayload(technicians, jobs, durations)).toEqual({
      vehicles: [
        { id: 7, start: HOME_A, end: HOME_A, start_index: 0, end_index: 0, skills: [1, 2], time_window: [28800, 61200] },
        { id: 9, start: HOME_B, end: HOME_B, start_index: 1, end_index: 1, skills: [], time_window: [32400, 50400] },
      ],
      jobs: [
        { id: 42, location: JOB_X, location_index: 2, skills: [2], service: 1800, time_windows: [[36000, 43200]], priority: 80 },
      ],
      matrices: { car: { durations } },
    });
  });

  it('maps a solution to stops with VROOM arrival times and departure after waiting and service', () => {
    const solution = vroomSolutionSchema.parse({
      code: 0,
      unassigned: [{ id: 43, type: 'job' }],
      routes: [
        {
          vehicle: 7,
          duration: 41,
          steps: [
            { type: 'start', arrival: 35990, duration: 0, setup: 0, service: 0, waiting_time: 0 },
            { type: 'job', id: 42, arrival: 36000 - 50, duration: 20, setup: 0, service: 1800, waiting_time: 50 },
            { type: 'end', arrival: 37821, duration: 41, setup: 0, service: 0, waiting_time: 0 },
          ],
        },
      ],
    });

    expect(fromVroomSolution(solution)).toEqual({
      routes: [{ technicianId: 7, driveS: 41, stops: [{ jobId: 42, arrivalS: 35950, departureS: 37800 }] }],
      unassignedJobIds: [43],
    });
  });

  it('rejects a solution with an error code', () => {
    expect(vroomSolutionSchema.safeParse({ code: 2, error: 'Invalid input' }).success).toBe(false);
  });
});
