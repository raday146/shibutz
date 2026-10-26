import { ceilDurations } from './osrm.gateway';

describe('OSRM duration rounding', () => {
  it('rounds float seconds up and keeps null (no route)', () => {
    expect(
      ceilDurations([
        [0, 3326.1],
        [3211.0001, null],
      ]),
    ).toEqual([
      [0, 3327],
      [3212, null],
    ]);
  });
});
