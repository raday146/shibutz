import { sql } from 'drizzle-orm';
import request from 'supertest';
import { ACTIVE_CAP_MESSAGE, STALE_TECHNICIAN_MESSAGE } from '@shibutz/contracts';
import type { TechnicianChange } from '@shibutz/contracts';
import { DB, type Db } from '../src/db/db.module';
import { setupTestApp } from './app';

// |lon| > 90: a swapped write would put latitude out of range and PostGIS would reject it,
// and a swapped read would come back reversed. Either bug fails the round trip.
const BANGKOK: [number, number] = [100.5018, 13.7563];

describe('technicians', () => {
  const app = setupTestApp();
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());

  async function skill(code: string): Promise<number> {
    const res = await http().post('/skills').send({ code, nameEn: code, nameHe: code }).expect(201);
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
      color: 1,
      active: true,
      version: 0,
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
      .send({ shiftEnd: '18:30:00', skillIds: [plmb], version: 0 })
      .expect(200, { ...body, shiftEnd: '18:30:00', skillIds: [plmb], version: 1 });
    await http().patch(`/technicians/${body.id}`).send({ skillIds: [], version: 1 }).expect(200, { ...body, shiftEnd: '18:30:00', skillIds: [], version: 2 });
  });

  describe('versioned update', () => {
    it('refuses a stale version with 409 and writes nothing; a skills-only edit also bumps the version', async () => {
      const elec = await skill('ELEC');
      const { body } = await http().post('/technicians').send(dana([elec])).expect(201);
      await http().patch(`/technicians/${body.id}`).send({ skillIds: [], version: 0 }).expect(200);

      const res = await http().patch(`/technicians/${body.id}`).send({ name: 'Late', version: 0 }).expect(409);

      expect(res.body.message).toBe(STALE_TECHNICIAN_MESSAGE);
      await http().get(`/technicians/${body.id}`).expect(200, { ...body, skillIds: [], version: 1 });
    });

    it('two edits from the same version: exactly one wins', async () => {
      const { body } = await http().post('/technicians').send(dana([])).expect(201);

      const results = await Promise.all(['A', 'B'].map((name) => http().patch(`/technicians/${body.id}`).send({ name, version: 0 })));

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it('requires the version and at least one field', async () => {
      const { body } = await http().post('/technicians').send(dana([])).expect(201);

      await http().patch(`/technicians/${body.id}`).send({ name: 'x' }).expect(400);
      await http().patch(`/technicians/${body.id}`).send({ version: 0 }).expect(400);
    });

    it('lets an inactive technician change only the name', async () => {
      const { body } = await http().post('/technicians').send(dana([])).expect(201);
      await app().get<Db>(DB).execute(sql`UPDATE technicians SET active = false, color = NULL WHERE id = ${body.id}`);

      await http().patch(`/technicians/${body.id}`).send({ shiftEnd: '18:00:00', version: 0 }).expect(409);
      await http().patch(`/technicians/${body.id}`).send({ name: 'Renamed', version: 0 }).expect(200);
    });
  });

  it('rejects unknown skill ids with 400 and stores nothing', async () => {
    const elec = await skill('ELEC');

    await http().post('/technicians').send(dana([elec, 999])).expect(400);
    await http().get('/technicians').expect(200, []);

    const { body } = await http().post('/technicians').send(dana([elec])).expect(201);
    await http().patch(`/technicians/${body.id}`).send({ name: 'Changed', skillIds: [999], version: 0 }).expect(400);
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

    await http().patch(`/technicians/${body.id}`).send({ shiftEnd: '07:00:00', version: 0 }).expect(400);
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
    await http().patch(`/technicians/${body.id}`).send({ name: 'x', version: 0 }).expect(404);
    await http().delete(`/technicians/${body.id}`).expect(404);
  });

  it('refuses to delete a skill a technician still has (409)', async () => {
    const elec = await skill('ELEC');
    await http().post('/technicians').send(dana([elec])).expect(201);

    await http().delete(`/skills/${elec}`).expect(409);
  });

  describe('color slot', () => {
    const create = async (): Promise<{ id: number; color: number }> => (await http().post('/technicians').send(dana([])).expect(201)).body;
    const db = (): Db => app().get<Db>(DB);
    /** The constraint the database named when it refused the write. */
    const violated = (query: ReturnType<typeof sql>): Promise<string | undefined> =>
      db().execute(query).then(() => undefined, (e: Error) => (e.cause as { constraint?: string }).constraint);

    it('gives a new technician the lowest free slot, and keeps colors stable when others are deleted', async () => {
      const [a, b, c] = [await create(), await create(), await create()];
      expect([a.color, b.color, c.color]).toEqual([1, 2, 3]);

      await http().delete(`/technicians/${b.id}`).expect(204);

      expect((await create()).color).toBe(2);
      await http().get(`/technicians/${c.id}`).expect((r) => expect(r.body.color).toBe(3));
    });

    it('allows at most 8 active: the 9th create is a 409 and stores nothing', async () => {
      const first = [];
      for (let i = 0; i < 8; i++) first.push(await create());
      expect(first.map((t) => t.color)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const res = await http().post('/technicians').send(dana([])).expect(409);
      expect(res.body.message).toBe(ACTIVE_CAP_MESSAGE);
      expect((await http().get('/technicians')).body).toHaveLength(8);
    });

    it('does not count inactive technicians toward the cap, and total is unbounded', async () => {
      for (let i = 0; i < 8; i++) await create();
      // Deactivation arrives in a later ticket; inactive rows are written directly here.
      await db().execute(sql`UPDATE technicians SET active = false, color = NULL WHERE id IN (1, 2, 3)`);

      expect((await create()).color).toBe(1);
      expect((await create()).color).toBe(2);
      expect((await create()).color).toBe(3);
      await http().post('/technicians').send(dana([])).expect(409);
      expect((await http().get('/technicians')).body).toHaveLength(11);
      expect((await http().get('/technicians/1')).body).toMatchObject({ active: false, color: null });
    });

    it('answers one of two creates racing for the last color with 409, never a duplicate color or a 500', async () => {
      for (let i = 0; i < 7; i++) await create();

      const results = await Promise.all([http().post('/technicians').send(dana([])), http().post('/technicians').send(dana([]))]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const colors = (await http().get('/technicians')).body.map((t: { color: number }) => t.color);
      expect([...colors].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('holds the invariants in the database itself', async () => {
      await create();
      await expect(violated(sql`UPDATE technicians SET color = NULL WHERE id = 1`)).resolves.toBe('technicians_active_color');
      await expect(violated(sql`UPDATE technicians SET active = false WHERE id = 1`)).resolves.toBe('technicians_active_color');
      await expect(violated(sql`UPDATE technicians SET color = 9 WHERE id = 1`)).resolves.toBe('technicians_color_range');

      await create();
      // Two active technicians can not share a color ...
      await expect(violated(sql`UPDATE technicians SET color = 1 WHERE id = 2`)).resolves.toBe('technicians_active_color_key');
      // ... but an inactive one has none, and a reactivated one may take a free one.
      await db().execute(sql`UPDATE technicians SET active = false, color = NULL WHERE id = 1`);
      await db().execute(sql`UPDATE technicians SET color = 1 WHERE id = 2`);
      await db().execute(sql`UPDATE technicians SET active = true, color = 5 WHERE id = 1`);
    });

    it.each([0, 9, 1.5, '2', 4])('rejects a color %p on update: color is always assigned by the server', async (color) => {
      const { body } = await http().post('/technicians').send(dana([])).expect(201);

      await http().patch(`/technicians/${body.id}`).send({ color }).expect(400);
    });

    it('does not accept a color on create', async () => {
      await http().post('/technicians').send({ ...dana([]), color: 4 }).expect(400);
    });
  });

  describe('change log', () => {
    const changes = async (query = ''): Promise<{ status: number; body: TechnicianChange[] }> => http().get(`/technician-changes${query}`);

    it('logs a create with its fields, and an update with only the changed fields', async () => {
      const elec = await skill('ELEC');
      const { body } = await http().post('/technicians').send(dana([elec])).expect(201);
      await http().patch(`/technicians/${body.id}`).send({ shiftEnd: '18:30:00', name: 'Dana', version: 0 }).expect(200);

      const res = await changes();

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 2, at: expect.any(String), technicianId: body.id, action: 'updated', name: 'Dana', before: { shiftEnd: '17:00:00' }, after: { shiftEnd: '18:30:00' } },
        {
          id: 1,
          at: expect.any(String),
          technicianId: body.id,
          action: 'created',
          name: 'Dana',
          before: null,
          after: { name: 'Dana', home: BANGKOK, shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [elec] },
        },
      ]);
    });

    it('logs a name-only edit, and keeps the old name on earlier rows after a rename', async () => {
      const { body } = await http().post('/technicians').send(dana([])).expect(201);
      await http().patch(`/technicians/${body.id}`).send({ name: 'Dani', version: 0 }).expect(200);

      const res = await changes();

      expect(res.body.map((r) => [r.action, r.name, r.before, r.after])).toEqual([
        ['updated', 'Dani', { name: 'Dana' }, { name: 'Dani' }],
        ['created', 'Dana', null, expect.objectContaining({ name: 'Dana' })],
      ]);
    });

    it('logs skills changes and writes nothing for a failed or unchanged edit', async () => {
      const elec = await skill('ELEC');
      const { body } = await http().post('/technicians').send(dana([])).expect(201);
      await http().patch(`/technicians/${body.id}`).send({ name: 'X', skillIds: [999], version: 0 }).expect(400);
      await http().patch(`/technicians/${body.id}`).send({ name: 'Y', version: 5 }).expect(409);
      await http().patch(`/technicians/${body.id}`).send({ name: 'Dana', version: 0 }).expect(200);
      await http().patch(`/technicians/${body.id}`).send({ skillIds: [elec], version: 1 }).expect(200);

      const res = await changes();

      expect(res.body.map((r) => [r.action, r.before, r.after])).toEqual([
        ['updated', { skillIds: [] }, { skillIds: [elec] }],
        ['created', null, expect.any(Object)],
      ]);
    });

    it('is a top-level route that does not clash with /technicians/:id, and filters by technicianId', async () => {
      const a = (await http().post('/technicians').send(dana([])).expect(201)).body;
      const b = (await http().post('/technicians').send({ ...dana([]), name: 'Eli' }).expect(201)).body;
      await http().patch(`/technicians/${a.id}`).send({ name: 'Dan', version: 0 }).expect(200);

      expect((await changes()).body).toHaveLength(3);
      expect((await changes(`?technicianId=${b.id}`)).body.map((r) => r.name)).toEqual(['Eli']);
      expect((await changes(`?technicianId=${a.id}&limit=1`)).body.map((r) => r.action)).toEqual(['updated']);
      await http().get('/technician-changes?technicianId=abc').expect(400);
      await http().get(`/technicians/${a.id}`).expect(200);
    });

    it('keeps the log when the technician is deleted', async () => {
      const { body } = await http().post('/technicians').send(dana([])).expect(201);
      await http().delete(`/technicians/${body.id}`).expect(204);

      expect((await changes()).body).toHaveLength(1);
    });
  });
});
