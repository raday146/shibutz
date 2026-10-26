import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { lonLatSchema } from '@shibutz/contracts';
import type { LonLat } from '@shibutz/contracts';
import { postJson } from './ports';
import type { DurationMatrix, LineString, RoutingGateway } from './ports';

/** Matches `osrm-routed --max-table-size 500`; no chunking. */
export const MAX_TABLE_LOCATIONS = 500;

const tableSchema = z.object({ code: z.literal('Ok'), durations: z.array(z.array(z.number().nullable())) });
const routeSchema = z.object({
  code: z.literal('Ok'),
  routes: z.tuple([z.object({ geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(lonLatSchema) }) })], z.unknown()),
});

/** The one owner of duration rounding: OSRM float seconds are rounded up. */
export function ceilDurations(durations: (number | null)[][]): DurationMatrix {
  return durations.map((row) => row.map((c) => (c === null ? null : Math.ceil(c))));
}

/** OSRM 26.x JSON POST API; coordinates are `[lon, lat]` as given. */
export class OsrmRoutingGateway implements RoutingGateway {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 5000,
  ) {}

  async durationMatrix(points: LonLat[]): Promise<DurationMatrix> {
    if (points.length > MAX_TABLE_LOCATIONS) {
      throw new BadRequestException(`${points.length} locations exceed the ${MAX_TABLE_LOCATIONS}-location matrix limit`);
    }
    const body = { coordinates: points, annotations: ['duration'] };
    const { durations } = await postJson('OSRM', `${this.url}/table/v1/driving`, body, tableSchema, this.timeoutMs);
    return ceilDurations(durations);
  }

  async routeGeometry(points: LonLat[]): Promise<LineString> {
    const body = { coordinates: points, geometries: 'geojson', overview: 'full' };
    const { routes } = await postJson('OSRM', `${this.url}/route/v1/driving`, body, routeSchema, this.timeoutMs);
    return routes[0].geometry;
  }
}
