import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { ACTIVE_CAP_MESSAGE } from '@shibutz/contracts';
import type { CreateTechnician, Technician, UpdateTechnician } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { isForeignKeyViolation, isUniqueViolation, rejectInvalid } from '../db/errors';
import { jobs, routeStops, routes, technicianSkills, technicians } from '../db/schema';

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

@Injectable()
export class TechniciansService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(): Promise<Technician[]> {
    return this.db.select(columns).from(technicians).orderBy(asc(technicians.id));
  }

  async get(id: number): Promise<Technician> {
    const [row] = await this.db.select(columns).from(technicians).where(eq(technicians.id, id));
    if (!row) throw new NotFoundException('Technician not found');
    return row;
  }

  async create(body: CreateTechnician): Promise<Technician> {
    // Two creates racing for the same free color: the partial unique index lets one win; the loser retries once on fresh data.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.get(await this.createOnce(body));
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (attempt === 2) throw new ConflictException('Technician color was taken concurrently; retry');
      }
    }
  }

  private createOnce({ skillIds, ...fields }: CreateTechnician): Promise<number> {
    return rejectInvalid(
      this.db.transaction(async (tx) => {
        const taken = new Set(
          (await tx.select({ color: technicians.color }).from(technicians).where(isNotNull(technicians.color))).map((r) => r.color),
        );
        const color = [1, 2, 3, 4, 5, 6, 7, 8].find((slot) => !taken.has(slot));
        if (color === undefined) throw new ConflictException(ACTIVE_CAP_MESSAGE);
        const [row] = await tx.insert(technicians).values({ ...fields, color }).returning({ id: technicians.id });
        if (!row) throw new Error('Insert returned no row');
        if (skillIds.length) await tx.insert(technicianSkills).values(skillIds.map((skillId) => ({ technicianId: row.id, skillId })));
        return row.id;
      }),
    );
  }

  async update(id: number, { skillIds, ...fields }: UpdateTechnician): Promise<Technician> {
    await rejectInvalid(
      this.db.transaction(async (tx) => {
        // Home, shift and skills feed the stored ETAs and the skill match, so they are frozen while active stops exist.
        // Done stops are history and do not block edits.
        if (skillIds || Object.keys(fields).some((k) => k !== 'name')) {
          const [stop] = await tx
            .select({ id: routeStops.id })
            .from(routeStops)
            .innerJoin(routes, eq(routes.id, routeStops.routeId))
            .innerJoin(jobs, eq(jobs.id, routeStops.jobId))
            .where(and(eq(routes.technicianId, id), inArray(jobs.status, ['assigned', 'in_progress'])))
            .limit(1);
          if (stop) throw new ConflictException('Technician has stops on a route; unassign or cancel those jobs first');
        }
        const [row] = Object.keys(fields).length
          ? await tx.update(technicians).set(fields).where(eq(technicians.id, id)).returning({ id: technicians.id })
          : await tx.select({ id: technicians.id }).from(technicians).where(eq(technicians.id, id)).for('update');
        if (!row) throw new NotFoundException('Technician not found');
        if (!skillIds) return;
        await tx.delete(technicianSkills).where(eq(technicianSkills.technicianId, id));
        if (skillIds.length) await tx.insert(technicianSkills).values(skillIds.map((skillId) => ({ technicianId: id, skillId })));
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
