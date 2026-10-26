import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { CreateJob, Job, UpdateJob } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { isForeignKeyViolation, rejectInvalid } from '../db/errors';
import { jobSkills, jobs } from '../db/schema';

const columns = {
  id: jobs.id,
  location: jobs.location,
  skillIds: sql<number[]>`coalesce((
    select array_agg(${jobSkills.skillId} order by ${jobSkills.skillId})
    from ${jobSkills} where ${jobSkills.jobId} = ${jobs.id}), '{}')`,
  serviceDurationS: jobs.serviceDurationS,
  windowStart: jobs.windowStart,
  windowEnd: jobs.windowEnd,
  priority: jobs.priority,
  status: jobs.status,
  day: jobs.day,
};
type Row = Omit<Job, 'windowStart' | 'windowEnd'> & { windowStart: Date; windowEnd: Date };

const toJob = (row: Row): Job => ({
  ...row,
  windowStart: row.windowStart.toISOString(),
  windowEnd: row.windowEnd.toISOString(),
});

function toRow({ windowStart, windowEnd, ...rest }: UpdateJob): Partial<typeof jobs.$inferInsert> {
  return {
    ...rest,
    ...(windowStart && { windowStart: new Date(windowStart) }),
    ...(windowEnd && { windowEnd: new Date(windowEnd) }),
  };
}

@Injectable()
export class JobsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<Job[]> {
    const rows = await this.db.select(columns).from(jobs).orderBy(asc(jobs.id));
    return rows.map(toJob);
  }

  /** The day's jobs a batch may (re)plan: unassigned, or assigned to a route that has not started. */
  async plannableOn(day: string): Promise<Job[]> {
    const rows = await this.db
      .select(columns)
      .from(jobs)
      .where(and(eq(jobs.day, day), inArray(jobs.status, ['unassigned', 'assigned'])))
      .orderBy(asc(jobs.id));
    return rows.map(toJob);
  }

  async hasStartedOn(day: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.day, day), inArray(jobs.status, ['in_progress', 'done'])))
      .limit(1);
    return row !== undefined;
  }

  async get(id: number): Promise<Job> {
    const [row] = await this.db.select(columns).from(jobs).where(eq(jobs.id, id));
    if (!row) throw new NotFoundException('Job not found');
    return toJob(row);
  }

  async create({ skillIds, ...fields }: CreateJob): Promise<Job> {
    const id = await rejectInvalid(
      this.db.transaction(async (tx) => {
        const values = { ...fields, windowStart: new Date(fields.windowStart), windowEnd: new Date(fields.windowEnd) };
        const [row] = await tx.insert(jobs).values(values).returning({ id: jobs.id });
        if (!row) throw new Error('Insert returned no row');
        if (skillIds.length) await tx.insert(jobSkills).values(skillIds.map((skillId) => ({ jobId: row.id, skillId })));
        return row.id;
      }),
    );
    return this.get(id);
  }

  async update(id: number, { skillIds, ...fields }: UpdateJob): Promise<Job> {
    await rejectInvalid(
      this.db.transaction(async (tx) => {
        const [row] = Object.keys(fields).length
          ? await tx.update(jobs).set(toRow(fields)).where(eq(jobs.id, id)).returning({ id: jobs.id })
          : await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).for('update');
        if (!row) throw new NotFoundException('Job not found');
        if (!skillIds) return;
        await tx.delete(jobSkills).where(eq(jobSkills.jobId, id));
        if (skillIds.length) await tx.insert(jobSkills).values(skillIds.map((skillId) => ({ jobId: id, skillId })));
      }),
    );
    return this.get(id);
  }

  async remove(id: number): Promise<void> {
    const [row] = await this.db
      .delete(jobs)
      .where(eq(jobs.id, id))
      .returning({ id: jobs.id })
      .catch((err: unknown) => {
        if (isForeignKeyViolation(err)) throw new ConflictException('Job is on a route; unassign or cancel it first');
        throw err;
      });
    if (!row) throw new NotFoundException('Job not found');
  }
}
