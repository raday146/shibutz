// Heuristic vs VROOM comparison on the hand-built scenario (spec #1, stories 62-64).
// In memory: real OSRM matrix (one rounded matrix for both approaches) and real VROOM, no database.
import type { JobStatus } from '@shibutz/contracts';
import { OsrmRoutingGateway } from '../gateways/osrm.gateway';
import { requireReachable } from '../gateways/ports';
import { suggestInsertions, type InsertionCandidate } from '../planning/insertion';
import { currentPosition } from '../planning/position';
import { scheduleRoute } from '../planning/schedule';
import { toDaySeconds, wallClockDaySeconds } from '../planning/time';
import {
  fromVroomSolution,
  planLocations,
  toVroomPayload,
  vroomSolutionSchema,
  type PlanJob,
  type PlanTechnician,
  type VroomPayload,
  type VroomSolution,
} from '../planning/vroom-mapping';
import { SEED_DAY, comparisonScenario as scenario } from './datasets';

/** Travel seconds along a path of matrix location indexes. */
export function driveS(path: number[], matrix: number[][]): number {
  return path.slice(1).reduce((sum, to, i) => sum + (matrix[path[i] ?? 0]?.[to] ?? Number.NaN), 0);
}

export function addedDriveS(beforeS: number, afterS: number): number {
  return afterS - beforeS;
}

type SeededVehicle = VroomPayload['vehicles'][number] & { steps: { type: 'start' | 'job' | 'end'; id?: number }[] };

const min = (s: number): string => `${(s / 60).toFixed(1)} min`;
const secs = (iso: string): number => toDaySeconds(new Date(iso), SEED_DAY);

async function solve(url: string, payload: unknown): Promise<{ solution: VroomSolution } | { error: string }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body: unknown = await res.json();
  if (!res.ok) return { error: `HTTP ${res.status} ${JSON.stringify(body)}` };
  return { solution: vroomSolutionSchema.parse(body) };
}

async function main(): Promise<void> {
  const nowS = secs(scenario.now);
  const nTech = scenario.technicians.length;
  const allJobs = [...scenario.jobs, scenario.newJob];
  const newId = allJobs.length;
  const techs: PlanTechnician[] = scenario.technicians.map((t, i) => ({
    id: i + 1,
    home: t.home,
    skillIds: t.skillIds,
    shift: [wallClockDaySeconds(t.shiftStart, SEED_DAY), wallClockDaySeconds(t.shiftEnd, SEED_DAY)],
  }));
  const jobs: PlanJob[] = allJobs.map((j, i) => ({
    id: i + 1,
    location: j.location,
    skillIds: j.skillIds,
    serviceS: j.serviceDurationS,
    window: [secs(j.windowStart), secs(j.windowEnd)],
    priority: j.priority,
  }));
  const jobIndex = (id: number): number => nTech + id - 1;
  const newJob = { index: jobIndex(newId), window: jobs[newId - 1]?.window ?? [0, 0], serviceS: scenario.newJob.serviceDurationS } as const;

  const osrm = new OsrmRoutingGateway(process.env.OSRM_URL ?? 'http://localhost:5001');
  const matrix = requireReachable(await osrm.durationMatrix(planLocations(techs, jobs)));

  // Each technician's remaining route from the current position (done stops excluded).
  const state = techs.map((t, i) => {
    const route = scenario.routes.find((r) => r.technicianId === t.id)?.jobIds ?? [];
    const planned = scheduleRoute(
      {
        start: { index: i, departureS: t.shift[0] },
        stops: route.map((id) => ({ index: jobIndex(id), window: jobs[id - 1]?.window ?? [0, 0], serviceS: jobs[id - 1]?.serviceS ?? 0 })),
        home: { index: i, shiftEndS: t.shift[1] },
      },
      matrix,
    );
    const pos = currentPosition(
      route.map((id, k) => ({
        status: (scenario.doneJobIds.includes(id) ? 'done' : 'assigned') satisfies JobStatus,
        arrivalS: planned.stops[k]?.arrivalS ?? 0,
        departureS: planned.stops[k]?.departureS ?? 0,
        serviceS: jobs[id - 1]?.serviceS ?? 0,
      })),
      t.shift[0],
      nowS,
    );
    const remaining = route.slice((pos.stop ?? -1) + 1);
    const startIndex = pos.stop === null ? i : jobIndex(route[pos.stop] ?? 0);
    return { tech: t, name: scenario.technicians[i]?.name ?? '', home: i, remaining, startIndex, departureS: pos.departureS };
  });
  const baselineS = state.reduce((sum, s) => sum + driveS([s.startIndex, ...s.remaining.map(jobIndex), s.home], matrix), 0);

  console.log(`Comparison on ${SEED_DAY}, now = ${scenario.now} (done jobs: ${scenario.doneJobIds.join(', ')}); new job ${newId} needs skills ${scenario.newJob.skillIds.join(', ')}`);
  for (const s of state) {
    console.log(`  ${s.name}: at location ${s.startIndex === s.home ? 'home' : `job ${s.startIndex - nTech + 1}`}, leaves ${min(s.departureS - nowS)} after now, remaining jobs [${s.remaining.join(', ')}]`);
  }
  console.log(`  Existing remaining routes, fleet drive time: ${min(baselineS)}`);

  // (a) heuristic: existing order kept
  const candidates: (InsertionCandidate & { name: string })[] = state
    .filter((s) => scenario.newJob.skillIds.every((k) => s.tech.skillIds.includes(k)))
    .map((s) => ({
      name: s.name,
      technicianId: s.tech.id,
      start: { index: s.startIndex, departureS: s.departureS },
      stops: s.remaining.map((id) => ({ index: jobIndex(id), window: jobs[id - 1]?.window ?? [0, 0], serviceS: jobs[id - 1]?.serviceS ?? 0 })),
      home: { index: s.home, shiftEndS: s.tech.shift[1] },
    }));
  const { options, rejections } = suggestInsertions(candidates, newJob, matrix);
  console.log('\n(a) Insertion heuristic (existing order kept)');
  const best = options[0];
  if (!best) console.log(`  No feasible insertion. Rejections: ${JSON.stringify(rejections)}`);
  else {
    const s = state[best.technicianId - 1];
    const route = s ? [...s.remaining.slice(0, best.slot), newId, ...s.remaining.slice(best.slot)] : [];
    const afterS = baselineS - driveS([s?.startIndex ?? 0, ...(s?.remaining ?? []).map(jobIndex), s?.home ?? 0], matrix) + driveS([s?.startIndex ?? 0, ...route.map(jobIndex), s?.home ?? 0], matrix);
    console.log(`  Chosen technician: ${s?.name} (slot ${best.slot}, route [${route.join(', ')}])`);
    console.log(`  Total drive time: ${min(afterS)}`);
    console.log(`  New job added drive time: ${min(addedDriveS(baselineS, afterS))}`);
  }

  // (b) VROOM free re-optimization from current positions, existing stops as initial steps
  const base = toVroomPayload(techs, jobs, matrix);
  const done = new Set(scenario.doneJobIds);
  const payload = (withSteps: boolean): object => ({
    ...base,
    jobs: base.jobs.filter((j) => !done.has(j.id)),
    vehicles: base.vehicles.map((v, i): SeededVehicle | VroomPayload['vehicles'][number] => {
      const s = state[i];
      if (!s) return v;
      const moved = { ...v, start: jobStartLocation(s.startIndex), start_index: s.startIndex, time_window: [s.departureS, s.tech.shift[1]] as [number, number] };
      return withSteps
        ? { ...moved, steps: [{ type: 'start' }, ...s.remaining.map((id) => ({ type: 'job' as const, id })), { type: 'end' }] }
        : moved;
    }),
  });
  function jobStartLocation(index: number): VroomPayload['vehicles'][number]['start'] {
    return planLocations(techs, jobs)[index] ?? [0, 0];
  }
  const vroomUrl = process.env.VROOM_URL ?? 'http://localhost:3000';
  console.log('\n(b) VROOM free re-optimization (current positions, done excluded)');
  let result = await solve(vroomUrl, payload(true));
  if ('error' in result) {
    console.log(`  Seeded steps rejected by VROOM (${result.error}); retrying without steps`);
    result = await solve(vroomUrl, payload(false));
  } else console.log('  Existing stops accepted as initial steps');
  if ('error' in result) {
    console.log(`  VROOM failed: ${result.error}`);
    return;
  }
  const { routes, unassignedJobIds } = fromVroomSolution(result.solution);
  const totalS = routes.reduce((sum, r) => sum + r.driveS, 0);
  for (const r of routes) console.log(`  ${state[r.technicianId - 1]?.name}: jobs [${r.stops.map((x) => x.jobId).join(', ')}], drive ${min(r.driveS)}`);
  console.log(`  Total drive time: ${min(totalS)}`);
  const taker = routes.find((r) => r.stops.some((x) => x.jobId === newId));
  if (!taker) console.log(`  New job ${newId} left unassigned (unassigned: [${unassignedJobIds.join(', ')}]); this is a valid outcome`);
  else {
    console.log(`  Chosen technician: ${state[taker.technicianId - 1]?.name}`);
    console.log(`  New job added drive time: ${min(addedDriveS(baselineS, totalS))} (vs the existing routes above; VROOM may also reorder other stops)`);
    if (unassignedJobIds.length) console.log(`  Unassigned: [${unassignedJobIds.join(', ')}]`);
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
