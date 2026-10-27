import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import type { DaySummary } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { jobs, routes } from '../db/schema';
import { ROUTING_GATEWAY } from '../gateways/ports';
import type { RoutingGateway } from '../gateways/ports';
import { loadStops } from '../routes/stops';
import { TechniciansService } from '../technicians/technicians.service';

@Injectable()
export class DaysService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly technicians: TechniciansService,
    @Inject(ROUTING_GATEWAY) private readonly routing: RoutingGateway,
  ) {}

  /** Read-only: counts from stored rows, drive time from one OSRM matrix per technician with stops. */
  async summary(date: string): Promise<DaySummary> {
    const [technicians, stops, dayJobs] = await Promise.all([
      this.technicians.list(),
      loadStops(this.db, eq(routes.date, date)),
      this.db.select({ status: jobs.status }).from(jobs).where(and(eq(jobs.day, date), ne(jobs.status, 'cancelled'))),
    ]);
    const rows = await Promise.all(
      technicians.map(async (t) => {
        const mine = stops.filter((s) => s.technicianId === t.id);
        const points = [t.home, ...mine.map((s) => s.location), t.home];
        const matrix = mine.length ? await this.routing.durationMatrix(points) : [];
        // ponytail: a leg with no road counts as 0 s; the plan already refuses unreachable jobs.
        const driveS = points.slice(1).reduce((sum, _, i) => sum + (matrix[i]?.[i + 1] ?? 0), 0);
        return {
          technicianId: t.id,
          stopCount: mine.length,
          doneCount: mine.filter((s) => s.status === 'done').length,
          driveS,
          expectedFinish: mine.at(-1)?.etd.toISOString() ?? null,
          // ponytail: incidents arrive with their own ticket; until then none are open.
          openIncidents: 0,
          stops: mine.map((s) => ({ jobId: s.jobId, status: s.status, location: s.location })),
        };
      }),
    );
    const count = (status: string): number => dayJobs.filter((j) => j.status === status).length;
    return {
      date,
      totals: {
        total: dayJobs.length,
        assigned: dayJobs.length - count('unassigned'),
        unassigned: count('unassigned'),
        done: count('done'),
        driveS: rows.reduce((sum, r) => sum + r.driveS, 0),
      },
      technicians: rows,
    };
  }
}
