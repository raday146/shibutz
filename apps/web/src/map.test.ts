import type { Job } from '@shibutz/contracts';
import { describe, expect, it } from 'vitest';
import { JOB_STATUSES, jerusalemToIso, shiftLabel, skillLabel, statusColor, toLatLng, toLatLngs, unassignedJobs } from './map';

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

  it('lists the unassigned jobs of the day by id', () => {
    const job = (id: number, status: 'unassigned' | 'assigned', day: string) => ({ id, status, day }) as Job;
    const jobs = [job(9, 'unassigned', '2026-11-02'), job(3, 'unassigned', '2026-11-02'), job(5, 'assigned', '2026-11-02'), job(7, 'unassigned', '2026-11-03')];
    expect(unassignedJobs(jobs, '2026-11-02').map((j) => j.id)).toEqual([3, 9]);
  });

  it('converts Israel wall-clock time to UTC across winter and summer time', () => {
    expect(jerusalemToIso('2026-11-02', '09:00')).toBe('2026-11-02T07:00:00.000Z');
    expect(jerusalemToIso('2026-07-01', '09:00')).toBe('2026-07-01T06:00:00.000Z');
    expect(jerusalemToIso('2026-03-27', '03:30')).toBe('2026-03-27T00:30:00.000Z'); // DST starts the same morning at 02:00
  });

  it('labels skills and shifts', () => {
    const skills = [{ id: 2, code: 'plumbing', nameEn: 'Plumbing', nameHe: 'אינסטלציה' }];
    expect(skillLabel([2, 9], skills, 'en')).toBe('Plumbing, #9');
    expect(skillLabel([2], skills, 'he')).toBe('אינסטלציה');
    expect(shiftLabel('08:00:00', '16:00:00')).toBe('08:00-16:00');
  });
});
