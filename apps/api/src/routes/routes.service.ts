import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Cancellation, RouteView } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { jobCancellations, jobSkills, jobs, routeStops, routes } from '../db/schema';
import { ROUTING_GATEWAY } from '../gateways/ports';
import type { RoutingGateway } from '../gateways/ports';
import { TechniciansService } from '../technicians/technicians.service';

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

@Injectable()
export class RoutesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly technicians: TechniciansService,
    @Inject(ROUTING_GATEWAY) private readonly routing: RoutingGateway,
  ) {}

  /** Jobs cancelled from this technician's day, oldest first. */
  async cancellations(technicianId: number, date: string): Promise<Cancellation[]> {
    await this.technicians.get(technicianId);
    const rows = await this.db
      .select({
        jobId: jobCancellations.jobId,
        title: jobs.title,
        previousStatus: jobCancellations.previousStatus,
        actualArrival: jobCancellations.actualArrival,
        actualDeparture: jobCancellations.actualDeparture,
        cancelledAt: jobCancellations.cancelledAt,
        reason: jobCancellations.reason,
      })
      .from(jobCancellations)
      .innerJoin(jobs, eq(jobs.id, jobCancellations.jobId))
      .where(and(eq(jobCancellations.technicianId, technicianId), eq(jobCancellations.date, date)))
      .orderBy(asc(jobCancellations.cancelledAt), asc(jobCancellations.id));
    return rows.map((r) => ({ ...r, actualArrival: iso(r.actualArrival), actualDeparture: iso(r.actualDeparture), cancelledAt: r.cancelledAt.toISOString() }));
  }

  /** Stored stops plus geometry computed now from OSRM (home, stops, home); nothing is persisted. */
  async view(technicianId: number, date: string): Promise<RouteView> {
    const { home } = await this.technicians.get(technicianId);
    const rows = await this.db
      .select({
        jobId: routeStops.jobId,
        sequence: routeStops.sequence,
        title: jobs.title,
        address: jobs.address,
        location: jobs.location,
        status: jobs.status,
        serviceDurationS: jobs.serviceDurationS,
        skillIds: sql<number[]>`coalesce((
          select array_agg(${jobSkills.skillId} order by ${jobSkills.skillId})
          from ${jobSkills} where ${jobSkills.jobId} = ${jobs.id}), '{}')`,
        eta: routeStops.eta,
        etd: routeStops.etd,
        actualArrival: routeStops.actualArrival,
        actualDeparture: routeStops.actualDeparture,
      })
      .from(routes)
      .innerJoin(routeStops, eq(routeStops.routeId, routes.id))
      .innerJoin(jobs, eq(jobs.id, routeStops.jobId))
      .where(and(eq(routes.technicianId, technicianId), eq(routes.date, date)))
      .orderBy(asc(routeStops.sequence));

    const points = [home, ...rows.map((r) => r.location), home];
    const matrix = rows.length ? await this.routing.durationMatrix(points) : [];
    // ponytail: a leg with no road counts as 0 s; the plan already refuses unreachable jobs.
    const leg = (i: number): number => Math.round(matrix[i]?.[i + 1] ?? 0);
    const stops = rows.map((r, i) => ({
      ...r,
      driveS: leg(i),
      // ponytail: notes arrive with their own ticket; until then no stop has one.
      hasNote: false,
      eta: r.eta.toISOString(),
      etd: r.etd.toISOString(),
      actualArrival: iso(r.actualArrival),
      actualDeparture: iso(r.actualDeparture),
    }));
    const geometry = stops.length ? await this.routing.routeGeometry([home, ...stops.map((s) => s.location), home]) : null;
    const summary = {
      doneCount: stops.filter((s) => s.status === 'done').length,
      driveS: points.slice(1).reduce((sum, _, i) => sum + leg(i), 0),
      expectedFinish: stops.at(-1)?.etd ?? null,
    };
    return { technicianId, date, stops, summary, geometry };
  }
}
