import request from 'supertest';
import { ServiceUnavailableException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { InsertionSuggestions, Job, JobStatus, LonLat } from '@shibutz/contracts';
import { CLOCK } from '../src/clock/clock';
import { DB, type Db } from '../src/db/db.module';
import { jobs as jobsTable, routeStops, routes } from '../src/db/schema';
import { ROUTING_GATEWAY } from '../src/gateways/ports';
import type { DurationMatrix, LineString, RoutingGateway } from '../src/gateways/ports';
import { setupTestApp } from './app';

// Hand-built travel times: 100 s per 0.01 degree of longitude (about 0.94 km), every point on lat 32.
const travel = (a: LonLat, b: LonLat): number => Math.round(Math.abs(a[0] - b[0]) * 10_000);
let matrixCalls = 0;
let routingDown = false;
const fakeRouting: RoutingGateway = {
  durationMatrix: async (points: LonLat[]): Promise<DurationMatrix> => {
    matrixCalls += 1;
    if (routingDown) throw new ServiceUnavailableException('OSRM unavailable: fake');
    return points.map((a) => points.map((b) => travel(a, b)));
  },
  routeGeometry: async (points: LonLat[]): Promise<LineString> => ({ type: 'LineString', coordinates: points }),
};

const DATE = '2026-07-01'; // summer time, UTC+3
const local = (hms: string): string => new Date(`${DATE}T${hms}+03:00`).toISOString();
let now = new Date(local('07:00:00'));

describe('POST /jobs/:id/insertion-suggestions (fake routing, fake clock)', () => {
  const app = setupTestApp((b) =>
    b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting).overrideProvider(CLOCK).useValue({ now: () => now }),
  );
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());
  const db = (): Db => app().get<Db>(DB);

  beforeEach(() => {
    now = new Date(local('07:00:00'));
    matrixCalls = 0;
    routingDown = false;
    delete process.env.INSERTION_RADIUS_M;
  });
  afterAll(() => {
    delete process.env.INSERTION_RADIUS_M;
  });

  async function skill(code: string): Promise<number> {
    return (await http().post('/skills').send({ code, nameEn: code, nameHe: code }).expect(201)).body.id;
  }

  async function technician(homeLon: number, skillIds: number[] = []): Promise<number> {
    const body = { name: `T${homeLon}`, home: [homeLon, 32], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds };
    return (await http().post('/technicians').send(body).expect(201)).body.id;
  }

  async function job(lon: number, o: { status?: JobStatus; skillIds?: number[]; window?: [string, string] } = {}): Promise<Job> {
    const [from, to] = o.window ?? ['08:00:00', '17:00:00'];
    const body = {
      title: 'Test job',
      address: '1 Test St',
      location: [lon, 32],
      skillIds: o.skillIds ?? [],
      serviceDurationS: 600,
      windowStart: local(from),
      windowEnd: local(to),
      priority: 50,
    };
    const created: Job = (await http().post('/jobs').send(body).expect(201)).body;
    if (o.status) await db().update(jobsTable).set({ status: o.status }).where(eq(jobsTable.id, created.id));
    return created;
  }

  /** A route (version 1) whose stops are given in order; planned times are placeholders, day operations use actuals. */
  async function route(technicianId: number, stops: { job: Job; status?: JobStatus; departed?: string }[]): Promise<number> {
    const [row] = await db().insert(routes).values({ technicianId, date: DATE, version: 1 }).returning({ id: routes.id });
    if (!row) throw new Error('no route');
    for (const [i, s] of stops.entries()) {
      if (s.status) await db().update(jobsTable).set({ status: s.status }).where(eq(jobsTable.id, s.job.id));
      await db().insert(routeStops).values({
        routeId: row.id,
        jobId: s.job.id,
        sequence: i + 1,
        eta: new Date(local('08:00:00')),
        etd: new Date(local('08:10:00')),
        actualDeparture: s.departed ? new Date(local(s.departed)) : null,
      });
    }
    return row.id;
  }

  const suggest = (id: number | undefined, query = ''): request.Test => http().post(`/jobs/${id}/insertion-suggestions${query}`);
  const body = async (id: number | undefined, query = ''): Promise<InsertionSuggestions> => (await suggest(id, query).expect(201)).body;

  it('ranks options by detour and returns neighbours, new ETAs and the route version', async () => {
    const avi = await technician(34.0);
    const bea = await technician(34.05);
    const stop = await job(34.02, { status: 'assigned' });
    await route(avi, [{ job: stop }]);
    const target = await job(34.01);

    const result = await body(target.id);

    expect(matrixCalls).toBe(1);
    expect(result.options.map((o) => [o.technicianId, o.position, o.detourS, o.routeVersion])).toEqual([
      [avi, { afterJobId: null, beforeJobId: stop.id }, 0, 1],
      [avi, { afterJobId: stop.id, beforeJobId: null }, 0, 1],
      [bea, { afterJobId: null, beforeJobId: null }, 800, 0],
    ]);
    // Avi leaves at shift start 08:00: new job 08:01:40-08:11:40, then the stop at 08:13:20.
    expect(result.options[0]?.etas).toEqual([
      { jobId: target.id, eta: local('08:01:40'), etd: local('08:11:40') },
      { jobId: stop.id, eta: local('08:13:20'), etd: local('08:23:20') },
    ]);
  });

  it('honours limit', async () => {
    await technician(34.0);
    await technician(34.05);
    const target = await job(34.01);
    expect((await body(target.id, '?limit=1')).options).toHaveLength(1);
    expect((await body(target.id)).options).toHaveLength(2);
    await suggest(target.id, '?limit=0').expect(400);
  });

  it('offers home -> job -> home at route version 0 when nobody has a route that day', async () => {
    const avi = await technician(34.0);
    const bea = await technician(34.05);
    const target = await job(34.01);

    const result = await body(target.id);

    expect(result.rejections).toEqual([]);
    expect(result.options.map((o) => [o.technicianId, o.position, o.routeVersion])).toEqual([
      [avi, { afterJobId: null, beforeJobId: null }, 0],
      [bea, { afterJobId: null, beforeJobId: null }, 0],
    ]);
  });

  it('only considers technicians within the radius, counting both home and stops', async () => {
    process.env.INSERTION_RADIUS_M = '2000'; // about 0.02 degrees of longitude
    const near = await technician(34.01);
    await technician(34.1); // 9 km away, nothing nearby
    const farWithNearStop = await technician(34.1);
    const stop = await job(34.005, { status: 'assigned' });
    await route(farWithNearStop, [{ job: stop }]);
    const target = await job(34.0);

    const result = await body(target.id, '?limit=50');

    expect([...new Set(result.options.map((o) => o.technicianId))].sort()).toEqual([near, farWithNearStop]);
  });

  it('falls back to every skilled technician when none is within the radius', async () => {
    process.env.INSERTION_RADIUS_M = '2000';
    const far = await technician(34.1);
    const target = await job(34.0);

    const result = await body(target.id);

    expect(result.options.map((o) => o.technicianId)).toEqual([far]);
  });

  it('rejects with MISSING_SKILL, ROUTE_ALREADY_LATE and NO_FEASIBLE_POSITION', async () => {
    const welding = await skill('welding');
    const unskilled = await technician(34.0);
    const late = await technician(34.0, [welding]);
    const tooFar = await technician(34.0, [welding]);
    const lateStop = await job(34.05, { status: 'assigned', window: ['08:00:00', '08:05:00'] }); // 500 s away, window closes in 300 s
    await route(late, [{ job: lateStop }]);
    // Needs a visit between 08:00 and 08:05, which only fits a technician starting at the job.
    const target = await job(34.2, { skillIds: [welding], window: ['08:00:00', '08:05:00'] });

    const result = await body(target.id);

    expect(result.options).toEqual([]);
    expect(result.rejections).toEqual([
      { technicianId: unskilled, reason: 'MISSING_SKILL' },
      { technicianId: late, reason: 'ROUTE_ALREADY_LATE' },
      { technicianId: tooFar, reason: 'NO_FEASIBLE_POSITION' },
    ]);
  });

  it('starts from the current position: a done stop, and not before now', async () => {
    const avi = await technician(34.0);
    const done = await job(34.02, { status: 'done' });
    const next = await job(34.04, { status: 'assigned' });
    await route(avi, [{ job: done, departed: '09:00:00' }, { job: next }]);
    now = new Date(local('10:00:00'));
    const target = await job(34.03);

    const result = await body(target.id);

    const first = result.options[0];
    expect(first?.position).toEqual({ afterJobId: done.id, beforeJobId: next.id });
    // The technician is still at the done stop, free from now (10:00), 100 s from the new job.
    expect(first?.etas[0]?.eta).toBe(local('10:01:40'));
    expect(result.options.every((o) => o.position.beforeJobId !== done.id)).toBe(true);
  });

  it('refuses a job that is not unassigned (409), an unknown job (404) and a bad id (400)', async () => {
    await technician(34.0);
    for (const status of ['assigned', 'in_progress', 'done', 'cancelled'] as const) {
      const j = await job(34.01, { status });
      await suggest(j.id).expect(409);
    }
    await suggest(9999).expect(404);
    await suggest('abc' as unknown as number).expect(400);
  });

  it('is read-only and surfaces a routing outage as 503', async () => {
    const avi = await technician(34.0);
    const stop = await job(34.02, { status: 'assigned' });
    const routeId = await route(avi, [{ job: stop }]);
    const target = await job(34.01);
    const snapshot = async (): Promise<unknown> => ({
      routes: await db().select().from(routes),
      stops: await db().select().from(routeStops),
      jobs: (await db().execute(sql`select id, status from jobs order by id`)).rows,
    });
    const before = await snapshot();

    await body(target.id);
    routingDown = true;
    await suggest(target.id).expect(503);

    expect(await snapshot()).toEqual(before);
    expect((await db().select().from(routes).where(eq(routes.id, routeId)))[0]?.version).toBe(1);
  });

  describe('POST /jobs/:id/insert', () => {
    const insert = (id: number, technicianId: number, afterJobId: number | null, beforeJobId: number | null, routeVersion: number): request.Test =>
      http().post(`/jobs/${id}/insert`).send({ technicianId, position: { afterJobId, beforeJobId }, routeVersion });
    const snapshot = async (): Promise<unknown> => ({
      routes: await db().select().from(routes),
      stops: await db().select().from(routeStops),
      jobs: (await db().execute(sql`select id, status from jobs order by id`)).rows,
    });

    it('inserts the stop, renumbers, rewrites later ETAs, assigns the job and bumps the version', async () => {
      const avi = await technician(34.0);
      const stop = await job(34.02, { status: 'assigned' });
      await route(avi, [{ job: stop }]);
      const target = await job(34.01);

      await insert(target.id, avi, null, stop.id, 1).expect(200);

      const stops = await db().select().from(routeStops).orderBy(routeStops.sequence);
      expect(stops.map((s) => [s.jobId, s.sequence, s.eta.toISOString(), s.etd.toISOString()])).toEqual([
        [target.id, 1, local('08:01:40'), local('08:11:40')],
        [stop.id, 2, local('08:13:20'), local('08:23:20')],
      ]);
      expect((await db().select().from(jobsTable).where(eq(jobsTable.id, target.id)))[0]?.status).toBe('assigned');
      expect((await db().select().from(routes))[0]?.version).toBe(2);
      const shown = (await http().get(`/routes/${avi}/${DATE}`).expect(200)).body;
      expect(shown.stops.map((s: { jobId: number }) => s.jobId)).toEqual([target.id, stop.id]);
    });

    it('clears the stored unassigned reason and its time when the job is placed', async () => {
      const avi = await technician(34.0);
      const stop = await job(34.02, { status: 'assigned' });
      await route(avi, [{ job: stop }]);
      const target = await job(34.01);
      await db().execute(sql`update jobs set unassigned_reason = 'NOT_FEASIBLE_IN_PLAN', unassigned_at = now() where id = ${target.id}`);

      await insert(target.id, avi, null, stop.id, 1).expect(200);

      const placed: Job = (await http().get(`/jobs/${target.id}`).expect(200)).body;
      expect([placed.unassignedReason, placed.unassignedAt]).toEqual([null, null]);
    });

    it('409s on a stale route version and changes nothing', async () => {
      const avi = await technician(34.0);
      const stop = await job(34.02, { status: 'assigned' });
      await route(avi, [{ job: stop }]);
      const target = await job(34.01);
      const before = await snapshot();

      await insert(target.id, avi, null, stop.id, 0).expect(409);

      expect(await snapshot()).toEqual(before);
    });

    it('409s when the option became infeasible or the position no longer exists', async () => {
      const avi = await technician(34.0);
      const stop = await job(34.02, { status: 'assigned', window: ['08:00:00', '08:05:00'] });
      await route(avi, [{ job: stop }]);
      const target = await job(34.01);
      const other = await job(34.03);
      const before = await snapshot();

      await insert(target.id, avi, null, stop.id, 1).expect(409); // detour pushes the stop past its window
      await insert(target.id, avi, other.id, null, 1).expect(409); // no such neighbours

      expect(await snapshot()).toEqual(before);
    });

    it('lets exactly one of two simultaneous first inserts for a technician without a route win', async () => {
      const bea = await technician(34.05);
      const one = await job(34.04);
      const two = await job(34.06);

      const statuses = (await Promise.all([insert(one.id, bea, null, null, 0), insert(two.id, bea, null, null, 0)])).map((r) => r.status);

      expect(statuses.sort()).toEqual([200, 409]);
      expect(await db().select().from(routeStops)).toHaveLength(1);
      expect((await db().select().from(routes))[0]?.version).toBe(1);
    });

    it('refuses a job that is not unassigned and an unknown technician', async () => {
      const avi = await technician(34.0);
      const assigned = await job(34.01, { status: 'assigned' });
      await insert(assigned.id, avi, null, null, 0).expect(409);
      const target = await job(34.02);
      await insert(target.id, 9999, null, null, 0).expect(404);
    });
  });
});
