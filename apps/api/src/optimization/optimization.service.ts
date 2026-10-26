import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import type { DayPlan } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { jobs as jobsTable, routeStops, routes as routesTable } from '../db/schema';
import { NO_ROAD_S, ROUTING_GATEWAY, SOLVER_GATEWAY } from '../gateways/ports';
import type { RoutingGateway, SolverGateway } from '../gateways/ports';
import { JobsService } from '../jobs/jobs.service';
import { precheckJobs, unreachableJobIds } from '../planning/prechecks';
import type { UnassignedJob } from '../planning/prechecks';
import { fromDaySeconds, toDaySeconds, wallClockDaySeconds } from '../planning/time';
import { fromVroomSolution, planLocations, toVroomPayload } from '../planning/vroom-mapping';
import type { PlanJob, PlanTechnician } from '../planning/vroom-mapping';
import { TechniciansService } from '../technicians/technicians.service';

type PlannedRoutes = DayPlan['routes'];

@Injectable()
export class OptimizationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly technicians: TechniciansService,
    private readonly jobs: JobsService,
    @Inject(ROUTING_GATEWAY) private readonly routing: RoutingGateway,
    @Inject(SOLVER_GATEWAY) private readonly solver: SolverGateway,
  ) {}

  /** Re-plans the day's open jobs. All external calls happen before the write-only transaction. */
  async optimizeDay(date: string): Promise<DayPlan> {
    if (await this.jobs.hasStartedOn(date)) throw new ConflictException('A stop that day has already started');
    const [technicians, jobs] = await Promise.all([this.technicians.list(), this.jobs.plannableOn(date)]);

    const planTechnicians: PlanTechnician[] = technicians.map((t) => ({
      id: t.id,
      home: t.home,
      skillIds: t.skillIds,
      shift: [wallClockDaySeconds(t.shiftStart, date), wallClockDaySeconds(t.shiftEnd, date)],
    }));
    const planJobs: PlanJob[] = jobs.map((j) => ({
      id: j.id,
      location: j.location,
      skillIds: j.skillIds,
      serviceS: j.serviceDurationS,
      window: [toDaySeconds(new Date(j.windowStart), date), toDaySeconds(new Date(j.windowEnd), date)],
      priority: j.priority,
    }));
    const { passing, unassigned } = precheckJobs(planTechnicians, planJobs);

    const routes = await this.solve(date, planTechnicians, passing, unassigned);
    await this.replace(date, jobs.map((j) => j.id), routes);

    return {
      date,
      totalDriveS: routes.reduce((sum, r) => sum + r.driveS, 0),
      routes,
      unassigned: unassigned.sort((a, b) => a.jobId - b.jobId),
    };
  }

  /** Drops unreachable jobs, solves the rest; appends every unassigned job with its reason to `unassigned`. */
  private async solve(date: string, technicians: PlanTechnician[], passing: PlanJob[], unassigned: UnassignedJob[]): Promise<PlannedRoutes> {
    if (!passing.length) return [];
    const full = await this.routing.durationMatrix(planLocations(technicians, passing));
    const unreachable = new Set(unreachableJobIds(technicians, passing, full));
    for (const jobId of unreachable) unassigned.push({ jobId, reason: 'UNREACHABLE' });
    const keep = passing.filter((j) => !unreachable.has(j.id));
    if (!keep.length) return [];

    // Matrix rows/columns of homes and surviving jobs only; remaining nulls (e.g. job to job) cost NO_ROAD_S.
    const idx = [...technicians.map((_, i) => i), ...keep.map((j) => technicians.length + passing.indexOf(j))];
    const matrix = idx.map((i) => idx.map((k) => full[i]?.[k] ?? NO_ROAD_S));
    const solution = fromVroomSolution(await this.solver.solve(toVroomPayload(technicians, keep, matrix)));
    for (const jobId of solution.unassignedJobIds) unassigned.push({ jobId, reason: 'NOT_FEASIBLE_IN_PLAN' });

    const at = (seconds: number): string => fromDaySeconds(seconds, date).toISOString();
    return solution.routes.map((r) => ({
      technicianId: r.technicianId,
      driveS: r.driveS,
      jobCount: r.stops.length,
      stops: r.stops.map((s, i) => ({ jobId: s.jobId, sequence: i + 1, eta: at(s.arrivalS), etd: at(s.departureS) })),
    }));
  }

  // ponytail: the started-day check is not repeated inside the transaction, so a status change racing a batch is unguarded.
  private replace(date: string, jobIds: number[], routes: PlannedRoutes): Promise<void> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: routesTable.id, technicianId: routesTable.technicianId })
        .from(routesTable)
        .where(eq(routesTable.date, date));
      const existingIds = existing.map((r) => r.id);
      if (existingIds.length) {
        await tx.delete(routeStops).where(inArray(routeStops.routeId, existingIds));
        await tx.update(routesTable).set({ version: sql`${routesTable.version} + 1` }).where(inArray(routesTable.id, existingIds));
      }
      if (jobIds.length) await tx.update(jobsTable).set({ status: 'unassigned' }).where(inArray(jobsTable.id, jobIds));
      for (const route of routes) {
        let routeId = existing.find((r) => r.technicianId === route.technicianId)?.id;
        if (routeId === undefined) {
          // Version 1: the plan is a write, so suggestions computed against the missing row (version 0) go stale.
          const [row] = await tx
            .insert(routesTable)
            .values({ technicianId: route.technicianId, date, version: 1 })
            .returning({ id: routesTable.id });
          if (!row) throw new Error('Insert returned no row');
          routeId = row.id;
        }
        const id = routeId;
        await tx
          .insert(routeStops)
          .values(route.stops.map((s) => ({ routeId: id, jobId: s.jobId, sequence: s.sequence, eta: new Date(s.eta), etd: new Date(s.etd) })));
        await tx.update(jobsTable).set({ status: 'assigned' }).where(inArray(jobsTable.id, route.stops.map((s) => s.jobId)));
      }
    });
  }
}
