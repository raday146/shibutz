import request from 'supertest';
import type { LonLat } from '@shibutz/contracts';
import { CLOCK } from '../src/clock/clock';
import { DB, type Db } from '../src/db/db.module';
import { ROUTING_GATEWAY } from '../src/gateways/ports';
import type { RoutingGateway } from '../src/gateways/ports';
import { jobs as jobsTable, routeStops, routes } from '../src/db/schema';
import { setupTestApp } from './app';

const fakeRouting: RoutingGateway = {
  durationMatrix: async (points: LonLat[]) => points.map(() => points.map(() => 60)),
  routeGeometry: async (points: LonLat[]) => ({ type: 'LineString', coordinates: points }),
};
let now = new Date('2026-07-01T07:00:00Z');

describe('job notes', () => {
  const app = setupTestApp((b) =>
    b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting).overrideProvider(CLOCK).useValue({ now: () => now }),
  );
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  async function job(): Promise<number> {
    const body = {
      title: 'Test job', address: '1 Test St', location: [34.01, 32], skillIds: [], serviceDurationS: 600,
      windowStart: '2026-07-01T05:00:00Z', windowEnd: '2026-07-01T14:00:00Z', priority: 50,
    };
    return (await http().post('/jobs').send(body).expect(201)).body.id;
  }

  /** The job as the only stop of a new technician's route on the job's day. */
  async function route(jobId: number): Promise<number> {
    const tech = { name: 'Avi', home: [34.0, 32], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] };
    const technicianId: number = (await http().post('/technicians').send(tech).expect(201)).body.id;
    const db = app().get<Db>(DB);
    const [r] = await db.insert(routes).values({ technicianId, date: '2026-07-01', version: 1 }).returning({ id: routes.id });
    await db.insert(routeStops).values({ routeId: r!.id, jobId, sequence: 1, eta: new Date('2026-07-01T05:10:00Z'), etd: new Date('2026-07-01T05:20:00Z') });
    await db.update(jobsTable).set({ status: 'assigned' });
    return technicianId;
  }
  const hasNote = async (technicianId: number): Promise<boolean> =>
    (await http().get(`/routes/${technicianId}/2026-07-01`).expect(200)).body.stops[0].hasNote;

  it('creates a note with both times, then updates it keeping the created time', async () => {
    const id = await job();
    await http().get(`/jobs/${id}/note`).expect(404);

    now = new Date('2026-07-01T07:00:00Z');
    const created = (await http().put(`/jobs/${id}/note`).send({ body: 'gate code 1948' }).expect(200)).body;
    expect(created).toEqual({ jobId: id, body: 'gate code 1948', createdAt: '2026-07-01T07:00:00.000Z', updatedAt: '2026-07-01T07:00:00.000Z' });

    now = new Date('2026-07-01T07:05:00Z');
    const updated = (await http().put(`/jobs/${id}/note`).send({ body: 'gate code 2000' }).expect(200)).body;
    expect(updated).toEqual({ jobId: id, body: 'gate code 2000', createdAt: '2026-07-01T07:00:00.000Z', updatedAt: '2026-07-01T07:05:00.000Z' });
    expect((await http().get(`/jobs/${id}/note`).expect(200)).body).toEqual(updated);
  });

  it('rejects an unknown job and a body that is not a string', async () => {
    await http().put('/jobs/999/note').send({ body: 'x' }).expect(404);
    const id = await job();
    await http().put(`/jobs/${id}/note`).send({ body: 5 }).expect(400);
    await http().put(`/jobs/${id}/note`).send({}).expect(400);
  });

  it('shows on the route view, and survives unassign', async () => {
    const id = await job();
    const technicianId = await route(id);
    expect(await hasNote(technicianId)).toBe(false);

    await http().put(`/jobs/${id}/note`).send({ body: 'ring first' }).expect(200);
    expect(await hasNote(technicianId)).toBe(true);

    await http().patch(`/jobs/${id}/status`).send({ status: 'unassigned' }).expect(200);
    expect((await http().get(`/jobs/${id}/note`).expect(200)).body.body).toBe('ring first');
  });

  it('is deleted with the job', async () => {
    const id = await job();
    await http().put(`/jobs/${id}/note`).send({ body: 'x' }).expect(200);
    await http().delete(`/jobs/${id}`).expect(204);
    await http().get(`/jobs/${id}/note`).expect(404);
  });
});
