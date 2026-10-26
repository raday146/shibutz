import request from 'supertest';
import { setupTestApp } from './app';

describe('skills', () => {
  const app = setupTestApp();
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  it('creates a skill and reads it back by id', async () => {
    const created = await http().post('/skills').send({ code: 'ELEC', name: 'Electrician' }).expect(201);

    expect(created.body).toEqual({ id: expect.any(Number), code: 'ELEC', name: 'Electrician' });
    await http().get(`/skills/${created.body.id}`).expect(200, created.body);
  });

  it.each([
    ['missing name', { code: 'ELEC' }],
    ['empty code', { code: '', name: 'Electrician' }],
    ['non-string name', { code: 'ELEC', name: 42 }],
    ['unknown field', { code: 'ELEC', name: 'Electrician', id: 7 }],
  ])('rejects an invalid payload (%s) with 400 and stores nothing', async (_case, payload) => {
    const res = await http().post('/skills').send(payload).expect(400);

    expect(res.body.issues).toEqual(expect.any(Array));
    await http().get('/skills').expect(200, []);
  });

  it('lists skills ordered by id', async () => {
    await http().post('/skills').send({ code: 'ELEC', name: 'Electrician' }).expect(201);
    await http().post('/skills').send({ code: 'PLMB', name: 'Plumber' }).expect(201);

    const res = await http().get('/skills').expect(200);

    expect(res.body.map((s: { code: string }) => s.code)).toEqual(['ELEC', 'PLMB']);
  });

  it('updates a skill partially', async () => {
    const { body } = await http().post('/skills').send({ code: 'ELEC', name: 'Electrician' }).expect(201);

    await http()
      .patch(`/skills/${body.id}`)
      .send({ name: 'Electrical technician' })
      .expect(200, { id: body.id, code: 'ELEC', name: 'Electrical technician' });
    await http().get(`/skills/${body.id}`).expect(200, { id: body.id, code: 'ELEC', name: 'Electrical technician' });
  });

  it('rejects an empty update with 400', async () => {
    const { body } = await http().post('/skills').send({ code: 'ELEC', name: 'Electrician' }).expect(201);

    await http().patch(`/skills/${body.id}`).send({}).expect(400);
  });

  it('deletes a skill', async () => {
    const { body } = await http().post('/skills').send({ code: 'ELEC', name: 'Electrician' }).expect(201);

    await http().delete(`/skills/${body.id}`).expect(204);
    await http().get(`/skills/${body.id}`).expect(404);
  });

  it('returns 404 for a missing skill on read, update and delete', async () => {
    await http().get('/skills/999').expect(404);
    await http().patch('/skills/999').send({ name: 'x' }).expect(404);
    await http().delete('/skills/999').expect(404);
  });

  it('returns 409 when the code is already taken', async () => {
    await http().post('/skills').send({ code: 'ELEC', name: 'Electrician' }).expect(201);
    const { body } = await http().post('/skills').send({ code: 'PLMB', name: 'Plumber' }).expect(201);

    await http().post('/skills').send({ code: 'ELEC', name: 'Another' }).expect(409);
    await http().patch(`/skills/${body.id}`).send({ code: 'ELEC' }).expect(409);
  });

  it('starts every test from an empty database', async () => {
    const { body } = await http().post('/skills').send({ code: 'ELEC', name: 'Electrician' }).expect(201);

    expect(body.id).toBe(1);
  });
});
