import { asc, eq, type SQL } from 'drizzle-orm';
import type { JobStatus, LonLat } from '@shibutz/contracts';
import type { Db } from '../db/db.module';
import { jobs, routeStops, routes } from '../db/schema';

export interface StopRow {
  id: number;
  routeId: number;
  technicianId: number;
  jobId: number;
  sequence: number;
  eta: Date;
  etd: Date;
  actualArrival: Date | null;
  actualDeparture: Date | null;
  location: LonLat;
  serviceS: number;
  windowStart: Date;
  windowEnd: Date;
  status: JobStatus;
}

/** Stops of the routes matching `where`, each route's in sequence order, with their job's data. */
export function loadStops(db: Db, where: SQL | undefined): Promise<StopRow[]> {
  return db
    .select({
      id: routeStops.id,
      routeId: routeStops.routeId,
      technicianId: routes.technicianId,
      jobId: routeStops.jobId,
      sequence: routeStops.sequence,
      eta: routeStops.eta,
      etd: routeStops.etd,
      actualArrival: routeStops.actualArrival,
      actualDeparture: routeStops.actualDeparture,
      location: jobs.location,
      serviceS: jobs.serviceDurationS,
      windowStart: jobs.windowStart,
      windowEnd: jobs.windowEnd,
      status: jobs.status,
    })
    .from(routeStops)
    .innerJoin(routes, eq(routes.id, routeStops.routeId))
    .innerJoin(jobs, eq(jobs.id, routeStops.jobId))
    .where(where)
    .orderBy(asc(routes.technicianId), asc(routeStops.sequence));
}
