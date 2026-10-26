import { describe, expect, it } from 'vitest';
import { statusColor, toLatLng, toLatLngs } from './map';

describe('map helpers', () => {
  it('flips [lon, lat] to Leaflet [lat, lng]', () => {
    expect(toLatLng([34.78, 32.08])).toEqual([32.08, 34.78]);
    expect(toLatLngs([[34, 31], [35, 32]])).toEqual([[31, 34], [32, 35]]);
  });

  it('gives every job status a distinct colour', () => {
    const statuses = ['unassigned', 'assigned', 'in_progress', 'done', 'cancelled'] as const;
    expect(new Set(statuses.map(statusColor)).size).toBe(statuses.length);
  });
});
