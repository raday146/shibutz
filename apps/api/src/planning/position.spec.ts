import { currentPosition, type PositionStop } from './position';

const stop = (status: PositionStop['status'], arrivalS: number, departureS: number, serviceS = 600): PositionStop => ({
  status,
  arrivalS,
  departureS,
  serviceS,
});
const SHIFT = 28_800; // 08:00

describe('currentPosition', () => {
  it('is home at shift start when nothing has started', () => {
    expect(currentPosition([stop('assigned', 29_000, 29_600)], SHIFT, 25_000)).toEqual({ stop: null, departureS: SHIFT });
  });

  it('is home at now when now is after shift start', () => {
    expect(currentPosition([], SHIFT, 30_000)).toEqual({ stop: null, departureS: 30_000 });
  });

  it('is the last done stop at its departure, or now if later', () => {
    const stops = [stop('done', 29_000, 29_600), stop('done', 30_000, 30_600), stop('assigned', 31_000, 31_600)];
    expect(currentPosition(stops, SHIFT, 30_000)).toEqual({ stop: 1, departureS: 30_600 });
    expect(currentPosition(stops, SHIFT, 32_000)).toEqual({ stop: 1, departureS: 32_000 });
  });

  it('is the in_progress stop at arrival + service, or now if later', () => {
    const stops = [stop('done', 29_000, 29_600), stop('in_progress', 30_000, 30_600, 900), stop('assigned', 31_000, 31_600)];
    expect(currentPosition(stops, SHIFT, 30_100)).toEqual({ stop: 1, departureS: 30_900 });
    expect(currentPosition(stops, SHIFT, 31_500)).toEqual({ stop: 1, departureS: 31_500 });
  });
});
