import { z } from 'zod';

const id = z.number().int().positive();
const seconds = z.number().int().nonnegative();

export const unassignedReasonSchema = z.enum([
  'NO_SKILLED_TECHNICIAN',
  'WINDOW_OUTSIDE_ALL_SHIFTS',
  'UNREACHABLE',
  'NOT_FEASIBLE_IN_PLAN',
]);
export type UnassignedReason = z.infer<typeof unassignedReasonSchema>;

/** `POST /optimization/day/:date` response. Times are UTC instants; drive times are seconds. */
export const dayPlanSchema = z.object({
  date: z.iso.date(),
  totalDriveS: seconds,
  routes: z.array(
    z.object({
      technicianId: id,
      /** Travel from home through every stop and back home. */
      driveS: seconds,
      jobCount: z.number().int().nonnegative(),
      stops: z.array(z.object({ jobId: id, sequence: z.number().int().positive(), eta: z.iso.datetime(), etd: z.iso.datetime() })),
    }),
  ),
  unassigned: z.array(z.object({ jobId: id, reason: unassignedReasonSchema })),
});
export type DayPlan = z.infer<typeof dayPlanSchema>;
