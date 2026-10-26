import request from 'supertest';
import { setupTestApp } from './app';

// |lon| > 90: a swapped write would put latitude out of range and PostGIS would reject it,
// and a swapped read would come back reversed. Either bug fails the round trip.
const BANGKOK: [number, number] = [100.5018, 13.7563];

describe('technicians', () => {
  const app = setupTestApp();
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  async function skill(code: string): Promise<number> {
    const res = await http().post('/skills').send({ code, name: code }).expect(201);
    return res.body.id;
  }

  it('creates a technician with skills and reads it back with [lon, lat] intact', async () => {
    const elec = await skill('ELEC');
    const plmb = await skill('PLMB');

    const created = await http()
      .post('/technicians')
      .send({ name: 'Dana', home: BANGKOK, shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [plmb, elec] })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(Number),
      name: 'Dana',
      home: BANGKOK,
      shiftStart: '08:00:00',
      shiftEnd: '17:00:00',
      skillIds: [elec, plmb],
    });
    await http().get(`/technicians/${created.body.id}`).expect(200, created.body);
    await http().get('/technicians').expect(200, [created.body]);
  });

  const dana = (skillIds: number[]): object => ({
    name: 'Dana',
    home: BANGKOK,
    shiftStart: '08:00:00',
    shiftEnd: '17:00:00',
    skillIds,
  });

  it('updates fields and replaces the skill set', async () => {
    const elec = await skill('ELEC');
    const plmb = await skill('PLMB');
    const { body } = await http().post('/technicians').send(dana([elec])).expect(201);

    await http()
      .patch(`/technicians/${body.id}`)
      .send({ shiftEnd: '18:30:00', skillIds: [plmb] })
      .expect(200, { ...body, shiftEnd: '18:30:00', skillIds: [plmb] });
    await http().patch(`/technicians/${body.id}`).send({ skillIds: [] }).expect(200, { ...body, shiftEnd: '18:30:00', skillIds: [] });
  });

  it('rejects unknown skill ids with 400 and stores nothing', async () => {
    const elec = await skill('ELEC');

    await http().post('/technicians').send(dana([elec, 999])).expect(400);
    await http().get('/technicians').expect(200, []);

    const { body } = await http().post('/technicians').send(dana([elec])).expect(201);
    await http().patch(`/technicians/${body.id}`).send({ name: 'Changed', skillIds: [999] }).expect(400);
    await http().get(`/technicians/${body.id}`).expect(200, body);
  });

  it.each([
    ['latitude out of range', { home: [34.78, 91] }],
    ['longitude out of range', { home: [181, 32.08] }],
    ['point with three numbers', { home: [34.78, 32.08, 0] }],
    ['shift time without seconds', { shiftStart: '08:00' }],
    ['shift end before start', { shiftStart: '17:00:00', shiftEnd: '08:00:00' }],
    ['unknown field', { status: 'x' }],
  ])('rejects an invalid technician (%s) with 400', async (_case, override) => {
    await http()
      .post('/technicians')
      .send({ ...dana([]), ...override })
      .expect(400);
    await http().get('/technicians').expect(200, []);
  });

  it('rejects a patch that makes the shift end before its start', async () => {
    const { body } = await http().post('/technicians').send(dana([])).expect(201);

    await http().patch(`/technicians/${body.id}`).send({ shiftEnd: '07:00:00' }).expect(400);
  });

  it('explains that overnight shifts are not supported', async () => {
    const res = await http()
      .post('/technicians')
      .send({ ...dana([]), shiftStart: '22:00:00', shiftEnd: '06:00:00' })
      .expect(400);

    expect(res.body.message).toMatch(/overnight shifts are not supported/);
  });

  it('deletes a technician and returns 404 for missing ones', async () => {
    const elec = await skill('ELEC');
    const { body } = await http().post('/technicians').send(dana([elec])).expect(201);

    await http().delete(`/technicians/${body.id}`).expect(204);
    await http().get(`/technicians/${body.id}`).expect(404);
    await http().patch(`/technicians/${body.id}`).send({ name: 'x' }).expect(404);
    await http().delete(`/technicians/${body.id}`).expect(404);
  });

  it('refuses to delete a skill a technician still has (409)', async () => {
    const elec = await skill('ELEC');
    await http().post('/technicians').send(dana([elec])).expect(201);

    await http().delete(`/skills/${elec}`).expect(409);
  });
});
