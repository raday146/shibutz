import { z } from 'zod';
import { lonLatSchema, nonEmpty, skillIdsSchema } from './common';

/** At most this many technicians are active at once (one route color each). */
export const MAX_ACTIVE_TECHNICIANS = 8;
/** The lowest route color slot (1 to the cap) not in `taken`; undefined when all are taken. */
export const freeColorSlot = (taken: Iterable<number | null>): number | undefined => {
  const used = new Set(taken);
  return Array.from({ length: MAX_ACTIVE_TECHNICIANS }, (_, i) => i + 1).find((slot) => !used.has(slot));
};

/** The 409 message when a create or reactivation would exceed the cap; the console shows it as `error.activeCap`. */
export const ACTIVE_CAP_MESSAGE = '8 technicians are already active';

/** The 409 message when the version a client reviewed is no longer current; the console shows it as `review.stale`. */
export const STALE_TECHNICIAN_MESSAGE = 'Technician changed since the review';

/** The 409 message when a technician it would write to is inactive (deactivated meanwhile); the console shows it as `error.techInactive`. */
export const INACTIVE_TECHNICIAN_MESSAGE = 'Technician is inactive';
/** The 409 message when deactivation is refused; the response also carries every blocking date as `dates`. */
export const DEACTIVATE_BLOCKED_MESSAGE = 'Technician has unfinished stops on a route';

// Shift is a daily local (Asia/Jerusalem) wall-clock time, HH:MM:SS; end must be after start.
const localTime = z.iso.time({ precision: 0 });

export const createTechnicianSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    home: lonLatSchema,
    shiftStart: localTime,
    shiftEnd: localTime,
    skillIds: skillIdsSchema,
  })
  .strict();
export type CreateTechnician = z.infer<typeof createTechnicianSchema>;

// Route color slot, 1 to 8 (DESIGN.md palette). Always assigned by the server.
const colorSlot = z.number().int().min(1).max(8);

/** The changed fields plus the version the client reviewed; the write succeeds only if that is still the current version. */
export const updateTechnicianSchema = createTechnicianSchema
  .partial()
  .extend({ version: z.number().int().min(0) })
  .refine((v) => nonEmpty(Object.keys(v).filter((k) => k !== 'version')), { message: 'At least one field is required' });
export type UpdateTechnician = z.infer<typeof updateTechnicianSchema>;

export const technicianSchema = createTechnicianSchema.extend({
  id: z.number().int().positive(),
  /** Null exactly when the technician is inactive. */
  color: colorSlot.nullable(),
  active: z.boolean(),
  version: z.number().int().min(0),
});
export type Technician = z.infer<typeof technicianSchema>;

export const technicianChangeActions = ['created', 'updated', 'deactivated', 'reactivated'] as const;

/** The technician fields a change can record; a before/after holds only the ones that changed. */
export const technicianChangeFieldsSchema = createTechnicianSchema.partial();
export type TechnicianChangeFields = z.infer<typeof technicianChangeFieldsSchema>;

/** One row of the permanent technician change log. `name` is the technician's name at that time. */
export const technicianChangeSchema = z.object({
  id: z.number().int().positive(),
  at: z.iso.datetime(),
  technicianId: z.number().int().positive(),
  action: z.enum(technicianChangeActions),
  name: z.string(),
  /** Null when there is no earlier state (created) or no field changed (deactivated, reactivated). */
  before: technicianChangeFieldsSchema.nullable(),
  after: technicianChangeFieldsSchema.nullable(),
});
export type TechnicianChange = z.infer<typeof technicianChangeSchema>;

/** `GET /technician-changes`: newest first, optionally one technician's, optionally only the latest `limit`. */
export const technicianChangesQuerySchema = z.object({
  technicianId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type TechnicianChangesQuery = z.infer<typeof technicianChangesQuerySchema>;

/** Body of deactivate and reactivate: the version the client reviewed. */
export const technicianVersionSchema = z.object({ version: z.number().int().min(0) }).strict();
export type TechnicianVersion = z.infer<typeof technicianVersionSchema>;
