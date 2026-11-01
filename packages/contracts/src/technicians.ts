import { z } from 'zod';
import { lonLatSchema, nonEmpty, skillIdsSchema } from './common';

/** At most this many technicians are active at once (one route color each). */
export const MAX_ACTIVE_TECHNICIANS = 8;
/** The 409 message when a create or reactivation would exceed the cap; the console shows it as `error.activeCap`. */
export const ACTIVE_CAP_MESSAGE = '8 technicians are already active';

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

export const updateTechnicianSchema = createTechnicianSchema
  .partial()
  .refine(nonEmpty, { message: 'At least one field is required' });
export type UpdateTechnician = z.infer<typeof updateTechnicianSchema>;

export const technicianSchema = createTechnicianSchema.extend({
  id: z.number().int().positive(),
  /** Null exactly when the technician is inactive. */
  color: colorSlot.nullable(),
  active: z.boolean(),
  version: z.number().int().min(0),
});
export type Technician = z.infer<typeof technicianSchema>;
