import request from 'supertest';
import { sql } from 'drizzle-orm';
import { INACTIVE_TECHNICIAN_MESSAGE } from '@shibutz/contracts';
import type { DayPlan, Job, LonLat, Technician } from '@shibutz/contracts';
import { DB, type Db } from '../src/db/db.module';
import { OsrmRoutingGateway } from '../src/gateways/osrm.gateway';
import { ROUTING_GATEWAY, SOLVER_GATEWAY } from '../src/gateways/ports';
import type { DurationMatrix, LineString, RoutingGateway } from '../src/gateways/ports';
import { VroomSolverGateway } from '../src/gateways/vroom.gateway';
import { setupTestApp } from './app';
import { describeIfUp } from './stack';

// Hand-built travel times: 100 s per 0.01 degree, Manhattan. Every point sits on lat 32.
const travel = (a: LonLat, b: LonLat): number => Math.round((Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) * 10_000);
const fakeRouting: RoutingGateway = {
  durationMatrix: async (points: LonLat[]): Promise<DurationMatrix> => points.map((a) => points.map((b) => travel(a, b))),
  routeGeometry: async (points: LonLat[]): Promise<LineString> => ({ type: 'LineString', coordinates: points }),
};
const at = (lon: number): LonLat => [lon, 32];

// 2026-07-01 is summer time in Israel (UTC+3).
const DATE = '2026-07-01';
const local = (hhmm: string, date = DATE): string => `${date}T${hhmm}:00+03:00`;
const ms = (iso: string): number => new Date(iso).getTime();

type Http = () => ReturnType<typeof request>;

async function seedDay(http: Http): Promise<{ technicians: Technician[]; jobs: Job[] }> {
  const skill = async (code: string): Promise<number> => (await http().post('/skills').send({ code, nameEn: code, nameHe: code }).expect(201)).body.id;
  const elec = await skill('ELEC');
  const plmb = await skill('PLMB');
  const carp = await skill('CARP');

  const technicians: Technician[] = [];
  for (const t of [
    { name: 'Avi', home: at(34.0), shiftStart: '08:00:00', shiftEnd: '12:00:00', skillIds: [elec] },
    { name: 'Bina', home: at(34.1), shiftStart: '09:00:00', shiftEnd: '17:00:00', skillIds: [elec, plmb] },
  ]) {
    technicians.push((await http().post('/technicians').send(t).expect(201)).body);
  }

  const job = (lon: number, skillIds: number[], from: string, to: string, serviceDurationS = 1800, date = DATE): object => ({
    title: 'Test job',
    address: '1 Test St',
    location: at(lon),
    skillIds,
    serviceDurationS,
    windowStart: local(from, date),
    windowEnd: local(to, date),
    priority: 50,
  });
  const jobs: Job[] = [];
  for (const j of [
    job(34.02, [elec], '08:00', '10:00'),
    job(34.08, [plmb], '13:00', '15:00'),
    job(34.05, [elec], '09:00', '17:00', 3600),
    job(34.06, [elec, plmb], '10:00', '16:00'),
    // Only Bina plumbs, and she cannot leave home (34.10, 09:00) and reach 34.01 by 09:10.
    job(34.01, [plmb], '08:00', '09:10'),
    // Nobody does carpentry.
    job(34.03, [carp], '09:00', '17:00'),
    // Another day: untouched.
    job(34.04, [elec], '09:00', '17:00', 1800, '2026-07-02'),
  ]) {
    jobs.push((await http().post('/jobs').send(j).expect(201)).body);
  }
  return { technicians, jobs };
}

async function countPlanRows(db: Db): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`select (select count(*) from routes) + (select count(*) from route_stops) as n`);
  return Number(rows[0]?.n);
}

describeIfUp('vroom')('POST /optimization/day/:date (real VROOM, fake routing)', () => {
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting));
  const http: Http = () => request(app().getHttpServer());

  it('assigns skilled technicians within windows and shifts, on routes from and back to home', async () => {
    const { technicians, jobs } = await seedDay(http);
    const [unreachableInTime, carpentry, otherDay] = jobs.slice(4).map((j) => j.id);

    const res = await http().post(`/optimization/day/${DATE}`).expect(201);
    const plan: DayPlan = res.body;

    expect(plan.date).toBe(DATE);
    expect(plan.unassigned.map((u) => u.jobId).sort()).toEqual([unreachableInTime, carpentry]);
    const routedIds = plan.routes.flatMap((r) => r.stops.map((s) => s.jobId));
    expect(routedIds.sort()).toEqual(jobs.slice(0, 4).map((j) => j.id));
    expect(plan.totalDriveS).toBe(plan.routes.reduce((sum, r) => sum + r.driveS, 0));

    for (const route of plan.routes) {
      const tech = technicians.find((t) => t.id === route.technicianId);
      if (!tech) throw new Error('unknown technician');
      const stops = route.stops.map((s) => ({ ...s, job: jobs.find((j) => j.id === s.jobId) as Job }));

      expect(route.jobCount).toBe(stops.length);
      expect(stops.map((s) => s.sequence)).toEqual(stops.map((_, i) => i + 1));

      const path = [tech.home, ...stops.map((s) => s.job.location), tech.home];
      const legs = path.slice(1).map((p, i) => travel(path[i] as LonLat, p));
      expect(route.driveS).toBe(legs.reduce((a, b) => a + b, 0));

      // Leaves home no earlier than shift start, is back home by shift end.
      const first = stops[0];
      const last = stops.at(-1);
      if (!first || !last) throw new Error('empty route');
      expect(ms(first.eta) - (legs[0] ?? 0) * 1000).toBeGreaterThanOrEqual(ms(local(tech.shiftStart.slice(0, 5))));
      expect(ms(last.etd) + (legs.at(-1) ?? 0) * 1000).toBeLessThanOrEqual(ms(local(tech.shiftEnd.slice(0, 5))));

      stops.forEach((s, i) => {
        expect(tech.skillIds).toEqual(expect.arrayContaining(s.job.skillIds));
        const serviceStart = ms(s.etd) - s.job.serviceDurationS * 1000;
        expect(serviceStart).toBeGreaterThanOrEqual(ms(s.job.windowStart));
        expect(serviceStart).toBeLessThanOrEqual(ms(s.job.windowEnd));
        expect(serviceStart).toBeGreaterThanOrEqual(ms(s.eta));
        const prev = stops[i - 1];
        if (prev) expect(ms(s.eta)).toBe(ms(prev.etd) + (legs[i] ?? 0) * 1000);
      });
    }

    const after: Job[] = (await http().get('/jobs').expect(200)).body;
    const status = (id: number | undefined): string | undefined => after.find((j) => j.id === id)?.status;
    expect(routedIds.map(status)).toEqual(routedIds.map(() => 'assigned'));
    expect([unreachableInTime, carpentry, otherDay].map(status)).toEqual(['unassigned', 'unassigned', 'unassigned']);
  });

  it('returns an empty plan for a day without jobs', async () => {
    await http()
      .post(`/optimization/day/${DATE}`)
      .expect(201, { date: DATE, totalDriveS: 0, routes: [], unassigned: [] });
  });

  it('rejects an invalid date', async () => {
    await http().post('/optimization/day/2026-13-01').expect(400);
  });
});

// Points at lon 35 have no road connection.
const nullRouting: RoutingGateway = {
  ...fakeRouting,
  durationMatrix: async (points: LonLat[]): Promise<DurationMatrix> =>
    points.map((a) => points.map((b) => (a[0] === 35 || b[0] === 35 ? (a === b ? 0 : null) : travel(a, b)))),
};

describeIfUp('vroom')('POST /optimization/day/:date unassigned reasons and replace (real VROOM)', () => {
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(nullRouting));
  const http: Http = () => request(app().getHttpServer());
  const db = (): Db => app().get<Db>(DB);

  async function skill(code: string): Promise<number> {
    return (await http().post('/skills').send({ code, nameEn: code, nameHe: code }).expect(201)).body.id;
  }
  async function tech(skillIds: number[]): Promise<number> {
    const body = { name: 'Avi', home: at(34.0), shiftStart: '08:00:00', shiftEnd: '12:00:00', skillIds };
    return (await http().post('/technicians').send(body).expect(201)).body.id;
  }
  async function job(skillIds: number[], lon: number, from: string, to: string, priority = 50, serviceDurationS = 1800): Promise<number> {
    const body = { title: 'Test job', address: '1 Test St', location: at(lon), skillIds, serviceDurationS, windowStart: local(from), windowEnd: local(to), priority };
    return (await http().post('/jobs').send(body).expect(201)).body.id;
  }
  async function snapshot(): Promise<unknown[]> {
    const { rows } = await db().execute(sql`
      select r.technician_id, r.version, s.job_id, s.sequence, s.eta, s.etd, j.status
      from routes r left join route_stops s on s.route_id = r.id left join jobs j on j.id = s.job_id
      order by r.technician_id, s.sequence`);
    return rows;
  }

  it('gives each pre-check reason, and NOT_FEASIBLE_IN_PLAN for what VROOM drops', async () => {
    const elec = await skill('ELEC');
    const carp = await skill('CARP');
    await tech([elec]);
    const noSkill = await job([carp], 34.01, '09:00', '10:00');
    const outsideShift = await job([elec], 34.01, '13:00', '15:00');
    // Service (30 min) is longer than the window (10 min): only the start is bounded, so it is planned.
    const tooLong = await job([elec], 34.01, '09:00', '09:10');
    const unreachable = await job([elec], 35, '09:00', '11:00');
    // Both need the 08:00-08:30 slot; the lower priority one loses.
    const kept = await job([elec], 34.01, '08:00', '08:30', 90);
    const dropped = await job([elec], 34.01, '08:00', '08:30', 10);

    const plan: DayPlan = (await http().post(`/optimization/day/${DATE}`).expect(201)).body;

    expect(plan.routes.flatMap((r) => r.stops.map((s) => s.jobId))).toEqual([kept, tooLong]);
    expect(plan.unassigned).toEqual(
      [
        { jobId: noSkill, reason: 'NO_SKILLED_TECHNICIAN' },
        { jobId: outsideShift, reason: 'WINDOW_OUTSIDE_ALL_SHIFTS' },
        { jobId: unreachable, reason: 'UNREACHABLE' },
        { jobId: dropped, reason: 'NOT_FEASIBLE_IN_PLAN' },
      ].sort((a, b) => a.jobId - b.jobId),
    );
  });

  it('stores the reason and run time of each unplanned job, clears them on assignment and leaves other dates alone', async () => {
    const elec = await skill('ELEC');
    const carp = await skill('CARP');
    await tech([elec]);
    const noSkill = await job([carp], 34.01, '09:00', '10:00');
    const kept = await job([elec], 34.01, '08:00', '08:30', 90);
    const dropped = await job([elec], 34.01, '08:00', '08:30', 10);
    const otherDay = (await http().post('/jobs').send({
      title: 'Later', address: 'x', location: at(34.01), skillIds: [carp], serviceDurationS: 600,
      windowStart: local('09:00', '2026-07-02'), windowEnd: local('10:00', '2026-07-02'), priority: 50,
    }).expect(201)).body.id;
    const reasonOf = async (id: number): Promise<[string | null, string | null]> => {
      const j: Job = (await http().get(`/jobs/${id}`).expect(200)).body;
      return [j.unassignedReason, j.unassignedAt];
    };

    const before = Date.now();
    await http().post(`/optimization/day/${DATE}`).expect(201);
    const [noSkillReason, noSkillAt] = await reasonOf(noSkill);
    expect(noSkillReason).toBe('NO_SKILLED_TECHNICIAN');
    expect(Date.parse(noSkillAt ?? '')).toBeGreaterThanOrEqual(before - 1000);
    expect((await reasonOf(dropped))[0]).toBe('NOT_FEASIBLE_IN_PLAN');
    expect(await reasonOf(kept)).toEqual([null, null]);
    expect(await reasonOf(otherDay)).toEqual([null, null]);

    // The other date keeps whatever it had; swapping priorities swaps who is placed.
    await db().execute(sql`update jobs set unassigned_reason = 'UNREACHABLE', unassigned_at = now() where id = ${otherDay}`);
    await http().patch(`/jobs/${dropped}`).send({ priority: 100 }).expect(200);
    expect((await reasonOf(dropped))[0]).toBe('NOT_FEASIBLE_IN_PLAN'); // priority is not a requirement
    await http().post(`/optimization/day/${DATE}`).expect(201);
    expect(await reasonOf(dropped)).toEqual([null, null]);
    expect((await reasonOf(kept))[0]).toBe('NOT_FEASIBLE_IN_PLAN');
    expect((await reasonOf(otherDay))[0]).toBe('UNREACHABLE');
  });

  it('clears the stored reason when skills, location, duration or window change, not for title or address', async () => {
    const elec = await skill('ELEC');
    const carp = await skill('CARP');
    await tech([elec]);
    const id = await job([carp], 34.01, '09:00', '10:00');
    const stored = async (): Promise<string | null> => ((await http().get(`/jobs/${id}`).expect(200)).body as Job).unassignedReason;
    const replan = async (): Promise<void> => void (await http().post(`/optimization/day/${DATE}`).expect(201));
    await replan();

    await http().patch(`/jobs/${id}`).send({ title: 'Renamed', address: 'Elsewhere' }).expect(200);
    expect(await stored()).toBe('NO_SKILLED_TECHNICIAN');
    const changes: object[] = [
      { skillIds: [carp, elec] },
      { location: at(34.02) },
      { serviceDurationS: 900 },
      { windowStart: local('09:30') },
      { windowEnd: local('11:00') },
    ];
    for (const change of changes) {
      await replan();
      expect(await stored()).not.toBeNull();
      await http().patch(`/jobs/${id}`).send(change).expect(200);
      expect(await stored()).toBeNull();
      await http().patch(`/jobs/${id}`).send({ skillIds: [carp], serviceDurationS: 1800, location: at(34.01), windowStart: local('09:00'), windowEnd: local('10:00') }).expect(200);
    }
  });

  it('replaces the day idempotently, bumps versions and releases jobs that no longer fit', async () => {
    const elec = await skill('ELEC');
    const carp = await skill('CARP');
    await tech([elec]);
    const a = await job([elec], 34.01, '08:00', '11:00');
    const b = await job([elec], 34.02, '08:00', '11:00');

    const first: DayPlan = (await http().post(`/optimization/day/${DATE}`).expect(201)).body;
    const afterFirst = await snapshot();
    const second: DayPlan = (await http().post(`/optimization/day/${DATE}`).expect(201)).body;
    const afterSecond = await snapshot();

    expect(second).toEqual(first);
    expect(afterFirst.map((r) => (r as { version: number }).version)).toEqual([1, 1]);
    expect(afterSecond.map((r) => (r as { version: number }).version)).toEqual([2, 2]);
    expect(afterSecond.map((r) => ({ ...(r as object), version: 0 }))).toEqual(afterFirst.map((r) => ({ ...(r as object), version: 0 })));

    // b becomes unplaceable: it must go back to unassigned and leave the route.
    await http().patch(`/jobs/${b}/status`).send({ status: 'unassigned' }).expect(200);
    await http().patch(`/jobs/${b}`).send({ skillIds: [carp] }).expect(200);
    const third: DayPlan = (await http().post(`/optimization/day/${DATE}`).expect(201)).body;

    expect(third.routes.flatMap((r) => r.stops.map((s) => s.jobId))).toEqual([a]);
    expect(third.unassigned).toEqual([{ jobId: b, reason: 'NO_SKILLED_TECHNICIAN' }]);
    const jobs: Job[] = (await http().get('/jobs').expect(200)).body;
    expect(jobs.find((j) => j.id === b)?.status).toBe('unassigned');
    expect(jobs.find((j) => j.id === a)?.status).toBe('assigned');
  });

  it.each(['in_progress', 'done'])('returns 409 and changes nothing when a stop that day is %s', async (status) => {
    const elec = await skill('ELEC');
    await tech([elec]);
    const a = await job([elec], 34.01, '08:00', '11:00');
    await job([elec], 34.02, '08:00', '11:00');
    await http().post(`/optimization/day/${DATE}`).expect(201);
    await db().execute(sql`update jobs set status = ${status}::job_status where id = ${a}`);
    const before = await snapshot();

    await http().post(`/optimization/day/${DATE}`).expect(409);

    expect(await snapshot()).toEqual(before);
  });
});

describe('POST /optimization/day/:date racing a status change', () => {
  let startJob: (() => Promise<void>) | undefined;
  const routing: RoutingGateway = { ...fakeRouting, durationMatrix: async (p) => (await startJob?.(), fakeRouting.durationMatrix(p)) };
  const solver = { solve: async (): Promise<never> => ({ code: 0, routes: [], unassigned: [] }) as never };
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(routing).overrideProvider(SOLVER_GATEWAY).useValue(solver));
  const http: Http = () => request(app().getHttpServer());

  it('returns 409 when a job of the day starts after the first check, and writes nothing', async () => {
    const { id: elec } = (await http().post('/skills').send({ code: 'ELEC', nameEn: 'ELEC', nameHe: 'ELEC' }).expect(201)).body;
    await http().post('/technicians').send({ name: 'Avi', home: at(34.0), shiftStart: '08:00:00', shiftEnd: '12:00:00', skillIds: [elec] }).expect(201);
    const body = { title: 'Test job', address: '1 Test St', location: at(34.01), skillIds: [elec], serviceDurationS: 600, windowStart: local('08:00'), windowEnd: local('11:00'), priority: 50 };
    const { id } = (await http().post('/jobs').send(body).expect(201)).body;
    startJob = async () => void (await app().get<Db>(DB).execute(sql`update jobs set status = 'done'::job_status where id = ${id}`));

    await http().post(`/optimization/day/${DATE}`).expect(409);

    expect(await countPlanRows(app().get<Db>(DB))).toBe(0);
    expect(((await http().get(`/jobs/${id}`)).body as Job).status).toBe('done');
  });
});

describeIfUp('vroom')('POST /optimization/day/:date and inactive technicians (real VROOM, fake routing)', () => {
  let beforeSolve: (() => Promise<void>) | undefined;
  const routing: RoutingGateway = { ...fakeRouting, durationMatrix: async (p) => (await beforeSolve?.(), fakeRouting.durationMatrix(p)) };
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(routing));
  const http: Http = () => request(app().getHttpServer());
  beforeEach(() => { beforeSolve = undefined; });

  async function twoTechniciansAndAJob(): Promise<{ avi: number; bina: number }> {
    const mk = async (name: string, lon: number): Promise<number> =>
      (await http().post('/technicians').send({ name, home: at(lon), shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] }).expect(201)).body.id;
    const [avi, bina] = [await mk('Avi', 34.0), await mk('Bina', 34.1)];
    const job = { title: 'Test job', address: '1 Test St', location: at(34.01), skillIds: [], serviceDurationS: 600, windowStart: local('08:00'), windowEnd: local('16:00'), priority: 50 };
    await http().post('/jobs').send(job).expect(201);
    return { avi, bina };
  }

  it('never plans a deactivated technician, even the nearest one', async () => {
    const { avi, bina } = await twoTechniciansAndAJob();
    await http().post(`/technicians/${avi}/deactivate`).send({ version: 0 }).expect(201);

    const plan: DayPlan = (await http().post(`/optimization/day/${DATE}`).expect(201)).body;

    expect(plan.routes.map((r) => r.technicianId)).toEqual([bina]);
  });

  it('returns 409 and writes nothing when a technician is deactivated after planning started', async () => {
    const { avi, bina } = await twoTechniciansAndAJob();
    beforeSolve = async () => void (await http().post(`/technicians/${avi}/deactivate`).send({ version: 0 }).expect(201));
    await http().delete(`/technicians/${bina}`).expect(204); // Avi is the only technician, so the job goes to Avi

    const res = await http().post(`/optimization/day/${DATE}`).expect(409);

    expect(res.body.message).toBe(INACTIVE_TECHNICIAN_MESSAGE);
    expect(await countPlanRows(app().get<Db>(DB))).toBe(0);
  });
});

describe.each([
  ['OSRM', ROUTING_GATEWAY, new OsrmRoutingGateway('http://127.0.0.1:9')],
  ['VROOM', SOLVER_GATEWAY, new VroomSolverGateway('http://127.0.0.1:9')],
])('POST /optimization/day/:date with %s down', (service, token, gateway) => {
  const app = setupTestApp((b) =>
    (token === SOLVER_GATEWAY ? b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting) : b).overrideProvider(token).useValue(gateway),
  );
  const http: Http = () => request(app().getHttpServer());

  it(`responds 503 naming ${service} and writes nothing`, async () => {
    await seedDay(http);

    const res = await http().post(`/optimization/day/${DATE}`).expect(503);

    expect(res.body.message).toMatch(new RegExp(`^${service} unavailable`));
    const jobs: Job[] = (await http().get('/jobs').expect(200)).body;
    expect(jobs.every((j) => j.status === 'unassigned')).toBe(true);
    expect(await countPlanRows(app().get<Db>(DB))).toBe(0);
  });
});
