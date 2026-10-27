import type { Job, JobStatus, LonLat, Skill } from '@shibutz/contracts';

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
  title: string;
  address: string;
  location: LonLat;
  reason: string | undefined;
}

/** The day's unassigned jobs by id; `reasons` comes from the last batch run in this session, if any. */
export function unassignedRows(jobs: Pick<Job, 'id' | 'title' | 'address' | 'status' | 'day' | 'location'>[], date: string, reasons: Map<number, string>): UnassignedRow[] {
  return jobs
    .filter((j) => j.day === date && j.status === 'unassigned')
    .map((j) => ({ jobId: j.id, title: j.title, address: j.address, location: j.location, reason: reasons.get(j.id) }))
    .sort((a, b) => a.jobId - b.jobId);
}

const ZONE = 'Asia/Jerusalem';

/** Offset of ZONE from UTC at an instant, in ms (DST-aware via Intl). */
function zoneOffsetMs(t: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date(t));
  const n = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute')) - t;
}

/** Israel wall-clock `date` + `HH:MM` to a UTC ISO instant; the second pass fixes the guess across a DST change. */
export function jerusalemToIso(date: string, hhmm: string): string {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - zoneOffsetMs(guess);
  return new Date(guess - zoneOffsetMs(first)).toISOString();
}

export const skillLabel = (ids: number[], skills: Skill[]): string =>
  ids.map((id) => skills.find((s) => s.id === id)?.name ?? `#${id}`).join(', ');

export const shiftLabel = (start: string, end: string): string => `${start.slice(0, 5)}-${end.slice(0, 5)}`;

/** Israel wall-clock HH:MM of an ISO instant. */
export const time = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ZONE });
