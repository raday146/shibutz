import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { CreateIncident, DayReport, Incident } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { isForeignKeyViolation } from '../db/errors';
import { dayReports, incidents, technicians } from '../db/schema';

type ReportRow = typeof dayReports.$inferSelect;
type IncidentRow = typeof incidents.$inferSelect;

const iso = (d: Date): string => d.toISOString();
const toReport = (r: ReportRow): DayReport => ({
  technicianId: r.technicianId,
  date: r.date,
  body: r.body,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
const toIncident = (r: IncidentRow): Incident => ({
  id: r.id,
  technicianId: r.technicianId,
  date: r.date,
  jobId: r.jobId,
  body: r.body,
  status: r.status,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  reviewedAt: r.reviewedAt ? iso(r.reviewedAt) : null,
});

@Injectable()
export class IncidentsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async requireTechnician(id: number): Promise<void> {
    const [row] = await this.db.select({ id: technicians.id }).from(technicians).where(eq(technicians.id, id));
    if (!row) throw new NotFoundException('Technician not found');
  }

  async report(technicianId: number, date: string): Promise<DayReport> {
    await this.requireTechnician(technicianId);
    const [row] = await this.db.select().from(dayReports).where(and(eq(dayReports.technicianId, technicianId), eq(dayReports.date, date)));
    if (!row) throw new NotFoundException('No report for this day');
    return toReport(row);
  }

  async writeReport(technicianId: number, date: string, body: string): Promise<DayReport> {
    await this.requireTechnician(technicianId);
    const [row] = await this.db
      .insert(dayReports)
      .values({ technicianId, date, body })
      .onConflictDoUpdate({ target: [dayReports.technicianId, dayReports.date], set: { body, updatedAt: sql`clock_timestamp()` } })
      .returning();
    if (!row) throw new Error('Upsert returned no row');
    return toReport(row);
  }

  async forDay(technicianId: number, date: string): Promise<Incident[]> {
    await this.requireTechnician(technicianId);
    const rows = await this.db.select().from(incidents).where(and(eq(incidents.technicianId, technicianId), eq(incidents.date, date))).orderBy(asc(incidents.id));
    return rows.map(toIncident);
  }

  async create(technicianId: number, date: string, { body, jobId }: CreateIncident): Promise<Incident> {
    await this.requireTechnician(technicianId);
    const [row] = await this.db
      .insert(incidents)
      .values({ technicianId, date, body, jobId: jobId ?? null })
      .returning()
      .catch((err: unknown) => {
        if (isForeignKeyViolation(err)) throw new BadRequestException('Unknown job id');
        throw err;
      });
    if (!row) throw new Error('Insert returned no row');
    return toIncident(row);
  }

  /** Idempotent: reviewing a reviewed incident keeps its first review time. */
  async review(id: number): Promise<Incident> {
    const [row] = await this.db
      .update(incidents)
      .set({ status: 'reviewed', reviewedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` })
      .where(and(eq(incidents.id, id), eq(incidents.status, 'open')))
      .returning();
    if (row) return toIncident(row);
    const [existing] = await this.db.select().from(incidents).where(eq(incidents.id, id));
    if (!existing) throw new NotFoundException('Incident not found');
    return toIncident(existing);
  }

  /** Every open incident, newest day first. */
  async open(): Promise<Incident[]> {
    const rows = await this.db.select().from(incidents).where(eq(incidents.status, 'open')).orderBy(desc(incidents.date), asc(incidents.id));
    return rows.map(toIncident);
  }

  /** Open incident count per technician on one day, for the day summary. */
  async openCounts(date: string): Promise<Map<number, number>> {
    const rows = await this.db
      .select({ technicianId: incidents.technicianId, n: sql<number>`count(*)::int` })
      .from(incidents)
      .where(and(eq(incidents.date, date), eq(incidents.status, 'open')))
      .groupBy(incidents.technicianId);
    return new Map(rows.map((r) => [r.technicianId, r.n]));
  }
}
