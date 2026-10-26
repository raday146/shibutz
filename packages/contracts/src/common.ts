import { z } from 'zod';

/** A point, always `[lon, lat]` (GeoJSON, OSRM, VROOM, ST_MakePoint order). */
export const lonLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LonLat = z.infer<typeof lonLatSchema>;

/** Skill ids; unknown ids are rejected by the API. */
export const skillIdsSchema = z.array(z.number().int().positive()).transform((ids) => [...new Set(ids)]);

export const nonEmpty = (v: object): boolean => Object.keys(v).length > 0;
