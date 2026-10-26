import type { JobStatus, LonLat } from '@shibutz/contracts';

/** Contracts are `[lon, lat]` (GeoJSON); Leaflet wants `[lat, lng]`. The only place that flips. */
export const toLatLng = ([lon, lat]: LonLat): [number, number] => [lat, lon];
export const toLatLngs = (points: LonLat[]): [number, number][] => points.map(toLatLng);

const COLORS: Record<JobStatus, string> = {
  unassigned: '#d97706',
  assigned: '#2563eb',
  in_progress: '#7c3aed',
  done: '#16a34a',
  cancelled: '#9ca3af',
};
export const statusColor = (status: JobStatus): string => COLORS[status];
