import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Job, JobStatus, LonLat } from '@shibutz/contracts';
import { CLOCK, type Clock } from '../clock/clock';
import { DB, type Db } from '../db/db.module';
import { jobs, routeStops, routes, technicians } from '../db/schema';
import { NO_ROAD_S, ROUTING_GATEWAY } from '../gateways/ports';
import type { RoutingGateway } from '../gateways/ports';
import { JobsService } from '../jobs/jobs.service';
import { loadStops, type StopRow } from '../routes/stops';
import { currentPosition, toPositionStop } from '../planning/position';
import { scheduleRoute } from '../planning/schedule';
import { fromDaySeconds, toDaySeconds, wallClockDaySeconds } from '../planning/time';

// Day operations only. unassigned -> assigned happens through batch or insert, never here.
const ALLOWED: Record<JobStatus, JobStatus[]> = {
  unassigned: ['cancelled'],
  assigned: ['in_progress', 'unassigned', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

interface RouteContext {
  routeId: number;
  date: string;
  version: number;
  technicianId: number;
  home: LonLat;
  shiftStart: string;
  shiftEnd: string;
}

interface NewTimes {
  stopId: number;
  eta: Date;
  etd: Date;
}

@Injectable()
export class JobStatusService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ROUTING_GATEWAY) private readonly routing: RoutingGateway,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly jobsService: JobsService,
  ) {}

  async change(jobId: number, to: JobStatus): Promise<Job> {
    const from = (await this.jobsService.get(jobId)).status;
    if (!ALLOWED[from].includes(to)) throw new ConflictException(`Cannot change a job from ${from} to ${to}`);

    if (from === 'unassigned') {
      const [row] = await this.db
        .update(jobs)
        .set({ status: to })
        .where(and(eq(jobs.id, jobId), eq(jobs.status, from)))
        .returning({ id: jobs.id });
      if (!row) throw new ConflictException('Job changed concurrently; retry');
      return this.jobsService.get(jobId);
    }

    const now = this.clock.now();
    // The version is read before the stops, so any write in between makes the guarded bump fail.
    const route = await this.loadRoute(jobId);
    const stops = await loadStops(this.db, eq(routes.id, route.routeId));
    const index = stops.findIndex((s) => s.jobId === jobId);
    const stop = stops[index];
    if (!stop) throw new ConflictException('Job has no stop on a route');

    if (to === 'in_progress') await this.assertCanStart(route.technicianId, stops, index);
    // Computed before the transaction: no external call may happen inside it.
    const later = to === 'in_progress' || to === 'done' ? [] : await this.recompute(route, stops, index, now);

    await this.db.transaction(async (tx) => {
      const [bumped] = await tx
        .update(routes)
        .set({ version: sql`${routes.version} + 1` })
        .where(and(eq(routes.id, route.routeId), eq(routes.version, route.version)))
        .returning({ id: routes.id });
      if (!bumped) throw new ConflictException('Route changed concurrently; retry');

      await tx.update(jobs).set({ status: to }).where(eq(jobs.id, jobId));
      if (to === 'in_progress') await tx.update(routeStops).set({ actualArrival: now }).where(eq(routeStops.id, stop.id));
      if (to === 'done') await tx.update(routeStops).set({ actualDeparture: now }).where(eq(routeStops.id, stop.id));
      if (to === 'in_progress' || to === 'done') return;

      // ponytail: a cancelled in_progress stop is deleted, so its actual departure (= now) is not stored;
      // it only anchors the recompute below.
      await tx.delete(routeStops).where(eq(routeStops.id, stop.id));
      await tx
        .update(routeStops)
        .set({ sequence: sql`${routeStops.sequence} - 1` })
        .where(and(eq(routeStops.routeId, route.routeId), sql`${routeStops.sequence} > ${stop.sequence}`));
      for (const t of later) await tx.update(routeStops).set({ eta: t.eta, etd: t.etd }).where(eq(routeStops.id, t.stopId));
    });
    return this.jobsService.get(jobId);
  }

  private async loadRoute(jobId: number): Promise<RouteContext> {
    const [row] = await this.db
      .select({
        routeId: routes.id,
        date: routes.date,
        version: routes.version,
        technicianId: routes.technicianId,
        home: technicians.home,
        shiftStart: technicians.shiftStart,
        shiftEnd: technicians.shiftEnd,
      })
      .from(routeStops)
      .innerJoin(routes, eq(routes.id, routeStops.routeId))
      .innerJoin(technicians, eq(technicians.id, routes.technicianId))
      .where(eq(routeStops.jobId, jobId));
    if (!row) throw new ConflictException('Job has no stop on a route');
    return row;
  }

  private async assertCanStart(technicianId: number, stops: StopRow[], index: number): Promise<void> {
    if (stops.slice(0, index).some((s) => s.status !== 'done')) {
      throw new ConflictException('Only the first not-done stop of a route can be started');
    }
    const [busy] = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .innerJoin(routeStops, eq(routeStops.jobId, jobs.id))
      .innerJoin(routes, eq(routes.id, routeStops.routeId))
      .where(and(eq(routes.technicianId, technicianId), eq(jobs.status, 'in_progress')))
      .limit(1);
    if (busy) throw new ConflictException('Technician already has a stop in progress');
  }

  /** New ETAs for the stops after `index`, continuing from the current position (spec: Current position). */
  private async recompute(route: RouteContext, stops: StopRow[], index: number, now: Date): Promise<NewTimes[]> {
    const removed = stops[index];
    const after = stops.slice(index + 1);
    if (!removed || !after.length) return [];

    const nowS = toDaySeconds(now, route.date);
    const prior = stops[index - 1];
    const at = (d: Date): number => toDaySeconds(d, route.date);
    let origin: { location: LonLat; departureS: number };
    if (removed.status === 'in_progress') {
      origin = { location: removed.location, departureS: nowS };
    } else if (prior?.status === 'assigned') {
      origin = { location: prior.location, departureS: Math.max(at(prior.etd), nowS) };
    } else {
      const shiftStartS = wallClockDaySeconds(route.shiftStart, route.date);
      const position = currentPosition(stops.slice(0, index).map((s) => toPositionStop(s, route.date)), shiftStartS, nowS);
      origin = { location: stops[position.stop ?? -1]?.location ?? route.home, departureS: position.departureS };
    }

    const raw = await this.routing.durationMatrix([origin.location, ...after.map((s) => s.location), route.home]);
    const matrix = raw.map((row) => row.map((cell) => cell ?? NO_ROAD_S));
    const schedule = scheduleRoute(
      {
        start: { index: 0, departureS: origin.departureS },
        stops: after.map((s, i) => ({ index: i + 1, window: [at(s.windowStart), at(s.windowEnd)], serviceS: s.serviceS })),
        home: { index: after.length + 1, shiftEndS: wallClockDaySeconds(route.shiftEnd, route.date) },
      },
      matrix,
    );
    // Violations are not refused here: removing a stop never makes a route worse, so late stays visible via the new ETAs.
    return after.map((s, i) => ({
      stopId: s.id,
      eta: fromDaySeconds(schedule.stops[i]?.arrivalS ?? 0, route.date),
      etd: fromDaySeconds(schedule.stops[i]?.departureS ?? 0, route.date),
    }));
  }
}
