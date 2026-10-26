import { z } from 'zod';
import { lonLatSchema } from './common';

/** `GET /routes/:technicianId/:date`. Geometry is computed on demand (never stored); null when the route has no stops. */
export const routeViewSchema = z.object({
  technicianId: z.number().int().positive(),
  date: z.iso.date(),
  stops: z.array(
    z.object({
      jobId: z.number().int().positive(),
      sequence: z.number().int().positive(),
      location: lonLatSchema,
      eta: z.iso.datetime(),
      etd: z.iso.datetime(),
      actualArrival: z.iso.datetime().nullable(),
      actualDeparture: z.iso.datetime().nullable(),
    }),
  ),
  geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(lonLatSchema) }).nullable(),
});
export type RouteView = z.infer<typeof routeViewSchema>;
