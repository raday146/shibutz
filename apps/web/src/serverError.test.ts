import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { dictionaries } from './i18n';
import { errorKey } from './serverError';

describe('errorKey', () => {
  it('maps a known message to its own text', () => {
    expect(errorKey(new ApiError('Technician is inactive', 409))).toBe('error.techInactive');
    expect(errorKey(new ApiError('Concurrent change; retry', 409))).toBe('error.stale');
  });

  it('maps an unknown message by status and never returns server text', () => {
    expect(errorKey(new ApiError('Validation failed', 400))).toBe('error.http.400');
    expect(errorKey(new ApiError('Job not found', 404))).toBe('error.http.404');
    expect(errorKey(new ApiError('Cannot change a job from done to assigned', 409))).toBe('error.http.409');
    expect(errorKey(new ApiError('OSRM unavailable', 503))).toBe('error.http.503');
    expect(errorKey(new ApiError('Internal server error', 500))).toBe('error.http.500');
    expect(errorKey(new TypeError('Failed to fetch'))).toBe('error.network');
  });

  it('has a Hebrew and an English text for every key it can return', () => {
    for (const key of ['error.http.400', 'error.http.404', 'error.http.409', 'error.http.503', 'error.http.500'] as const) {
      expect(dictionaries.he[key]).toBeTruthy();
      expect(dictionaries.en[key]).toBeTruthy();
    }
  });
});
