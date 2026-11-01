import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { ACTIVE_CAP_MESSAGE, DEACTIVATE_BLOCKED_MESSAGE, STALE_TECHNICIAN_MESSAGE } from '@shibutz/contracts';
import type { JobStatus, Technician, TechnicianChange } from '@shibutz/contracts';
import { DB, type Db } from '../src/db/db.module';
import { jobs, routeStops, routes } from '../src/db/schema';
import { setupTestApp } from './app';

const DAY1 = '2026-07-01';
const DAY2 = '2026-07-02';

describe('deactivate and reactivate technicians', () => {
  const app = setupTestApp();
  const http = (): ReturnType<typeof request> => request(app().getHttpServer());
  const db = (): Db => app().get<Db>(DB);

  const create = async (name = 'Dana'): Promise<Technician> =>
    (await http().post('/technicians').send({ name, home: [34.8, 32], shiftStart: '08:00:00', shiftEnd: '17:00:00', skillIds: [] }).expect(201)).body;

  /** A job on the day with a route stop for the technician (the route is created if needed). */
  async function stop(technicianId: number, date: string, status: JobStatus): Promise<void> {
    const [job] = await db()
      .insert(jobs)
      .values({
        title: 'J',
        address: 'A',
        location: [34.8, 32],
        serviceDurationS: 600,
        windowStart: new Date(`${date}T06:00:00Z`),
        windowEnd: new Date(`${date}T10:00:00Z`),
        priority: 50,
        status,
      })
      .returning({ id: jobs.id });
    const [route] = await db()
      .insert(routes)
      .values({ technicianId, date })
      .onConflictDoUpdate({ target: [routes.technicianId, routes.date], set: { version: sql`${routes.version}` } })
      .returning({ id: routes.id });
    if (!job || !route) throw new Error('setup');
    await db().insert(routeStops).values({ routeId: route.id, jobId: job.id, sequence: 1, eta: new Date(`${date}T06:00:00Z`), etd: new Date(`${date}T07:00:00Z`) });
  }
  const deactivate = (id: number, version: number): request.Test => http().post(`/technicians/${id}/deactivate`).send({ version });
  const reactivate = (id: number, version: number): request.Test => http().post(`/technicians/${id}/reactivate`).send({ version });
  const changes = async (): Promise<TechnicianChange[]> => (await http().get('/technician-changes')).body;

  it('deactivates: inactive, color freed, version bumped, logged with the name at the time', async () => {
    const a = await create();

    const res = await deactivate(a.id, 0).expect(201);

    expect(res.body).toMatchObject({ id: a.id, active: false, color: null, version: 1 });
    expect((await changes())[0]).toMatchObject({ action: 'deactivated', name: 'Dana', technicianId: a.id, before: null, after: null });
  });

  it('refuses while assigned or in_progress stops exist on any date, listing every blocking date; done stops do not block', async () => {
    const a = await create();
    await stop(a.id, DAY2, 'assigned');
    await stop(a.id, DAY1, 'in_progress');
    await stop(a.id, '2026-07-03', 'done');

    const res = await deactivate(a.id, 0).expect(409);

    expect(res.body).toMatchObject({ message: DEACTIVATE_BLOCKED_MESSAGE, dates: [DAY1, DAY2] });
    expect((await http().get(`/technicians/${a.id}`)).body).toMatchObject({ active: true, version: 0 });
    expect(await changes()).toHaveLength(1); // only "created"

    const b = await create('Eli');
    await stop(b.id, DAY1, 'done');
    await deactivate(b.id, 0).expect(201);
  });

  it('deletes the technician\'s empty routes in the same transaction, keeps routes with history', async () => {
    const a = await create();
    await stop(a.id, DAY1, 'done');
    await db().insert(routes).values({ technicianId: a.id, date: DAY2 });

    await deactivate(a.id, 0).expect(201);

    const left = await db().select({ date: routes.date }).from(routes).where(eq(routes.technicianId, a.id));
    expect(left.map((r) => r.date)).toEqual([DAY1]);
  });

  it('rejects a stale version and an already inactive technician', async () => {
    const a = await create();
    expect((await deactivate(a.id, 5).expect(409)).body.message).toBe(STALE_TECHNICIAN_MESSAGE);
    await deactivate(a.id, 0).expect(201);
    await deactivate(a.id, 1).expect(409);
    await deactivate(9999, 0).expect(404);
  });

  it('frees the color for the next create, and reactivation takes the lowest free one', async () => {
    const [a, b] = [await create('A'), await create('B')];
    await deactivate(a.id, 0).expect(201);
    expect((await create('C')).color).toBe(1);

    await deactivate(b.id, 0).expect(201);
    const res = await reactivate(a.id, 1).expect(201);

    expect(res.body).toMatchObject({ id: a.id, active: true, color: 2, version: 2 });
    expect((await changes())[0]).toMatchObject({ action: 'reactivated', name: 'A' });
  });

  it('refuses reactivation at the cap of 8 active, stale versions, and technicians that are already active', async () => {
    const a = await create('A');
    await deactivate(a.id, 0).expect(201);
    for (let i = 0; i < 8; i++) await create(`T${i}`);

    expect((await reactivate(a.id, 1).expect(409)).body.message).toBe(ACTIVE_CAP_MESSAGE);
    expect((await http().get(`/technicians/${a.id}`)).body).toMatchObject({ active: false, color: null });
    await reactivate(a.id, 0).expect(409);
    const active = (await http().get('/technicians')).body.find((t: Technician) => t.active);
    await reactivate(active.id, active.version).expect(409);
  });

  it('accepts only name edits while inactive', async () => {
    const a = await create();
    await deactivate(a.id, 0).expect(201);

    await http().patch(`/technicians/${a.id}`).send({ shiftEnd: '18:00:00', version: 1 }).expect(409);
    await http().patch(`/technicians/${a.id}`).send({ name: 'Dani', version: 1 }).expect(200);
  });
});
