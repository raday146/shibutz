import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { Job, LonLat } from '@shibutz/contracts';
import { DB, type Db } from '../src/db/db.module';
import { routeStops, routes } from '../src/db/schema';
import { ROUTING_GATEWAY, SOLVER_GATEWAY } from '../src/gateways/ports';
import type { DurationMatrix, LineString, RoutingGateway } from '../src/gateways/ports';
import { setupTestApp } from './app';

const fakeRouting: RoutingGateway = {
  durationMatrix: async (points: LonLat[]): Promise<DurationMatrix> => points.map(() => points.map(() => 60)),
  routeGeometry: async (points: LonLat[]): Promise<LineString> => ({ type: 'LineString', coordinates: points }),
};
const solver = { solve: async (): Promise<never> => ({ code: 0, routes: [], unassigned: [] }) as never };

// 2026-07-01 is summer time in Israel (UTC+3).
const DATE = '2026-07-01';
const local = (hhmm: string): string => `${DATE}T${hhmm}:00+03:00`;

describe('Plan day racing a status change on the same technician (#20)', () => {
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting).overrideProvider(SOLVER_GATEWAY).useValue(solver));
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());
  const db = (): Db => app().get<Db>(DB);

  afterEach(async () => {
    await db().execute(sql`drop function if exists slow_route() cascade`);
  });

  it('never answers 500: the two writers take their locks in one order, or the loser gets 409', async () => {
    const tech = (await http().post('/technicians').send({ name: 'Avi', home: [34.0, 32], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] }).expect(201)).body.id;
    const body = { title: 'Test job', address: '1 Test St', location: [34.01, 32], skillIds: [], serviceDurationS: 600, windowStart: local('08:00'), windowEnd: local('16:00'), priority: 50 };
    const job: Job = (await http().post('/jobs').send(body).expect(201)).body;
    const [route] = await db().insert(routes).values({ technicianId: tech, date: DATE, version: 1 }).returning({ id: routes.id });
    await db().insert(routeStops).values({ routeId: route?.id ?? 0, jobId: job.id, sequence: 1, eta: new Date(local('08:01')), etd: new Date(local('08:11')) });
    await db().execute(sql`update jobs set status = 'assigned' where id = ${job.id}`);

    // Holds the route row lock for 1.5 s after the status change bumps the version, so the batch reaches its own write
    // meanwhile: it holds the day's job locks and waits for the route, while the status change then wants the job row.
    await db().execute(sql`create function slow_route() returns trigger language plpgsql as $$ begin perform pg_sleep(1.5); return new; end $$`);
    await db().execute(sql`create trigger slow_route before update on routes for each row execute function slow_route()`);

    const status = http().patch(`/jobs/${job.id}/status`).send({ status: 'cancelled' }).then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const batch = http().post(`/optimization/day/${DATE}`).then((r) => r);
    const results = await Promise.all([status, batch]);

    expect(results.map((r) => r.status).filter((s) => s >= 500)).toEqual([]);
  }, 30_000);
});
