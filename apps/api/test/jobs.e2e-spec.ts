import request from 'supertest';
import { setupTestApp } from './app';

// |lon| > 90 so a swapped coordinate cannot round-trip (see technicians.e2e-spec.ts).
const BANGKOK: [number, number] = [100.5018, 13.7563];

describe('jobs', () => {
  const app = setupTestApp();
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  async function skill(code: string): Promise<number> {
    const res = await http().post('/skills').send({ code, name: code }).expect(201);
    return res.body.id;
  }

  // 2026-07-01 is summer time in Israel (UTC+3): local 09:00-12:00.
  const job = (skillIds: number[]): Record<string, unknown> => ({
    title: 'Fix boiler',
    address: '12 Herzl St, Tel Aviv',
    location: BANGKOK,
    skillIds,
    serviceDurationS: 1800,
    windowStart: '2026-07-01T06:00:00Z',
    windowEnd: '2026-07-01T09:00:00Z',
    priority: 50,
  });

  it('creates an unassigned job and reads it back in UTC with [lon, lat] intact', async () => {
    const elec = await skill('ELEC');
    const plmb = await skill('PLMB');

    const created = await http()
      .post('/jobs')
      .send({ ...job([plmb, elec]), windowStart: '2026-07-01T09:00:00+03:00' })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(Number),
      title: 'Fix boiler',
      address: '12 Herzl St, Tel Aviv',
      location: BANGKOK,
      skillIds: [elec, plmb],
      serviceDurationS: 1800,
      windowStart: '2026-07-01T06:00:00.000Z',
      windowEnd: '2026-07-01T09:00:00.000Z',
      priority: 50,
      status: 'unassigned',
      day: '2026-07-01',
      unassignedReason: null,
      unassignedAt: null,
    });
    await http().get(`/jobs/${created.body.id}`).expect(200, created.body);
    await http().get('/jobs').expect(200, [created.body]);
  });

  it.each([
    // local 00:30 on Jul 2 is still Jul 1 in UTC: the day is the local date.
    ['just after local midnight', '2026-07-01T21:30:00Z', '2026-07-01T23:00:00Z', '2026-07-02'],
    // local 23:00-23:59:59 stays inside the day.
    ['ending one second before local midnight', '2026-07-01T20:00:00Z', '2026-07-01T20:59:59Z', '2026-07-01'],
    // winter time (UTC+2).
    ['in winter time', '2026-01-15T22:30:00Z', '2026-01-15T23:00:00Z', '2026-01-16'],
  ])('derives the day from the local window start (%s)', async (_case, windowStart, windowEnd, day) => {
    const res = await http()
      .post('/jobs')
      .send({ ...job([]), windowStart, windowEnd })
      .expect(201);

    expect(res.body.day).toBe(day);
  });

  it.each([
    ['crossing local midnight', '2026-07-01T20:00:00Z', '2026-07-01T22:00:00Z', /same_local_day/],
    ['ending exactly at local midnight', '2026-07-01T20:00:00Z', '2026-07-01T21:00:00Z', /same_local_day/],
    ['ending before it starts', '2026-07-01T09:00:00Z', '2026-07-01T06:00:00Z', /window_order/],
    ['empty window', '2026-07-01T06:00:00Z', '2026-07-01T06:00:00Z', /window_order/],
  ])('rejects a window %s with 400', async (_case, windowStart, windowEnd, reason) => {
    const res = await http()
      .post('/jobs')
      .send({ ...job([]), windowStart, windowEnd })
      .expect(400);

    expect(res.body.message).toMatch(reason);
    await http().get('/jobs').expect(200, []);
  });

  it('rejects a patch that moves the window end past local midnight', async () => {
    const { body } = await http().post('/jobs').send(job([])).expect(201);

    await http().patch(`/jobs/${body.id}`).send({ windowEnd: '2026-07-01T22:00:00Z' }).expect(400);
    await http().get(`/jobs/${body.id}`).expect(200, body);
  });

  it.each([
    ['priority below 0', { priority: -1 }],
    ['priority above 100', { priority: 101 }],
    ['fractional priority', { priority: 50.5 }],
    ['zero service duration', { serviceDurationS: 0 }],
    ['window without offset', { windowStart: '2026-07-01T06:00:00' }],
    ['latitude out of range', { location: [34.78, -91] }],
    ['status set on create', { status: 'assigned' }],
  ])('rejects an invalid job (%s) with 400', async (_case, override) => {
    await http()
      .post('/jobs')
      .send({ ...job([]), ...override })
      .expect(400);
    await http().get('/jobs').expect(200, []);
  });

  it.each([
    ['missing title', { title: undefined }, 'title'],
    ['blank title', { title: '   ' }, 'title'],
    ['missing address', { address: undefined }, 'address'],
    ['blank address', { address: '' }, 'address'],
  ])('rejects a job with %s and says which field', async (_case, override, field) => {
    const res = await http()
      .post('/jobs')
      .send({ ...job([]), ...override })
      .expect(400);

    expect(res.body.issues).toEqual([expect.objectContaining({ path: [field], message: expect.stringMatching(/required/) })]);
    await http().get('/jobs').expect(200, []);
  });

  it('updates title and address and rejects blanks on patch', async () => {
    const { body } = await http().post('/jobs').send(job([])).expect(201);

    await http()
      .patch(`/jobs/${body.id}`)
      .send({ title: ' Replace pump ', address: '3 Allenby' })
      .expect(200, { ...body, title: 'Replace pump', address: '3 Allenby' });
    await http().patch(`/jobs/${body.id}`).send({ title: '' }).expect(400);
  });

  it('accepts priority 0 and 100', async () => {
    await http()
      .post('/jobs')
      .send({ ...job([]), priority: 0 })
      .expect(201);
    await http()
      .post('/jobs')
      .send({ ...job([]), priority: 100 })
      .expect(201);
  });

  it('rejects unknown skill ids with 400 and stores nothing', async () => {
    const elec = await skill('ELEC');

    await http().post('/jobs').send(job([elec, 999])).expect(400);
    await http().get('/jobs').expect(200, []);

    const { body } = await http().post('/jobs').send(job([elec])).expect(201);
    await http().patch(`/jobs/${body.id}`).send({ skillIds: [999] }).expect(400);
    await http().get(`/jobs/${body.id}`).expect(200, body);
  });

  it('updates fields, re-derives the day and replaces required skills', async () => {
    const elec = await skill('ELEC');
    const plmb = await skill('PLMB');
    const { body } = await http().post('/jobs').send(job([elec])).expect(201);

    await http()
      .patch(`/jobs/${body.id}`)
      .send({ windowStart: '2026-07-02T06:00:00Z', windowEnd: '2026-07-02T08:00:00Z', priority: 90, skillIds: [plmb] })
      .expect(200, {
        ...body,
        windowStart: '2026-07-02T06:00:00.000Z',
        windowEnd: '2026-07-02T08:00:00.000Z',
        day: '2026-07-02',
        priority: 90,
        skillIds: [plmb],
      });
  });

  it('deletes a job and returns 404 for missing ones', async () => {
    const elec = await skill('ELEC');
    const { body } = await http().post('/jobs').send(job([elec])).expect(201);

    await http().delete(`/jobs/${body.id}`).expect(204);
    await http().get(`/jobs/${body.id}`).expect(404);
    await http().patch(`/jobs/${body.id}`).send({ priority: 1 }).expect(404);
    await http().delete(`/jobs/${body.id}`).expect(404);
    await http().delete(`/skills/${elec}`).expect(204);
  });

  it('refuses to delete a skill a job still requires (409)', async () => {
    const elec = await skill('ELEC');
    await http().post('/jobs').send(job([elec])).expect(201);

    await http().delete(`/skills/${elec}`).expect(409);
  });
});
