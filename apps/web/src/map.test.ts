import { describe, expect, it } from 'vitest';
import { JOB_STATUSES, statusColor, toLatLng, toLatLngs, unassignedRows } from './map';

describe('map helpers', () => {
  it('flips [lon, lat] to Leaflet [lat, lng]', () => {
    expect(toLatLng([34.78, 32.08])).toEqual([32.08, 34.78]);
    expect(toLatLngs([[34, 31], [35, 32]])).toEqual([[31, 34], [32, 35]]);
  });

  it('gives every job status a distinct colour', () => {
    const statuses = ['unassigned', 'assigned', 'in_progress', 'done', 'cancelled'] as const;
    expect(new Set(statuses.map(statusColor)).size).toBe(statuses.length);
  });

  it('lists every status for the legend, each with its colour', () => {
    expect(JOB_STATUSES).toEqual(['unassigned', 'assigned', 'in_progress', 'done', 'cancelled']);
  });

  it('lists the unassigned jobs of the day by id, with the reason from the last batch when known', () => {
    const job = (id: number, status: 'unassigned' | 'assigned', day: string) => ({ id, status, day, location: [34.8, 32.1] as [number, number] });
    const jobs = [job(9, 'unassigned', '2026-11-02'), job(3, 'unassigned', '2026-11-02'), job(5, 'assigned', '2026-11-02'), job(7, 'unassigned', '2026-11-03')];

    expect(unassignedRows(jobs, '2026-11-02', new Map([[3, 'NO_SKILLED_TECHNICIAN']]))).toEqual([
      { jobId: 3, location: [34.8, 32.1], reason: 'NO_SKILLED_TECHNICIAN' },
      { jobId: 9, location: [34.8, 32.1], reason: undefined },
    ]);
  });
});
