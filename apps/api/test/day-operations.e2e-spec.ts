import request from 'supertest';
import { asc, eq } from 'drizzle-orm';
import type { Job, JobStatus, LonLat } from '@shibutz/contracts';
import { CLOCK } from '../src/clock/clock';
import { DB, type Db } from '../src/db/db.module';
import { ROUTING_GATEWAY } from '../src/gateways/ports';
import type { DurationMatrix, LineString, RoutingGateway } from '../src/gateways/ports';
import { jobs as jobsTable, routeStops, routes } from '../src/db/schema';
import { setupTestApp } from './app';

// Hand-built travel times: 100 s per 0.01 degree of longitude, every point on lat 32.
const travel = (a: LonLat, b: LonLat): number => Math.round(Math.abs(a[0] - b[0]) * 10_000);
let matrixCalls = 0;
let noRoadLon: number | undefined; // a point with this longitude has no road to any other point
const fakeRouting: RoutingGateway = {
  durationMatrix: async (points: LonLat[]): Promise<DurationMatrix> => {
    matrixCalls += 1;
    return points.map((a) => points.map((b) => (a !== b && (a[0] === noRoadLon || b[0] === noRoadLon) ? null : travel(a, b))));
  },
  routeGeometry: async (points: LonLat[]): Promise<LineString> => ({ type: 'LineString', coordinates: points }),
};

// 2026-07-01 is summer time in Israel (UTC+3).
const DATE = '2026-07-01';
const local = (hms: string, date = DATE): string => new Date(`${date}T${hms}+03:00`).toISOString();
let now = new Date(local('07:00:00'));

type Http = () => ReturnType<typeof request>;
type Stop = { job: Job; eta: string; etd: string; actualArrival?: string; actualDeparture?: string };

// Technician Avi: home at lon 34.00, shift 08:00-17:00. Stops A, B, C at 34.01, 34.02, 34.03, 600 s service.
// Planned from shift start: A 08:01:40-08:11:40, B 08:13:20-08:23:20, C 08:25:00-08:35:00.
const PLAN = [
  ['08:01:40', '08:11:40'],
  ['08:13:20', '08:23:20'],
  ['08:25:00', '08:35:00'],
] as const;

describe('PATCH /jobs/:id/status (fake routing, fake clock)', () => {
  const app = setupTestApp((b) =>
    b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting).overrideProvider(CLOCK).useValue({ now: () => now }),
  );
  const http: Http = () => request(app().getHttpServer());
  const db = (): Db => app().get<Db>(DB);

  beforeEach(() => {
    now = new Date(local('07:00:00'));
    matrixCalls = 0;
    noRoadLon = undefined;
  });

  async function technician(): Promise<number> {
    const body = { name: 'Avi', home: [34.0, 32], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] };
    return (await http().post('/technicians').send(body).expect(201)).body.id;
  }

  async function job(lon: number, status: JobStatus = 'unassigned', date = DATE): Promise<Job> {
    const body = {
      location: [lon, 32],
      skillIds: [],
      serviceDurationS: 600,
      windowStart: local('08:00:00', date),
      windowEnd: local('17:00:00', date),
      priority: 50,
    };
    const created: Job = (await http().post('/jobs').send(body).expect(201)).body;
    if (status === 'unassigned') return created;
    // Statuses other than unassigned are set directly: only day operations and batch move them.
    await db().update(jobsTable).set({ status }).where(eq(jobsTable.id, created.id));
    return { ...created, status };
  }

  /** Inserts a route (version 1) for the technician with the given stops in order. */
  async function route(technicianId: number, stops: Stop[], date = DATE): Promise<number> {
    const [row] = await db().insert(routes).values({ technicianId, date, version: 1 }).returning({ id: routes.id });
    if (!row) throw new Error('no route');
    await db()
      .insert(routeStops)
      .values(
        stops.map((s, i) => ({
          routeId: row.id,
          jobId: s.job.id,
          sequence: i + 1,
          eta: new Date(s.eta),
          etd: new Date(s.etd),
          actualArrival: s.actualArrival ? new Date(s.actualArrival) : null,
          actualDeparture: s.actualDeparture ? new Date(s.actualDeparture) : null,
        })),
      );
    return row.id;
  }

  /** Avi with stops A, B, C; `overrides` sets a status (and actual times) per stop. */
  async function day(
    statuses: [JobStatus, JobStatus, JobStatus] = ['assigned', 'assigned', 'assigned'],
    actuals: Partial<Stop>[] = [],
  ): Promise<{ techId: number; routeId: number; jobs: Job[] }> {
    const techId = await technician();
    const jobs = [await job(34.01, statuses[0]), await job(34.02, statuses[1]), await job(34.03, statuses[2])];
    const stops = jobs.map((j, i) => ({ job: j, eta: local(PLAN[i]?.[0] ?? ''), etd: local(PLAN[i]?.[1] ?? ''), ...actuals[i] }));
    return { techId, routeId: await route(techId, stops), jobs };
  }

  const patch = (id: number | undefined, status: string): request.Test => http().patch(`/jobs/${id}/status`).send({ status });

  async function stopRows(): Promise<{ jobId: number; sequence: number; eta: string; etd: string; actualArrival: Date | null; actualDeparture: Date | null }[]> {
    const rows = await db().select().from(routeStops).orderBy(asc(routeStops.sequence));
    return rows.map((r) => ({ ...r, eta: r.eta.toISOString(), etd: r.etd.toISOString() }));
  }
  const version = async (routeId: number): Promise<number | undefined> =>
    (await db().select({ v: routes.version }).from(routes).where(eq(routes.id, routeId)))[0]?.v;
  const statusOf = async (id: number | undefined): Promise<JobStatus | undefined> =>
    ((await http().get(`/jobs/${id}`).expect(200)).body as Job).status;

  it('assigned -> in_progress on the first stop sets actual arrival and bumps the version', async () => {
    const { jobs, routeId } = await day();
    now = new Date(local('08:02:00'));

    await patch(jobs[0]?.id, 'in_progress').expect(200);

    expect(await statusOf(jobs[0]?.id)).toBe('in_progress');
    expect((await stopRows())[0]?.actualArrival?.toISOString()).toBe(local('08:02:00'));
    expect(await version(routeId)).toBe(2);
  });

  it('in_progress -> done sets actual departure and bumps the version', async () => {
    const { jobs, routeId } = await day(['in_progress', 'assigned', 'assigned'], [{ actualArrival: local('08:02:00') }]);
    now = new Date(local('08:12:00'));

    await patch(jobs[0]?.id, 'done').expect(200);

    expect(await statusOf(jobs[0]?.id)).toBe('done');
    expect((await stopRows())[0]?.actualDeparture?.toISOString()).toBe(local('08:12:00'));
    expect(await version(routeId)).toBe(2);
  });

  it('refuses to start a stop that is not the first not-done stop', async () => {
    const { jobs, routeId } = await day();

    await patch(jobs[1]?.id, 'in_progress').expect(409);

    expect(await statusOf(jobs[1]?.id)).toBe('assigned');
    expect(await version(routeId)).toBe(1);
  });

  it('starts the next stop once the previous one is done', async () => {
    const { jobs } = await day(['done', 'assigned', 'assigned'], [{ actualArrival: local('08:02:00'), actualDeparture: local('08:12:00') }]);

    await patch(jobs[1]?.id, 'in_progress').expect(200);
  });

  it('allows at most one in_progress stop per technician, across days', async () => {
    const { techId } = await day(['in_progress', 'assigned', 'assigned'], [{ actualArrival: local('08:02:00') }]);
    const nextDay = await job(34.01, 'assigned', '2026-07-02');
    await route(techId, [{ job: nextDay, eta: local('08:01:40', '2026-07-02'), etd: local('08:11:40', '2026-07-02') }], '2026-07-02');

    await patch(nextDay.id, 'in_progress').expect(409);
  });

  it('lets only one of two simultaneous starts on different days go through', async () => {
    // Repeated with fresh technicians because the race window is narrow.
    for (let round = 0; round < 6; round++) {
      const techId = await technician();
      const starts: Job[] = [];
      for (const d of ['2026-07-01', '2026-07-02']) {
        const j = await job(34.01, 'assigned', d);
        await route(techId, [{ job: j, eta: local('08:01:40', d), etd: local('08:11:40', d) }], d);
        starts.push(j);
      }

      const results = await Promise.all(starts.map((j) => patch(j.id, 'in_progress')));

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    }
  });

  describe('removing a stop', () => {
    it('assigned -> unassigned in the middle renumbers and recomputes later ETAs from the previous stop', async () => {
      const { jobs, routeId } = await day();

      await patch(jobs[1]?.id, 'unassigned').expect(200);

      expect(await statusOf(jobs[1]?.id)).toBe('unassigned');
      const rows = await stopRows();
      // C now follows A (departs 08:11:40): 200 s drive -> 08:15:00, departs 08:25:00.
      expect(rows.map((r) => [r.jobId, r.sequence, r.eta, r.etd])).toEqual([
        [jobs[0]?.id, 1, local('08:01:40'), local('08:11:40')],
        [jobs[2]?.id, 2, local('08:15:00'), local('08:25:00')],
      ]);
      expect(await version(routeId)).toBe(2);
      expect(matrixCalls).toBe(1);
    });

    it('a merely assigned previous stop departs no earlier than now', async () => {
      const { jobs } = await day();
      now = new Date(local('08:20:00'));

      await patch(jobs[1]?.id, 'unassigned').expect(200);

      // A is still only planned (etd 08:11:40) but now is 08:20: C = 08:20:00 + 200 s.
      expect((await stopRows()).map((r) => [r.sequence, r.eta, r.etd])[1]).toEqual([2, local('08:23:20'), local('08:33:20')]);
    });

    it('removing a stop succeeds when a leg has no road (it costs NO_ROAD_S instead of failing)', async () => {
      const { jobs } = await day();
      noRoadLon = 34.03;

      await patch(jobs[1]?.id, 'unassigned').expect(200);

      expect(await statusOf(jobs[1]?.id)).toBe('unassigned');
      expect((await stopRows()).map((r) => r.jobId)).toEqual([jobs[0]?.id, jobs[2]?.id]);
    });

    it('removing the first stop restarts from home at shift start', async () => {
      const { jobs } = await day();

      await patch(jobs[0]?.id, 'unassigned').expect(200);

      // Home at 08:00 (shift start is later than now = 07:00): B 08:03:20-08:13:20, C 08:15:00-08:25:00.
      expect((await stopRows()).map((r) => [r.sequence, r.eta, r.etd])).toEqual([
        [1, local('08:03:20'), local('08:13:20')],
        [2, local('08:15:00'), local('08:25:00')],
      ]);
    });

    it('restarts from the last done stop at max(actual departure, now)', async () => {
      const { jobs } = await day(['done', 'assigned', 'assigned'], [{ actualArrival: local('08:02:00'), actualDeparture: local('08:12:00') }]);
      now = new Date(local('08:20:00'));

      await patch(jobs[1]?.id, 'unassigned').expect(200);

      // C: from A at 08:20:00 + 200 s.
      expect((await stopRows()).map((r) => [r.sequence, r.eta, r.etd])).toEqual([
        [1, local('08:01:40'), local('08:11:40')],
        [2, local('08:23:20'), local('08:33:20')],
      ]);
    });

    it('removing the last stop makes no routing call', async () => {
      const { jobs, routeId } = await day();

      await patch(jobs[2]?.id, 'cancelled').expect(200);

      expect(await statusOf(jobs[2]?.id)).toBe('cancelled');
      expect((await stopRows()).map((r) => r.sequence)).toEqual([1, 2]);
      expect(await version(routeId)).toBe(2);
      expect(matrixCalls).toBe(0);
    });

    it('cancelling an assigned stop removes it like unassigning, but the job stays cancelled', async () => {
      const { jobs } = await day();

      await patch(jobs[1]?.id, 'cancelled').expect(200);

      expect(await statusOf(jobs[1]?.id)).toBe('cancelled');
      expect((await stopRows()).map((r) => r.jobId)).toEqual([jobs[0]?.id, jobs[2]?.id]);
    });

    it('cancelling an in_progress stop continues the route from that stop at now', async () => {
      const { jobs, routeId } = await day(['in_progress', 'assigned', 'assigned'], [{ actualArrival: local('08:02:00') }]);
      now = new Date(local('08:05:00'));

      await patch(jobs[0]?.id, 'cancelled').expect(200);

      expect(await statusOf(jobs[0]?.id)).toBe('cancelled');
      // From A's location at 08:05:00: B +100 s -> 08:06:40-08:16:40, C +100 s -> 08:18:20-08:28:20.
      expect((await stopRows()).map((r) => [r.jobId, r.sequence, r.eta, r.etd])).toEqual([
        [jobs[1]?.id, 1, local('08:06:40'), local('08:16:40')],
        [jobs[2]?.id, 2, local('08:18:20'), local('08:28:20')],
      ]);
      expect(await version(routeId)).toBe(2);
    });

    it('cancelling an unassigned job just cancels it', async () => {
      const unrouted = await job(34.05);

      await patch(unrouted.id, 'cancelled').expect(200);

      expect(await statusOf(unrouted.id)).toBe('cancelled');
    });
  });

  describe('refusals', () => {
    const cases: [JobStatus, string][] = [
      ['unassigned', 'assigned'],
      ['unassigned', 'in_progress'],
      ['unassigned', 'done'],
      ['unassigned', 'unassigned'],
      ['assigned', 'done'],
      ['assigned', 'assigned'],
      ['in_progress', 'assigned'],
      ['in_progress', 'unassigned'],
      ['in_progress', 'in_progress'],
      ['done', 'assigned'],
      ['done', 'unassigned'],
      ['done', 'in_progress'],
      ['done', 'cancelled'],
      ['done', 'done'],
      ['cancelled', 'assigned'],
      ['cancelled', 'unassigned'],
      ['cancelled', 'in_progress'],
      ['cancelled', 'done'],
      ['cancelled', 'cancelled'],
    ];

    it.each(cases)('%s -> %s is refused with 409 and changes nothing', async (from, to) => {
      const techId = await technician();
      const subject = await job(34.01, from);
      let routeId: number | undefined;
      if (from === 'assigned' || from === 'in_progress' || from === 'done') {
        routeId = await route(techId, [
          {
            job: subject,
            eta: local('08:01:40'),
            etd: local('08:11:40'),
            ...(from !== 'assigned' && { actualArrival: local('08:02:00') }),
            ...(from === 'done' && { actualDeparture: local('08:12:00') }),
          },
        ]);
      }

      const res = await patch(subject.id, to).expect(409);

      expect(res.body.message).toMatch(new RegExp(`${from}.*${to}`));
      expect(await statusOf(subject.id)).toBe(from);
      if (routeId !== undefined) expect(await version(routeId)).toBe(1);
    });

    it('rejects an unknown status with 400 and an unknown job with 404', async () => {
      const unrouted = await job(34.05);

      await patch(unrouted.id, 'flying').expect(400);
      await patch(9999, 'cancelled').expect(404);
    });
  });

  it('answers 409 for exactly one of two conflicting changes to the same stop', async () => {
    const { jobs, routeId } = await day();

    const results = await Promise.all([patch(jobs[0]?.id, 'in_progress'), patch(jobs[0]?.id, 'unassigned')]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await version(routeId)).toBe(2);
  });

  it('refuses to delete a job that is on a route', async () => {
    const { jobs } = await day();

    const res = await http().delete(`/jobs/${jobs[0]?.id}`).expect(409);

    expect(res.body.message).toMatch(/on a route/);
  });

  it('refuses to change location, window, service or skills of a job on a route, but allows priority', async () => {
    const { jobs } = await day();
    const url = `/jobs/${jobs[0]?.id}`;

    for (const body of [{ location: [34.5, 32] }, { windowEnd: local('16:00:00') }, { serviceDurationS: 60 }, { skillIds: [] }]) {
      const res = await http().patch(url).send(body).expect(409);
      expect(res.body.message).toMatch(/unassign or cancel/);
    }
    await http().patch(url).send({ priority: 10 }).expect(200);
  });

  it('refuses to delete a technician who has route stops', async () => {
    const { techId } = await day();

    const res = await http().delete(`/technicians/${techId}`).expect(409);

    expect(res.body.message).toMatch(/route/);
    expect(await stopRows()).toHaveLength(3);
  });

  it('refuses to change home, shift or skills of a technician with route stops, but allows renaming', async () => {
    const { techId } = await day();
    const before = (await http().get(`/technicians/${techId}`).expect(200)).body;

    for (const change of [{ home: [34.1, 32] }, { shiftStart: '07:00:00' }, { shiftEnd: '18:00:00' }, { skillIds: [] }]) {
      const res = await http().patch(`/technicians/${techId}`).send(change).expect(409);
      expect(res.body.message).toMatch(/route|stops/);
    }
    await http().get(`/technicians/${techId}`).expect(200, before);

    await http().patch(`/technicians/${techId}`).send({ name: 'Avi B.' }).expect(200);
  });

  it('lets a technician whose stops are all done change home, shift and skills', async () => {
    const { techId } = await day(['done', 'done', 'done']);

    await http().patch(`/technicians/${techId}`).send({ home: [34.1, 32], shiftEnd: '18:00:00', skillIds: [] }).expect(200);
  });

  it('still lets a technician without route stops change home, shift and skills', async () => {
    const techId = await technician();

    await http().patch(`/technicians/${techId}`).send({ home: [34.1, 32], shiftEnd: '18:00:00', skillIds: [] }).expect(200);
  });
});
