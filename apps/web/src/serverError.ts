import { ACTIVE_CAP_MESSAGE, INACTIVE_TECHNICIAN_MESSAGE, JOB_LOCKED_MESSAGE, JOB_ON_ROUTE_MESSAGE, STALE_TECHNICIAN_MESSAGE } from '@shibutz/contracts';
import { ApiError } from './api';
import type { Key } from './i18n';

/** The API's own messages are English only; the ones with a localized text (docs/console-copy.md, Server messages). */
const KNOWN: Record<string, Key> = {
  'Only the first not-done stop of a route can be started': 'blocked.order',
  'Technician already has a stop in progress': 'blocked.busy',
  'Route changed concurrently; retry': 'error.stale',
  'Route changed since the suggestion': 'error.stale',
  'Concurrent change; retry': 'error.stale',
  'Job changed concurrently; retry': 'error.stale',
  'Technician color was taken concurrently; retry': 'error.stale',
  'That position is no longer available or feasible': 'slot.stale',
  'Technician has stops on a route; unassign or cancel those jobs first': 'error.techHasStops',
  'Some locations are not reachable by road': 'error.unreachable',
  'A stop that day has already started': 'plan.disabled',
  [INACTIVE_TECHNICIAN_MESSAGE]: 'error.techInactive',
  [STALE_TECHNICIAN_MESSAGE]: 'review.stale',
  [ACTIVE_CAP_MESSAGE]: 'error.activeCap',
  [JOB_ON_ROUTE_MESSAGE]: 'job.edit.conflict',
  [JOB_LOCKED_MESSAGE]: 'job.edit.locked',
};

/** The localized text for a refusal the console knows by message, else undefined. */
export const knownKey = (e: unknown): Key | undefined => (e instanceof TypeError ? 'error.network' : e instanceof ApiError ? KNOWN[e.message] : undefined);

/** A generic localized text by HTTP status, for refusals with no text of their own. Server text is never shown. */
export function statusKey(e: unknown): Key {
  const status = e instanceof ApiError ? e.status : 500;
  return status === 404 ? 'error.http.404' : status === 409 ? 'error.http.409' : status === 503 ? 'error.http.503' : status >= 500 ? 'error.http.500' : 'error.http.400';
}

/** Always a localized key: the known text, else the one for the status. */
export const errorKey = (e: unknown): Key => knownKey(e) ?? statusKey(e);
