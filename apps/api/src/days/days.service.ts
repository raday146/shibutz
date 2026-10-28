import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import type { DaySummary } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { jobs, routes } from '../db/schema';
import { ROUTING_GATEWAY } from '../gateways/ports';
import type { RoutingGateway } from '../gateways/ports';
import { IncidentsService } from '../incidents/incidents.service';
import { driveLegs, loadStops } from '../routes/stops';
import { TechniciansService } from '../technicians/technicians.service';

@Injectable()
export class DaysService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly technicians: TechniciansService,
    private readonly incidents: IncidentsService,
    @Inject(ROUTING_GATEWAY) private readonly routing: RoutingGateway,
  ) {}

  /** Read-only: counts from stored rows, drive time from one OSRM matrix per technician with stops. */
  async summary(date: string): Promise<DaySummary> {
    const [technicians, openIncidents, stops, dayJobs] = await Promise.all([
      this.technicians.list(),
      this.incidents.openCounts(date),
      loadStops(this.db, eq(routes.date, date)),
      this.db.select({ status: jobs.status }).from(jobs).where(and(eq(jobs.day, date), ne(jobs.status, 'cancelled'))),
    ]);
    const rows = await Promise.all(
      technicians.map(async (t) => {
        const mine = stops.filter((s) => s.technicianId === t.id);
        // ponytail: OSRM down shows 0 drive time for that technician; counts stay DB-only.
        const driveS = (await driveLegs(this.routing, t.home, mine.map((s) => s.location)).catch(() => [])).reduce((sum, l) => sum + l, 0);
        return {
          technicianId: t.id,
          stopCount: mine.length,
          doneCount: mine.filter((s) => s.status === 'done').length,
          driveS,
          expectedFinish: mine.at(-1)?.etd.toISOString() ?? null,
          openIncidents: openIncidents.get(t.id) ?? 0,
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
