import { precheckJobs, unreachableJobIds } from './prechecks';
import type { PlanJob, PlanTechnician } from './vroom-mapping';

const tech = (id: number, skillIds: number[], shift: [number, number]): PlanTechnician => ({ id, home: [100.5, 13.7], skillIds, shift });
const job = (id: number, skillIds: number[], window: [number, number], serviceS = 600): PlanJob => ({
  id,
  location: [100.6, 13.8],
  skillIds,
  serviceS,
  window,
  priority: 50,
});

describe('precheckJobs', () => {
  const technicians = [tech(1, [1], [28800, 43200]), tech(2, [1, 2], [50400, 64800])];

  it('reports each reason and passes the rest', () => {
    const jobs = [
      job(10, [9], [30000, 40000]), // nobody has skill 9
      job(11, [1], [70000, 80000]), // after every shift
      job(12, [2], [30000, 40000]), // only tech 2 has skill 2, and its shift starts later
      job(13, [1], [30000, 30100], 600), // service longer than the window
      job(14, [1], [30000, 40000]),
    ];

    const { passing, unassigned } = precheckJobs(technicians, jobs);

    expect(unassigned).toEqual([
      { jobId: 10, reason: 'NO_SKILLED_TECHNICIAN' },
      { jobId: 11, reason: 'WINDOW_OUTSIDE_ALL_SHIFTS' },
      { jobId: 12, reason: 'WINDOW_OUTSIDE_ALL_SHIFTS' },
      { jobId: 13, reason: 'SERVICE_EXCEEDS_WINDOW' },
    ]);
    expect(passing.map((j) => j.id)).toEqual([14]);
  });

  it('treats a day without technicians as no skilled technician', () => {
    expect(precheckJobs([], [job(1, [], [0, 100])]).unassigned).toEqual([{ jobId: 1, reason: 'NO_SKILLED_TECHNICIAN' }]);
  });
});

describe('unreachableJobIds', () => {
  const technicians = [tech(1, [1], [0, 1000]), tech(2, [2], [0, 1000])];
  const jobs = [job(10, [1], [0, 1000]), job(11, [1], [0, 1000]), job(12, [2], [0, 1000])];
  // [from][to]; indices: 0-1 homes, 2-4 jobs 10-12.
  const matrix = [
    [0, 5, 1, null, 7], // tech 1 home -> job 11: no road
    [5, 0, 1, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 1, 0, 1],
    [1, 1, 1, 1, 0],
  ];

  it('flags a job no skilled technician can reach and return from', () => {
    expect(unreachableJobIds(technicians, jobs, matrix)).toEqual([11]);
  });
});
