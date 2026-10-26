export const OSRM_URL = process.env.OSRM_URL ?? 'http://localhost:5001';
export const VROOM_URL = process.env.VROOM_URL ?? 'http://localhost:3000';

type Service = 'osrm' | 'vroom';

/**
 * Tags an integration suite: runs it only when every named docker service answered the
 * probe in global-setup, otherwise reports it as skipped.
 */
export function describeIfUp(...services: Service[]): jest.Describe {
  const up = services.every((s) => process.env[`${s.toUpperCase()}_UP`] === '1');
  return up ? describe : describe.skip;
}
