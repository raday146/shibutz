import { customType } from 'drizzle-orm/pg-core';
import { parseEWKB } from 'drizzle-orm/pg-core/columns/postgis_extension/utils';
import type { LonLat } from '@shibutz/contracts';

/**
 * The single owner of coordinate order between the app and PostGIS: always `[lon, lat]`.
 * drizzle-kit quotes this type in generated SQL; remove the quotes by hand (see migrations).
 */
export const geographyPoint = customType<{ data: LonLat; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
  toDriver: ([lon, lat]) => `SRID=4326;POINT(${lon} ${lat})`,
  fromDriver: (hex) => parseEWKB(hex),
});
