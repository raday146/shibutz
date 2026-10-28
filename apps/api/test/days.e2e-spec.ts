import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { DaySummary } from '@shibutz/contracts';
import { DB, type Db } from '../src/db/db.module';
import { jobs, routeStops, routes } from '../src/db/schema';
import { ROUTING_GATEWAY } from '../src/gateways/ports';
import type { RoutingGateway } from '../src/gateways/ports';
import { setupTestApp } from './app';

const DATE = '2026-07-01';
// Every leg takes 100 s.
const fakeRouting: RoutingGateway = {
  durationMatrix: async (points) => points.map(() => points.map(() => 100)),
  routeGeometry: async (points) => ({ type: 'LineString', coordinates: points }),
};

describe('GET /days/:date/summary', () => {
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting));
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  const technician = async (name: string): Promise<number> =>
    (await http().post('/technicians').send({ name, home: [34, 32], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] }).expect(201)).body.id;
  const job = async (lon: number, date = DATE): Promise<number> =>
    (await http().post('/jobs').send({ title: `Job ${lon}`, address: 'x', location: [lon, 32], skillIds: [], serviceDurationS: 600, windowStart: `${date}T08:00:00+03:00`, windowEnd: `${date}T16:00:00+03:00`, priority: 50 }).expect(201)).body.id;
  const summary = async (date = DATE): Promise<DaySummary> => (await http().get(`/days/${date}/summary`).expect(200)).body;

  it('is empty for a date with no jobs and lists idle technicians', async () => {
    const tech = await technician('Avi');
    expect(await summary()).toEqual({
      date: DATE,
      totals: { total: 0, assigned: 0, unassigned: 0, done: 0, driveS: 0 },
      technicians: [{ technicianId: tech, stopCount: 0, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] }],
    });
  });

  it('counts per technician and for the day, ignoring cancelled jobs and other dates', async () => {
    const [avi, dana] = [await technician('Avi'), await technician('Dana')] as [number, number];
    const [a, b, cancelled] = [await job(34.01), await job(34.02), await job(34.04)] as [number, number, number];
    await job(34.05); // unassigned
    await job(34.06, '2026-07-02'); // other date
    const db = app().get<Db>(DB);
    const [route] = await db.insert(routes).values({ technicianId: avi, date: DATE, version: 1 }).returning({ id: routes.id });
    const at = (hm: string): Date => new Date(`${DATE}T${hm}:00Z`);
    await db.insert(routeStops).values([
      { routeId: route?.id ?? 0, jobId: a, sequence: 1, eta: at('05:00'), etd: at('05:10') },
      { routeId: route?.id ?? 0, jobId: b, sequence: 2, eta: at('05:20'), etd: at('05:30') },
    ]);
    await db.update(jobs).set({ status: 'done' }).where(eq(jobs.id, a));
    await db.update(jobs).set({ status: 'assigned' }).where(eq(jobs.id, b));
    await db.update(jobs).set({ status: 'cancelled' }).where(eq(jobs.id, cancelled));

    const res = await summary();
    expect(res.totals).toEqual({ total: 3, assigned: 2, unassigned: 1, done: 1, driveS: 300 });
    expect(res.technicians.find((t) => t.technicianId === avi)).toEqual({
      technicianId: avi,
      stopCount: 2,
      doneCount: 1,
      driveS: 300, // home, a, b, home: three legs
      expectedFinish: '2026-07-01T05:30:00.000Z',
      openIncidents: 0,
      stops: [
        { jobId: a, status: 'done', location: [34.01, 32] },
        { jobId: b, status: 'assigned', location: [34.02, 32] },
      ],
    });
    expect(res.technicians.find((t) => t.technicianId === dana)).toMatchObject({ stopCount: 0, driveS: 0, expectedFinish: null });
  });

  it('keeps the counts and reports 0 drive time when routing is down', async () => {
    const tech = await technician('Avi');
    const a = await job(34.01);
    const db = app().get<Db>(DB);
    const [route] = await db.insert(routes).values({ technicianId: tech, date: DATE, version: 1 }).returning({ id: routes.id });
    const at = new Date(`${DATE}T05:00:00Z`);
    await db.insert(routeStops).values({ routeId: route?.id ?? 0, jobId: a, sequence: 1, eta: at, etd: at });
    fakeRouting.durationMatrix = async () => {
      throw new Error('osrm down');
    };
    try {
      const res = await summary();
      expect(res.totals).toMatchObject({ total: 1, driveS: 0 });
      expect(res.technicians[0]).toMatchObject({ stopCount: 1, driveS: 0 });
    } finally {
      fakeRouting.durationMatrix = async (points) => points.map(() => points.map(() => 100));
    }
  });

  it('400s for a bad date', async () => {
    await http().get('/days/2026-13-01/summary').expect(400);
  });
});
