// scheduleRoute against real VROOM: same rounded matrix in, identical arrival times out.
import type { LonLat } from '@shibutz/contracts';
import { VroomSolverGateway } from '../src/gateways/vroom.gateway';
import { scheduleRoute } from '../src/planning/schedule';
import { fromVroomSolution, toVroomPayload } from '../src/planning/vroom-mapping';
import type { PlanJob, PlanTechnician } from '../src/planning/vroom-mapping';
import { describeIfUp, VROOM_URL } from './stack';

// Deterministic, asymmetric integer travel times (60..659 s) between 2 homes and 10 jobs.
const TECHS = 2;
const JOBS = 10;
const matrix = Array.from({ length: TECHS + JOBS }, (_, i) =>
  Array.from({ length: TECHS + JOBS }, (_, j) => (i === j ? 0 : 60 + ((i * 37 + j * 91 + i * j * 13) % 600))),
);
const point: LonLat = [34, 32]; // locations are irrelevant: VROOM only sees the matrix

const technicians: PlanTechnician[] = [1, 2].map((id) => ({ id, home: point, skillIds: [], shift: [28_800, 61_200] }));
// Staggered windows force waiting at some stops.
const jobs: PlanJob[] = Array.from({ length: JOBS }, (_, i) => ({
  id: 100 + i,
  location: point,
  skillIds: [],
  serviceS: 300 + 60 * (i % 4),
  window: [29_000 + 3_000 * i, 36_000 + 3_000 * i],
  priority: 50,
}));

describeIfUp('vroom')('scheduleRoute vs VROOM', () => {
  it('reproduces VROOM arrival and departure times exactly from the same matrix', async () => {
    const solution = await new VroomSolverGateway(VROOM_URL).solve(toVroomPayload(technicians, jobs, matrix));
    const planned = fromVroomSolution(solution);
    expect(planned.routes.length).toBeGreaterThan(0);

    let waited = 0;
    for (const [r, route] of planned.routes.entries()) {
      const tech = technicians.findIndex((t) => t.id === route.technicianId);
      const startStep = solution.routes[r]?.steps.find((s) => s.type === 'start');
      const technician = technicians[tech];
      if (!startStep || !technician) throw new Error('missing start step');

      const stops = route.stops.map((s) => {
        const position = jobs.findIndex((j) => j.id === s.jobId);
        const job = jobs[position];
        if (!job) throw new Error('unknown job');
        return { index: TECHS + position, window: job.window, serviceS: job.serviceS };
      });
      const result = scheduleRoute(
        { start: { index: tech, departureS: startStep.arrival }, stops, home: { index: tech, shiftEndS: technician.shift[1] } },
        matrix,
      );

      expect(result.stops.map((s) => [s.arrivalS, s.departureS])).toEqual(route.stops.map((s) => [s.arrivalS, s.departureS]));
      expect(result.violations).toEqual([]);
      const end = solution.routes[r]?.steps.find((s) => s.type === 'end');
      expect(result.returnS).toBe(end?.arrival);
      waited += result.stops.filter((s) => s.startS > s.arrivalS).length;
    }
    // The fixture must exercise waiting, otherwise the exact match proves little.
    expect(waited).toBeGreaterThan(0);
  });
});
