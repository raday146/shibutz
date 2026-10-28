import { z } from 'zod';
import { lonLatSchema } from './common';
import { jobStatusSchema } from './jobs';

/** `GET /routes/:technicianId/:date`. Geometry is computed on demand (never stored); null when the route has no stops. */
export const routeViewSchema = z.object({
  technicianId: z.number().int().positive(),
  date: z.iso.date(),
  stops: z.array(
    z.object({
      jobId: z.number().int().positive(),
      title: z.string(),
      address: z.string(),
      sequence: z.number().int().positive(),
      location: lonLatSchema,
      eta: z.iso.datetime(),
      etd: z.iso.datetime(),
      actualArrival: z.iso.datetime().nullable(),
      actualDeparture: z.iso.datetime().nullable(),
      status: jobStatusSchema,
      skillIds: z.array(z.number().int().positive()),
      serviceDurationS: z.number().int().positive(),
      /** Seconds of driving from the previous stop (from home for the first). */
      driveS: z.number().int().nonnegative(),
      hasNote: z.boolean(),
    }),
  ),
  /** The technician-day summary; `driveS` runs home through every stop and back home. */
  summary: z.object({
    doneCount: z.number().int().nonnegative(),
    driveS: z.number().int().nonnegative(),
    /** Planned departure of the last stop; null without stops. */
    expectedFinish: z.iso.datetime().nullable(),
  }),
  geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(lonLatSchema) }).nullable(),
});
export type RouteView = z.infer<typeof routeViewSchema>;

/** `GET /routes/:technicianId/:date/cancellations`: jobs cancelled from that technician's day, oldest first. */
export const cancellationSchema = z.object({
  jobId: z.number().int().positive(),
  title: z.string(),
  previousStatus: jobStatusSchema,
  actualArrival: z.iso.datetime().nullable(),
  /** Set only for a job that was in progress: the moment it was cancelled. */
  actualDeparture: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime(),
  reason: z.string().nullable(),
});
export type Cancellation = z.infer<typeof cancellationSchema>;
