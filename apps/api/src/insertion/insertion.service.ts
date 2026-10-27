import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
import type { InsertCommit, InsertionOption, InsertionSuggestions, Job, LonLat, Technician } from '@shibutz/contracts';
import { CLOCK, type Clock } from '../clock/clock';
import { DB, type Db } from '../db/db.module';
import { jobs, routeStops, routes, technicians } from '../db/schema';
import { NO_ROAD_S, ROUTING_GATEWAY } from '../gateways/ports';
import type { RoutingGateway } from '../gateways/ports';
import { JobsService } from '../jobs/jobs.service';
import { loadStops, type StopRow } from '../routes/stops';
import { suggestInsertions, type InsertionCandidate } from '../planning/insertion';
import { currentPosition, toPositionStop } from '../planning/position';
import { fromDaySeconds, toDaySeconds, wallClockDaySeconds } from '../planning/time';
import { TechniciansService } from '../technicians/technicians.service';

const DEFAULT_RADIUS_M = 10_000;

/** What `suggest` remembers per candidate to turn a slot back into neighbours. */
interface Plan {
  afterJobId: number | null;
  remaining: StopRow[];
  /** Index in the full stop list of `remaining[0]`. */
  from: number;
  version: number;
}

@Injectable()
export class InsertionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ROUTING_GATEWAY) private readonly routing: RoutingGateway,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly jobsService: JobsService,
    private readonly techniciansService: TechniciansService,
  ) {}

  /** Read-only: ranks feasible insertion slots across skilled technicians (spec: Insertion heuristic). */
  async suggest(jobId: number, limit: number): Promise<InsertionSuggestions> {
    const job = await this.jobsService.get(jobId);
    if (job.status !== 'unassigned') throw new ConflictException(`Only an unassigned job can get suggestions, this one is ${job.status}`);
    const all = await this.techniciansService.list();
    const skilled = all.filter((t) => job.skillIds.every((s) => t.skillIds.includes(s)));
    const missing = all.filter((t) => !skilled.includes(t));
    const rejections: InsertionSuggestions['rejections'] = missing.map((t) => ({ technicianId: t.id, reason: 'MISSING_SKILL' }));

    const nearby = await this.nearby(job.location, job.day, skilled);
    const ranked = await this.rank(job, nearby.length ? nearby : skilled);
    return {
      jobId: job.id,
      date: job.day,
      options: ranked.options.slice(0, limit).map((r) => r.option),
      rejections: [...rejections, ...ranked.rejections].sort((a, b) => a.technicianId - b.technicianId),
    };
  }

  /**
   * Commits a suggested option. Everything is recomputed on fresh data first (version before stops), then one
   * transaction does only writes, guarded by the atomic version bump (spec: Write rule).
   */
  async insert(jobId: number, { technicianId, position, routeVersion }: InsertCommit): Promise<Job> {
    const job = await this.jobsService.get(jobId);
    if (job.status !== 'unassigned') throw new ConflictException(`Only an unassigned job can be inserted, this one is ${job.status}`);
    const tech = await this.techniciansService.get(technicianId);
    const chosen = (await this.rank(job, job.skillIds.every((s) => tech.skillIds.includes(s)) ? [tech] : [])).options.find(
      (r) => r.option.position.afterJobId === position.afterJobId && r.option.position.beforeJobId === position.beforeJobId,
    );
    if (!chosen) throw new ConflictException('That position is no longer available or feasible');
    if (chosen.option.routeVersion !== routeVersion) throw new ConflictException('Route changed since the suggestion');

    await this.db.transaction(async (tx) => {
      // ponytail: the expected version 0 case: make sure the row exists, then the same guarded bump as every other case.
      if (routeVersion === 0) await tx.insert(routes).values({ technicianId, date: job.day }).onConflictDoNothing({ target: [routes.technicianId, routes.date] });
      const [bumped] = await tx
        .update(routes)
        .set({ version: sql`${routes.version} + 1` })
        .where(and(eq(routes.technicianId, technicianId), eq(routes.date, job.day), eq(routes.version, routeVersion)))
        .returning({ id: routes.id });
      if (!bumped) throw new ConflictException('Route changed concurrently; retry');

      const [assigned] = await tx
        .update(jobs)
        .set({ status: 'assigned', unassignedReason: null, unassignedAt: null })
        .where(and(eq(jobs.id, jobId), eq(jobs.status, 'unassigned')))
        .returning({ id: jobs.id });
      if (!assigned) throw new ConflictException('Job changed concurrently; retry');

      await tx
        .update(routeStops)
        .set({ sequence: sql`${routeStops.sequence} + 1` })
        .where(and(eq(routeStops.routeId, bumped.id), sql`${routeStops.sequence} >= ${chosen.sequence}`));
      const [first, ...later] = chosen.option.etas;
      if (!first) throw new Error('Option without a new stop');
      await tx.insert(routeStops).values({ routeId: bumped.id, jobId, sequence: chosen.sequence, eta: new Date(first.eta), etd: new Date(first.etd) });
      for (const e of later) await tx.update(routeStops).set({ eta: new Date(e.eta), etd: new Date(e.etd) }).where(eq(routeStops.jobId, e.jobId));
    });
    return this.jobsService.get(jobId);
  }

  /** Every feasible slot of the candidates, best first, plus their rejections. Read-only; one matrix call. */
  private async rank(
    job: Job,
    candidates: Technician[],
  ): Promise<{ options: { option: InsertionOption; sequence: number }[]; rejections: InsertionSuggestions['rejections'] }> {
    const date = job.day;
    const now = this.clock.now();
    const versions = await this.versions(candidates, date);
    const stopsByTech = await this.stops(candidates, date);

    // Layout: index 0 is the new job; each candidate then gets its position, its remaining stops and its home.
    const points: LonLat[] = [job.location];
    const plans = new Map<number, Plan>();
    const inputs = candidates.map((t): InsertionCandidate => {
      const stops = stopsByTech.get(t.id) ?? [];
      const position = currentPosition(
        stops.map((s) => toPositionStop(s, date)),
        wallClockDaySeconds(t.shiftStart, date),
        toDaySeconds(now, date),
      );
      const from = (position.stop ?? -1) + 1;
      const remaining = stops.slice(from);
      const base = points.length;
      points.push(stops[position.stop ?? -1]?.location ?? t.home, ...remaining.map((s) => s.location), t.home);
      plans.set(t.id, { afterJobId: stops[position.stop ?? -1]?.jobId ?? null, remaining, from, version: versions.get(t.id) ?? 0 });
      return {
        technicianId: t.id,
        start: { index: base, departureS: position.departureS },
        stops: remaining.map((s, i) => ({
          index: base + 1 + i,
          window: [toDaySeconds(s.windowStart, date), toDaySeconds(s.windowEnd, date)],
          serviceS: s.serviceS,
        })),
        home: { index: base + 1 + remaining.length, shiftEndS: wallClockDaySeconds(t.shiftEnd, date) },
      };
    });

    // One matrix call for everything. Unreachable cells become a huge duration, so they are simply infeasible.
    // ponytail: no 500-location split; the fallback over every skilled technician can exceed OSRM's table limit on big fleets.
    const raw = inputs.length ? await this.routing.durationMatrix(points) : [];
    const matrix = raw.map((row) => row.map((cell) => cell ?? NO_ROAD_S));
    const result = suggestInsertions(
      inputs,
      { index: 0, window: [toDaySeconds(new Date(job.windowStart), date), toDaySeconds(new Date(job.windowEnd), date)], serviceS: job.serviceDurationS },
      matrix,
    );

    const options = result.options.map((o) => {
      const plan = plans.get(o.technicianId);
      if (!plan) throw new Error('Option without a plan');
      const ids = [job.id, ...plan.remaining.slice(o.slot).map((s) => s.jobId)];
      const option: InsertionOption = {
        technicianId: o.technicianId,
        position: { afterJobId: plan.remaining[o.slot - 1]?.jobId ?? (o.slot === 0 ? plan.afterJobId : null), beforeJobId: plan.remaining[o.slot]?.jobId ?? null },
        detourS: o.detourS,
        etas: o.schedule.stops.slice(o.slot).map((s, i) => ({
          jobId: ids[i] ?? job.id,
          eta: fromDaySeconds(s.arrivalS, date).toISOString(),
          etd: fromDaySeconds(s.departureS, date).toISOString(),
        })),
        routeVersion: plan.version,
      };
      return { option, sequence: plan.from + o.slot + 1 };
    });
    return { options, rejections: result.rejections };
  }

  /** Skilled technicians whose home or any stop of that day's route is within the radius of the point. */
  private async nearby(at: LonLat, date: string, skilled: Technician[]): Promise<Technician[]> {
    if (!skilled.length) return [];
    const radiusM = Number(process.env.INSERTION_RADIUS_M ?? DEFAULT_RADIUS_M);
    const point = sql`ST_SetSRID(ST_MakePoint(${at[0]}, ${at[1]}), 4326)::geography`;
    const rows = await this.db
      .select({ id: technicians.id })
      .from(technicians)
      .where(
        and(
          inArray(technicians.id, skilled.map((t) => t.id)),
          or(
            sql`ST_DWithin(${technicians.home}, ${point}, ${radiusM})`,
            exists(
              this.db
                .select({ one: sql`1` })
                .from(routes)
                .innerJoin(routeStops, eq(routeStops.routeId, routes.id))
                .innerJoin(jobs, eq(jobs.id, routeStops.jobId))
                .where(and(eq(routes.technicianId, technicians.id), eq(routes.date, date), sql`ST_DWithin(${jobs.location}, ${point}, ${radiusM})`)),
            ),
          ),
        ),
      );
    const ids = new Set(rows.map((r) => r.id));
    return skilled.filter((t) => ids.has(t.id));
  }

  // Versions are read before stops: a write in between makes the version stale, never the stops.
  private async versions(candidates: Technician[], date: string): Promise<Map<number, number>> {
    if (!candidates.length) return new Map();
    const rows = await this.db
      .select({ technicianId: routes.technicianId, version: routes.version })
      .from(routes)
      .where(and(eq(routes.date, date), inArray(routes.technicianId, candidates.map((t) => t.id))));
    return new Map(rows.map((r) => [r.technicianId, r.version]));
  }

  private async stops(candidates: Technician[], date: string): Promise<Map<number, StopRow[]>> {
    const byTech = new Map<number, StopRow[]>();
    if (!candidates.length) return byTech;
    const rows = await loadStops(this.db, and(eq(routes.date, date), inArray(routes.technicianId, candidates.map((t) => t.id))));
    for (const stop of rows) byTech.set(stop.technicianId, [...(byTech.get(stop.technicianId) ?? []), stop]);
    return byTech;
  }
}
