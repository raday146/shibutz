import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import type { DayPlan } from '@shibutz/contracts';
import { DB, type Db } from '../db/db.module';
import { jobs as jobsTable, routeStops, routes as routesTable } from '../db/schema';
import { ROUTING_GATEWAY, SOLVER_GATEWAY } from '../gateways/ports';
import type { DurationMatrix, RoutingGateway, SolverGateway } from '../gateways/ports';
import { JobsService } from '../jobs/jobs.service';
import { fromDaySeconds, toDaySeconds, wallClockDaySeconds } from '../planning/time';
import { fromVroomSolution, planLocations, toVroomPayload } from '../planning/vroom-mapping';
import type { PlanJob, PlanTechnician } from '../planning/vroom-mapping';
import { TechniciansService } from '../technicians/technicians.service';

type PlannedRoutes = DayPlan['routes'];

// ponytail: no UNREACHABLE pre-check yet (#7); a null cell fails the whole request.
function requireReachable(matrix: DurationMatrix): number[][] {
  return matrix.map((row) =>
    row.map((cell) => {
      if (cell === null) throw new UnprocessableEntityException('Some locations are not reachable by road');
      return cell;
    }),
  );
}

@Injectable()
export class OptimizationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly technicians: TechniciansService,
    private readonly jobs: JobsService,
    @Inject(ROUTING_GATEWAY) private readonly routing: RoutingGateway,
    @Inject(SOLVER_GATEWAY) private readonly solver: SolverGateway,
  ) {}

  /** Plans the day's unassigned jobs. All external calls happen before the write-only transaction. */
  async optimizeDay(date: string): Promise<DayPlan> {
    const [technicians, jobs] = await Promise.all([this.technicians.list(), this.jobs.unassignedOn(date)]);
    if (!technicians.length || !jobs.length) {
      return { date, totalDriveS: 0, routes: [], unassigned: jobs.map((j) => ({ jobId: j.id, reason: 'NOT_FEASIBLE_IN_PLAN' })) };
    }

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
    const matrix = requireReachable(await this.routing.durationMatrix(planLocations(planTechnicians, planJobs)));
    const solution = fromVroomSolution(await this.solver.solve(toVroomPayload(planTechnicians, planJobs, matrix)));

    const at = (seconds: number): string => fromDaySeconds(seconds, date).toISOString();
    const routes: PlannedRoutes = solution.routes.map((r) => ({
      technicianId: r.technicianId,
      driveS: r.driveS,
      jobCount: r.stops.length,
      stops: r.stops.map((s, i) => ({ jobId: s.jobId, sequence: i + 1, eta: at(s.arrivalS), etd: at(s.departureS) })),
    }));
    await this.persist(date, routes);

    return {
      date,
      totalDriveS: routes.reduce((sum, r) => sum + r.driveS, 0),
      routes,
      unassigned: solution.unassignedJobIds.map((jobId) => ({ jobId, reason: 'NOT_FEASIBLE_IN_PLAN' })),
    };
  }

  // ponytail: insert only; replacing an existing day plan (and 409 on a started day) is #7.
  private persist(date: string, routes: PlannedRoutes): Promise<void> {
    return this.db.transaction(async (tx) => {
      for (const route of routes) {
        // Version 1: the plan is a write, so suggestions computed against the missing row (version 0) go stale.
        const [row] = await tx
          .insert(routesTable)
          .values({ technicianId: route.technicianId, date, version: 1 })
          .returning({ id: routesTable.id });
        if (!row) throw new Error('Insert returned no row');
        await tx.insert(routeStops).values(
          route.stops.map((s) => ({ routeId: row.id, jobId: s.jobId, sequence: s.sequence, eta: new Date(s.eta), etd: new Date(s.etd) })),
        );
        const jobIds = route.stops.map((s) => s.jobId);
        await tx.update(jobsTable).set({ status: 'assigned' }).where(inArray(jobsTable.id, jobIds));
      }
    });
  }
}
