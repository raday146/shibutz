import request from 'supertest';
import { ROUTING_GATEWAY } from '../src/gateways/ports';
import type { RoutingGateway } from '../src/gateways/ports';
import { setupTestApp } from './app';

const DATE = '2026-07-01';
const fakeRouting: RoutingGateway = {
  durationMatrix: async (points) => points.map(() => points.map(() => 100)),
  routeGeometry: async (points) => ({ type: 'LineString', coordinates: points }),
};

describe('day reports and incidents', () => {
  const app = setupTestApp((b) => b.overrideProvider(ROUTING_GATEWAY).useValue(fakeRouting));
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  const technician = async (): Promise<number> =>
    (await http().post('/technicians').send({ name: 'Avi', home: [34, 32], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] }).expect(201)).body.id;
  const job = async (): Promise<number> =>
    (await http().post('/jobs').send({ title: 'Fix', address: 'x', location: [34.01, 32], skillIds: [], serviceDurationS: 600, windowStart: `${DATE}T08:00:00+03:00`, windowEnd: `${DATE}T16:00:00+03:00`, priority: 50 }).expect(201)).body.id;
  const day = (id: number, d = DATE): string => `/technicians/${id}/days/${d}`;

  describe('report', () => {
    it('is 404 until written, then created once and updated in place with timestamps', async () => {
      const tech = await technician();
      await http().get(`${day(tech)}/report`).expect(404);

      const first = (await http().put(`${day(tech)}/report`).send({ body: 'Quiet day' }).expect(200)).body;
      expect(first).toMatchObject({ technicianId: tech, date: DATE, body: 'Quiet day' });
      expect(first.createdAt).toBe(first.updatedAt);

      const second = (await http().put(`${day(tech)}/report`).send({ body: 'Busy day' }).expect(200)).body;
      expect(second).toMatchObject({ body: 'Busy day', createdAt: first.createdAt });
      expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));
      await http().get(`${day(tech)}/report`).expect(200, second);
      await http().get(`${day(tech, '2026-07-02')}/report`).expect(404);
    });

    it('rejects an empty body, a bad date and an unknown technician', async () => {
      const tech = await technician();
      await http().put(`${day(tech)}/report`).send({ body: '  ' }).expect(400);
      await http().put(`${day(tech, '2026-13-01')}/report`).send({ body: 'x' }).expect(400);
      await http().put(`${day(999)}/report`).send({ body: 'x' }).expect(404);
      await http().get(`${day(999)}/report`).expect(404);
    });
  });

  describe('incidents', () => {
    it('logs an incident with an optional job, lists it by technician and day, and marks it reviewed', async () => {
      const tech = await technician();
      const jobId = await job();

      const linked = (await http().post(`${day(tech)}/incidents`).send({ body: 'Wrong part', jobId }).expect(201)).body;
      const plain = (await http().post(`${day(tech)}/incidents`).send({ body: 'Flat tyre' }).expect(201)).body;
      expect(linked).toMatchObject({ technicianId: tech, date: DATE, jobId, body: 'Wrong part', status: 'open', reviewedAt: null });
      expect(plain.jobId).toBeNull();
      await http().post(`${day(tech, '2026-07-02')}/incidents`).send({ body: 'Other day' }).expect(201);

      await http().get(`${day(tech)}/incidents`).expect(200, [linked, plain]);

      const reviewed = (await http().post(`/incidents/${linked.id}/review`).expect(201)).body;
      expect(reviewed).toMatchObject({ id: linked.id, status: 'reviewed' });
      expect(reviewed.reviewedAt).not.toBeNull();
      await http().post(`/incidents/${linked.id}/review`).expect(201, reviewed); // idempotent
      await http().post('/incidents/999/review').expect(404);
    });

    it('lists open incidents across dates, newest date first, and drops reviewed ones', async () => {
      const tech = await technician();
      const a = (await http().post(`${day(tech)}/incidents`).send({ body: 'A' }).expect(201)).body;
      const b = (await http().post(`${day(tech, '2026-07-02')}/incidents`).send({ body: 'B' }).expect(201)).body;
      await http().post(`${day(tech)}/incidents`).send({ body: 'C' }).expect(201).then((r) => http().post(`/incidents/${r.body.id}/review`).expect(201));

      await http().get('/incidents/open').expect(200, [b, a]);
    });

    it('rejects empty text, an unknown job and an unknown technician', async () => {
      const tech = await technician();
      await http().post(`${day(tech)}/incidents`).send({ body: '' }).expect(400);
      await http().post(`${day(tech)}/incidents`).send({ body: 'x', jobId: 999 }).expect(400);
      await http().post(`${day(999)}/incidents`).send({ body: 'x' }).expect(404);
      await http().get(`${day(999)}/incidents`).expect(404);
    });

    it('clears the link when the job is deleted', async () => {
      const tech = await technician();
      const jobId = await job();
      await http().post(`${day(tech)}/incidents`).send({ body: 'x', jobId }).expect(201);

      await http().delete(`/jobs/${jobId}`).expect(204);

      await http().get(`${day(tech)}/incidents`).expect((r) => expect(r.body[0].jobId).toBeNull());
    });
  });

  describe('technician delete', () => {
    it('is refused with 409 once a report or an incident exists', async () => {
      const [withReport, withIncident, free] = [await technician(), await technician(), await technician()] as [number, number, number];
      await http().put(`${day(withReport)}/report`).send({ body: 'x' }).expect(200);
      await http().post(`${day(withIncident)}/incidents`).send({ body: 'x' }).expect(201);

      await http().delete(`/technicians/${withReport}`).expect(409);
      await http().delete(`/technicians/${withIncident}`).expect(409);
      await http().delete(`/technicians/${free}`).expect(204);
    });
  });

  describe('day summary', () => {
    it('counts open incidents per technician for that date only', async () => {
      const tech = await technician();
      await http().post(`${day(tech)}/incidents`).send({ body: 'a' }).expect(201);
      const done = (await http().post(`${day(tech)}/incidents`).send({ body: 'b' }).expect(201)).body;
      await http().post(`${day(tech, '2026-07-02')}/incidents`).send({ body: 'c' }).expect(201);
      await http().post(`/incidents/${done.id}/review`).expect(201);

      const open = async (d: string): Promise<number> => (await http().get(`/days/${d}/summary`).expect(200)).body.technicians[0].openIncidents;
      expect(await open(DATE)).toBe(1);
      expect(await open('2026-07-02')).toBe(1);
      expect(await open('2026-07-03')).toBe(0);
    });
  });
});
