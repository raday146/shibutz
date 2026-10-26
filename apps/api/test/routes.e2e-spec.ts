import request from 'supertest';
import type { LonLat, RouteView } from '@shibutz/contracts';
import { DB, type Db } from '../src/db/db.module';
import { routeStops, routes } from '../src/db/schema';
import { ROUTING_GATEWAY } from '../src/gateways/ports';
import type { LineString, RoutingGateway } from '../src/gateways/ports';
import { setupTestApp } from './app';

const DATE = '2026-07-01';
const calls: LonLat[][] = [];
const fakeRouting: RoutingGateway = {
  durationMatrix: async (points) => points.map(() => points.map(() => 60)),
  routeGeometry: async (points): Promise<LineString> => {
    calls.push(points);
    return { type: 'LineString', coordinates: points };
  },
};

describe('GET /routes/:technicianId/:date', () => {
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting));
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  async function technician(): Promise<number> {
    const body = { name: 'Avi', home: [34.0, 32.0], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] };
    return (await http().post('/technicians').send(body).expect(201)).body.id;
  }
  async function job(lon: number): Promise<number> {
    const body = { location: [lon, 32], skillIds: [], serviceDurationS: 1800, windowStart: `${DATE}T08:00:00+03:00`, windowEnd: `${DATE}T16:00:00+03:00`, priority: 50 };
    return (await http().post('/jobs').send(body).expect(201)).body.id;
  }

  it('returns stops ordered by sequence and a home-to-home geometry', async () => {
    const tech = await technician();
    const [a, b] = [await job(34.01), await job(34.02)] as [number, number];
    const db = app().get<Db>(DB);
    const [route] = await db.insert(routes).values({ technicianId: tech, date: DATE, version: 1 }).returning({ id: routes.id });
    // Inserted out of order on purpose.
    await db.insert(routeStops).values([
      { routeId: route?.id ?? 0, jobId: a, sequence: 2, eta: new Date('2026-07-01T08:00:00Z'), etd: new Date('2026-07-01T08:30:00Z') },
      { routeId: route?.id ?? 0, jobId: b, sequence: 1, eta: new Date('2026-07-01T07:00:00Z'), etd: new Date('2026-07-01T07:30:00Z') },
    ]);

    const res = await http().get(`/routes/${tech}/${DATE}`).expect(200);
    const view: RouteView = res.body;

    expect(view.stops.map((s) => [s.sequence, s.jobId, s.location])).toEqual([
      [1, b, [34.02, 32]],
      [2, a, [34.01, 32]],
    ]);
    expect(view.stops[0]).toMatchObject({ eta: '2026-07-01T07:00:00.000Z', etd: '2026-07-01T07:30:00.000Z', actualArrival: null, actualDeparture: null });
    expect(view.geometry?.coordinates).toEqual([[34.0, 32.0], [34.02, 32], [34.01, 32], [34.0, 32.0]]);
  });

  it('returns empty stops and null geometry when nothing is planned', async () => {
    const tech = await technician();
    calls.length = 0;
    await http().get(`/routes/${tech}/${DATE}`).expect(200, { technicianId: tech, date: DATE, stops: [], geometry: null });
    expect(calls).toEqual([]);
  });

  it('404s for an unknown technician and 400s for a bad date', async () => {
    await http().get(`/routes/999/${DATE}`).expect(404);
    const tech = await technician();
    await http().get(`/routes/${tech}/2026-13-01`).expect(400);
  });
});
