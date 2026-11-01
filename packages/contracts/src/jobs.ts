import { z } from 'zod';
import { lonLatSchema, nonEmpty, skillIdsSchema } from './common';
import { unassignedReasonSchema } from './optimization';

export const jobStatusSchema = z.enum(['unassigned', 'assigned', 'in_progress', 'done', 'cancelled']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** The 409 message when a scheduling edit hits a job that has a route stop; the console shows it as `job.edit.conflict`. */
export const JOB_ON_ROUTE_MESSAGE = 'Job is on a route';
/** The 409 message when an edit hits a done or cancelled job; the console shows it as `job.edit.locked`. */
export const JOB_LOCKED_MESSAGE = 'Job is done or cancelled';

// ISO 8601 instant with an explicit offset; responses are always UTC (`...Z`).
const instant = z.iso.datetime({ offset: true });

/**
 * The window must end after it starts and must not cross local midnight (Asia/Jerusalem);
 * ending at exactly 00:00 counts as crossing. Enforced by the API (database CHECK).
 */
export const createJobSchema = z
  .object({
    title: z.string('Title is required').trim().min(1, 'Title is required'),
    address: z.string('Address is required').trim().min(1, 'Address is required'),
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
  /** Backfilled jobs have an empty address; only new ones must have one. */
  address: z.string(),
  status: jobStatusSchema,
  /** Local date (YYYY-MM-DD) of the window start; derived, read-only. */
  day: z.iso.date(),
  /** Last Plan day reason this job was left unplaced, and when that run happened; both null otherwise. */
  unassignedReason: unassignedReasonSchema.nullable(),
  unassignedAt: instant.nullable(),
});
export type Job = z.infer<typeof jobSchema>;

/** `PATCH /jobs/:id/status`; the API allows only the day-operation transitions. */
export const updateJobStatusSchema = z
  .object({
    status: jobStatusSchema,
    /** Why the job was cancelled; only recorded when `status` is `cancelled`, blank counts as none. */
    reason: z.string().max(500).optional(),
  })
  .strict();
export type UpdateJobStatus = z.infer<typeof updateJobStatusSchema>;
