import { z } from 'zod';
import { lonLatSchema, nonEmpty, skillIdsSchema } from './common';

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

export const updateTechnicianSchema = createTechnicianSchema
  .partial()
  .refine(nonEmpty, { message: 'At least one field is required' });
export type UpdateTechnician = z.infer<typeof updateTechnicianSchema>;

export const technicianSchema = createTechnicianSchema.extend({ id: z.number().int().positive() });
export type Technician = z.infer<typeof technicianSchema>;
