import type { Job, JobStatus, LonLat } from '@shibutz/contracts';

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

/** Order of the legend. */
export const JOB_STATUSES: JobStatus[] = ['unassigned', 'assigned', 'in_progress', 'done', 'cancelled'];

export interface UnassignedRow {
  jobId: number;
  location: LonLat;
  reason: string | undefined;
}

/** The day's unassigned jobs by id; `reasons` comes from the last batch run in this session, if any. */
export function unassignedRows(jobs: Pick<Job, 'id' | 'status' | 'day' | 'location'>[], date: string, reasons: Map<number, string>): UnassignedRow[] {
  return jobs
    .filter((j) => j.day === date && j.status === 'unassigned')
    .map((j) => ({ jobId: j.id, location: j.location, reason: reasons.get(j.id) }))
    .sort((a, b) => a.jobId - b.jobId);
}
