import { z } from 'zod';
import { lonLatSchema, nonEmpty, skillIdsSchema } from './common';

export const jobStatusSchema = z.enum(['unassigned', 'assigned', 'in_progress', 'done', 'cancelled']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

// ISO 8601 instant with an explicit offset; responses are always UTC (`...Z`).
const instant = z.iso.datetime({ offset: true });

/**
 * The window must end after it starts and must not cross local midnight (Asia/Jerusalem);
 * ending at exactly 00:00 counts as crossing. Enforced by the API (database CHECK).
 */
export const createJobSchema = z
  .object({
    location: lonLatSchema,
    skillIds: skillIdsSchema,
    serviceDurationS: z.number().int().positive(),
    windowStart: instant,
    windowEnd: instant,
    priority: z.number().int().min(0).max(100),
  })
  .strict();
export type CreateJob = z.infer<typeof createJobSchema>;

export const updateJobSchema = createJobSchema.partial().refine(nonEmpty, { message: 'At least one field is required' });
export type UpdateJob = z.infer<typeof updateJobSchema>;

export const jobSchema = createJobSchema.extend({
  id: z.number().int().positive(),
  status: jobStatusSchema,
  /** Local date (YYYY-MM-DD) of the window start; derived, read-only. */
  day: z.iso.date(),
});
export type Job = z.infer<typeof jobSchema>;
