import { z } from 'zod';

const id = z.number().int().positive();

export const insertionRejectionReasonSchema = z.enum(['MISSING_SKILL', 'ROUTE_ALREADY_LATE', 'NO_FEASIBLE_POSITION']);
export type InsertionRejectionReason = z.infer<typeof insertionRejectionReasonSchema>;

/** `POST /jobs/:id/insertion-suggestions?limit=3` query. */
export const insertionQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(3) });
export type InsertionQuery = z.infer<typeof insertionQuerySchema>;

/** One way to place a job: technician, slot, cost and the times that follow. */
export const insertionOptionSchema = z.object({
  technicianId: id,
  /** The job goes between these two neighbours; null is the technician's home (start or end of the trip). */
  position: z.object({ afterJobId: id.nullable(), beforeJobId: id.nullable() }),
  detourS: z.number().int(),
  /** The new job and every later stop, with their new times. */
  etas: z.array(z.object({ jobId: id, eta: z.iso.datetime(), etd: z.iso.datetime() })),
  /** Version of the technician's route that day; 0 when there is no route row yet. */
  routeVersion: z.number().int().nonnegative(),
});
export type InsertionOption = z.infer<typeof insertionOptionSchema>;

/** Read-only. Times are UTC instants, durations seconds. */
export const insertionSuggestionsSchema = z.object({
  jobId: id,
  date: z.iso.date(),
  options: z.array(insertionOptionSchema),
  rejections: z.array(z.object({ technicianId: id, reason: insertionRejectionReasonSchema })),
});
export type InsertionSuggestions = z.infer<typeof insertionSuggestionsSchema>;

/** `POST /jobs/:id/insert` body: the chosen option, as suggested. */
export const insertCommitSchema = insertionOptionSchema.pick({ technicianId: true, position: true, routeVersion: true });
export type InsertCommit = z.infer<typeof insertCommitSchema>;
