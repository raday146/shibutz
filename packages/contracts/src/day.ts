import { z } from 'zod';
import { lonLatSchema } from './common';
import { jobStatusSchema } from './jobs';

const count = z.number().int().nonnegative();

/** `GET /days/:date/summary`: everything the top bar and the left panel show, from one read. Drive times are seconds. */
export const daySummarySchema = z.object({
  date: z.iso.date(),
  /** Cancelled jobs are in neither `total` nor any other count. */
  totals: z.object({ total: count, assigned: count, unassigned: count, done: count, driveS: count }),
  technicians: z.array(
    z.object({
      technicianId: z.number().int().positive(),
      stopCount: count,
      doneCount: count,
      /** Home through every stop and back home. */
      driveS: count,
      /** Planned departure of the last stop; null without stops. */
      expectedFinish: z.iso.datetime().nullable(),
      openIncidents: count,
      stops: z.array(z.object({ jobId: z.number().int().positive(), status: jobStatusSchema, location: lonLatSchema })),
    }),
  ),
});
export type DaySummary = z.infer<typeof daySummarySchema>;
