import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, notExists, sql } from 'drizzle-orm';
import { ACTIVE_CAP_MESSAGE, DEACTIVATE_BLOCKED_MESSAGE, INACTIVE_TECHNICIAN_MESSAGE, MAX_ACTIVE_TECHNICIANS, STALE_TECHNICIAN_MESSAGE } from '@shibutz/contracts';
import type { CreateTechnician, Technician, TechnicianChange, TechnicianChangeFields, TechnicianChangesQuery, TechnicianVersion, UpdateTechnician } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { isForeignKeyViolation, isUniqueViolation, rejectInvalid } from '../db/errors';
import { jobs, routeStops, routes, technicianChanges, technicianSkills, technicians } from '../db/schema';

const columns = {
  id: technicians.id,
  name: technicians.name,
  home: technicians.home,
  shiftStart: technicians.shiftStart,
  shiftEnd: technicians.shiftEnd,
  color: technicians.color,
  active: technicians.active,
  version: technicians.version,
  skillIds: sql<number[]>`coalesce((
    select array_agg(${technicianSkills.skillId} order by ${technicianSkills.skillId})
    from ${technicianSkills} where ${technicianSkills.technicianId} = ${technicians.id}), '{}')`,
};

/** The fields of `now` that differ from `was`, as before and after values; null when nothing changed. */
function diff(was: TechnicianChangeFields, now: TechnicianChangeFields): { before: TechnicianChangeFields; after: TechnicianChangeFields } | null {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(now) as (keyof TechnicianChangeFields)[]) {
    if (JSON.stringify(was[key]) === JSON.stringify(now[key])) continue;
    before[key] = was[key];
    after[key] = now[key];
  }
  return Object.keys(after).length ? { before, after } : null;
}

@Injectable()
export class TechniciansService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(): Promise<Technician[]> {
    return this.db.select(columns).from(technicians).orderBy(asc(technicians.id));
  }

  async changes({ technicianId, limit }: TechnicianChangesQuery): Promise<TechnicianChange[]> {
    const rows = await this.db
      .select()
      .from(technicianChanges)
      .where(technicianId === undefined ? undefined : eq(technicianChanges.technicianId, technicianId))
      .orderBy(desc(technicianChanges.id))
      .limit(limit ?? 1000);
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
  }

  async get(id: number): Promise<Technician> {
    const [row] = await this.db.select(columns).from(technicians).where(eq(technicians.id, id));
    if (!row) throw new NotFoundException('Technician not found');
    return row;
  }

  create(body: CreateTechnician): Promise<Technician> {
    return this.withColorRetry(async () => this.get(await this.createOnce(body)));
  }

  /** Two writers racing for the same free color: the partial unique index lets one win; the loser retries once on fresh data. */
  private async withColorRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run();
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (attempt === 2) throw new ConflictException('Technician color was taken concurrently; retry');
      }
    }
  }

  /** The lowest color slot no active technician holds; 409 at the cap. */
  private async freeColor(tx: Pick<Db, 'select'>): Promise<number> {
    const taken = new Set((await tx.select({ color: technicians.color }).from(technicians).where(isNotNull(technicians.color))).map((r) => r.color));
    const color = Array.from({ length: MAX_ACTIVE_TECHNICIANS }, (_, i) => i + 1).find((slot) => !taken.has(slot));
    if (color === undefined) throw new ConflictException(ACTIVE_CAP_MESSAGE);
    return color;
  }

  /**
   * For planning writers, inside their own transaction and BEFORE they lock any job or route row (lock order:
   * technicians, then jobs, then routes, as job-status start does): every technician they write to is still active
   * and unchanged since `expected` (id to the version their candidate data was read at), else 409. A shared row lock
   * makes a deactivation or an edit wait for the writer (and then see its stops), or the writer see them.
   */
  async assertActive(tx: Pick<Db, 'select'>, expected: ReadonlyMap<number, number>): Promise<void> {
    if (!expected.size) return;
    const rows = await tx
      .select({ id: technicians.id, active: technicians.active, version: technicians.version })
      .from(technicians)
      .where(inArray(technicians.id, [...expected.keys()]))
      .orderBy(asc(technicians.id))
      .for('share');
    if (rows.length !== expected.size || rows.some((r) => !r.active)) throw new ConflictException(INACTIVE_TECHNICIAN_MESSAGE);
    // Home, shift or skills changed since the candidates were read: the planned stops would rest on outdated data.
    if (rows.some((r) => r.version !== expected.get(r.id))) throw new ConflictException(STALE_TECHNICIAN_MESSAGE);
  }

  /** Locks the technician and checks the reviewed version is still current. */
  private async lockAtVersion(tx: Pick<Db, 'select'>, id: number, version: number): Promise<Technician> {
    const [was] = await tx.select(columns).from(technicians).where(eq(technicians.id, id)).for('update');
    if (!was) throw new NotFoundException('Technician not found');
    if (was.version !== version) throw new ConflictException(STALE_TECHNICIAN_MESSAGE);
    return was;
  }

  /** Refused while assigned or in_progress stops exist on any date (409 listing every such date). Empty routes go with it. */
  async deactivate(id: number, { version }: TechnicianVersion): Promise<Technician> {
    await this.db.transaction(async (tx) => {
      const was = await this.lockAtVersion(tx, id, version);
      if (!was.active) throw new ConflictException('Technician is already inactive');
      const blocking = await tx
        .selectDistinct({ date: routes.date })
        .from(routeStops)
        .innerJoin(routes, eq(routes.id, routeStops.routeId))
        .innerJoin(jobs, eq(jobs.id, routeStops.jobId))
        .where(and(eq(routes.technicianId, id), inArray(jobs.status, ['assigned', 'in_progress'])))
        .orderBy(asc(routes.date));
      if (blocking.length) throw new ConflictException({ message: DEACTIVATE_BLOCKED_MESSAGE, dates: blocking.map((r) => r.date) });
      await tx.delete(routes).where(and(eq(routes.technicianId, id), notExists(tx.select({ one: sql`1` }).from(routeStops).where(eq(routeStops.routeId, routes.id)))));
      await tx.update(technicians).set({ active: false, color: null, version: sql`${technicians.version} + 1` }).where(eq(technicians.id, id));
      await tx.insert(technicianChanges).values({ technicianId: id, action: 'deactivated', name: was.name });
    });
    return this.get(id);
  }

  /** Takes the lowest free color; 409 at the cap of active technicians. */
  reactivate(id: number, { version }: TechnicianVersion): Promise<Technician> {
    return this.withColorRetry(async () => {
      await rejectInvalid(
        this.db.transaction(async (tx) => {
          const was = await this.lockAtVersion(tx, id, version);
          if (was.active) throw new ConflictException('Technician is already active');
          const color = await this.freeColor(tx);
          await tx.update(technicians).set({ active: true, color, version: sql`${technicians.version} + 1` }).where(eq(technicians.id, id));
          await tx.insert(technicianChanges).values({ technicianId: id, action: 'reactivated', name: was.name });
        }),
      );
      return this.get(id);
    });
  }

  private createOnce({ skillIds, ...fields }: CreateTechnician): Promise<number> {
    return rejectInvalid(
      this.db.transaction(async (tx) => {
        const color = await this.freeColor(tx);
        const [row] = await tx.insert(technicians).values({ ...fields, color }).returning({ id: technicians.id });
        if (!row) throw new Error('Insert returned no row');
        if (skillIds.length) await tx.insert(technicianSkills).values(skillIds.map((skillId) => ({ technicianId: row.id, skillId })));
        await tx.insert(technicianChanges).values({
          technicianId: row.id,
          action: 'created',
          name: fields.name,
          after: { ...fields, skillIds: [...skillIds].sort((a, b) => a - b) },
        });
        return row.id;
      }),
    );
  }

  async update(id: number, { skillIds, version, ...fields }: UpdateTechnician): Promise<Technician> {
    await rejectInvalid(
      this.db.transaction(async (tx) => {
        // Locked, so the logged before-values are exactly what this update replaces.
        const [was] = await tx.select(columns).from(technicians).where(eq(technicians.id, id)).for('update');
        if (!was) throw new NotFoundException('Technician not found');
        // The reviewed version must still be current. The UPDATE both checks and bumps it (and locks the row), so a
        // skills-only edit is versioned too and two edits from the same version cannot both win.
        const [row] = await tx
          .update(technicians)
          .set({ ...fields, version: sql`${technicians.version} + 1` })
          .where(and(eq(technicians.id, id), eq(technicians.version, version)))
          .returning({ active: technicians.active });
        if (!row) {
          const [exists] = await tx.select({ id: technicians.id }).from(technicians).where(eq(technicians.id, id));
          throw exists ? new ConflictException(STALE_TECHNICIAN_MESSAGE) : new NotFoundException('Technician not found');
        }
        if (skillIds || Object.keys(fields).some((k) => k !== 'name')) {
          // An inactive technician keeps the home, shift and skills their history was built on.
          if (!row.active) throw new ConflictException('Inactive technician: only the name can be edited');
          // Home, shift and skills feed the stored ETAs and the skill match, so they are frozen while active stops exist.
          // Done stops are history and do not block edits.
          const [stop] = await tx
            .select({ id: routeStops.id })
            .from(routeStops)
            .innerJoin(routes, eq(routes.id, routeStops.routeId))
            .innerJoin(jobs, eq(jobs.id, routeStops.jobId))
            .where(and(eq(routes.technicianId, id), inArray(jobs.status, ['assigned', 'in_progress'])))
            .limit(1);
          if (stop) throw new ConflictException('Technician has stops on a route; unassign or cancel those jobs first');
        }
        if (skillIds) {
          await tx.delete(technicianSkills).where(eq(technicianSkills.technicianId, id));
          if (skillIds.length) await tx.insert(technicianSkills).values(skillIds.map((skillId) => ({ technicianId: id, skillId })));
        }
        const changed = diff(was, { ...fields, ...(skillIds && { skillIds: [...skillIds].sort((a, b) => a - b) }) });
        if (changed) await tx.insert(technicianChanges).values({ technicianId: id, action: 'updated', name: fields.name ?? was.name, ...changed });
      }),
    );
    return this.get(id);
  }

  async remove(id: number): Promise<void> {
    const [stop] = await this.db
      .select({ id: routeStops.id })
      .from(routeStops)
      .innerJoin(routes, eq(routes.id, routeStops.routeId))
      .where(eq(routes.technicianId, id))
      .limit(1);
    if (stop) throw new ConflictException('Technician has stops on a route; unassign or cancel those jobs first');
    const [row] = await this.db
      .delete(technicians)
      .where(eq(technicians.id, id))
      .returning({ id: technicians.id })
      .catch((err: unknown) => {
        // A day report or incident still refers to the technician.
        if (isForeignKeyViolation(err)) throw new ConflictException('Technician has a day report or incidents and cannot be deleted');
        throw err;
      });
    if (!row) throw new NotFoundException('Technician not found');
  }
}
