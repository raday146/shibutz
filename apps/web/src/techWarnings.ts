import type { LonLat, Technician } from '@shibutz/contracts';
import type { Key } from './i18n';

/** Review-step warning thresholds (spec #60). Advisory only. */
export const WARN_FAR_HOME_KM = 50;
export const WARN_SHORT_SHIFT_H = 4;
export const WARN_LONG_SHIFT_H = 10;

export interface Warning { key: Key; params?: Record<string, number> }

const EARTH_KM = 6371;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km between two `[lon, lat]` points. */
export function distanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

const hours = (hhmm: string): number => Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60;

interface Draft { name: string; home: LonLat; from: string; to: string; skillIds: number[] }

/** Non-blocking warnings for a technician about to be saved, from the loaded roster. */
export function technicianWarnings(d: Draft, roster: Technician[]): Warning[] {
  const out: Warning[] = [];
  const active = roster.filter((x) => x.active);
  if (active.length && Math.min(...active.map((x) => distanceKm(d.home, x.home))) > WARN_FAR_HOME_KM) {
    out.push({ key: 'warn.farHome', params: { km: WARN_FAR_HOME_KM } });
  }
  const shift = hours(d.to) - hours(d.from);
  if (shift < WARN_SHORT_SHIFT_H) out.push({ key: 'warn.shortShift', params: { h: WARN_SHORT_SHIFT_H } });
  if (shift > WARN_LONG_SHIFT_H) out.push({ key: 'warn.longShift', params: { h: WARN_LONG_SHIFT_H } });
  if (!d.skillIds.length) out.push({ key: 'warn.noSkills' });
  const same = roster.filter((x) => x.name.trim().toLowerCase() === d.name.trim().toLowerCase());
  if (same.some((x) => x.active)) out.push({ key: 'warn.duplicateName' });
  if (same.some((x) => !x.active)) out.push({ key: 'warn.duplicateName.inactive' });
  return out;
}
