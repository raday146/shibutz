import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { CreateTechnician, Technician, UpdateTechnician } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { rejectInvalid } from '../db/errors';
import { routeStops, routes, technicianSkills, technicians } from '../db/schema';

const columns = {
  id: technicians.id,
  name: technicians.name,
  home: technicians.home,
  shiftStart: technicians.shiftStart,
  shiftEnd: technicians.shiftEnd,
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

  async create({ skillIds, ...fields }: CreateTechnician): Promise<Technician> {
    const id = await rejectInvalid(
      this.db.transaction(async (tx) => {
        const [row] = await tx.insert(technicians).values(fields).returning({ id: technicians.id });
        if (!row) throw new Error('Insert returned no row');
        if (skillIds.length) await tx.insert(technicianSkills).values(skillIds.map((skillId) => ({ technicianId: row.id, skillId })));
        return row.id;
      }),
    );
    return this.get(id);
  }

  async update(id: number, { skillIds, ...fields }: UpdateTechnician): Promise<Technician> {
    await rejectInvalid(
      this.db.transaction(async (tx) => {
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
    const [row] = await this.db.delete(technicians).where(eq(technicians.id, id)).returning({ id: technicians.id });
    if (!row) throw new NotFoundException('Technician not found');
  }
}
