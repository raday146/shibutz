import type { Job, JobStatus, LonLat, Skill } from '@shibutz/contracts';
import type { Lang } from './i18n';

/** Contracts are `[lon, lat]` (GeoJSON); Leaflet wants `[lat, lng]`. The only place that flips. */
export const toLatLng = ([lon, lat]: LonLat): [number, number] => [lat, lon];
/** The inverse of `toLatLng`, for a Leaflet point. */
export const fromLatLng = ({ lat, lng }: { lat: number; lng: number }): LonLat => [lng, lat];
export const toLatLngs = (points: LonLat[]): [number, number][] => points.map(toLatLng);
/** What users read: "lat, lon". The `[lon, lat]` order stays internal. */
export const formatLatLon = ([lon, lat]: LonLat): string => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

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

/** The day's unassigned jobs by id. */
export const unassignedJobs = (jobs: Job[], date: string): Job[] =>
  jobs.filter((j) => j.day === date && j.status === 'unassigned').sort((a, b) => a.id - b.id);

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

/** The skill's name in `lang`, or the other language's when that one is empty. */
export const skillName = (s: Skill, lang: Lang): string => (lang === 'he' ? s.nameHe || s.nameEn : s.nameEn || s.nameHe);

export const skillLabel = (ids: number[], skills: Skill[], lang: Lang): string =>
  ids.map((id) => skills.find((s) => s.id === id)).map((s, i) => (s ? skillName(s, lang) : `#${ids[i]}`)).join(', ');

/** Technician color slot (1 to 8) as the DESIGN.md token. */
export const routeVar = (slot: number): string => `var(--route-${slot})`;

export const shiftLabel = (start: string, end: string): string => `${start.slice(0, 5)}-${end.slice(0, 5)}`;

/** Israel wall-clock HH:MM of an ISO instant. */
export const time = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ZONE });

/** Today's calendar date in Israel, `YYYY-MM-DD`. */
export const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());

/** A `YYYY-MM-DD` day moved by `n` calendar days. */
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
