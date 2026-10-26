import { scheduleRoute } from './schedule';

// Locations: 0 = home, 1 and 2 = stops. Asymmetric on purpose.
const matrix = [
  [0, 100, 200],
  [150, 0, 50],
  [250, 60, 0],
];
const home = { index: 0, shiftEndS: 10_000 };

describe('scheduleRoute', () => {
  it('propagates arrival, service and departure without waiting', () => {
    const result = scheduleRoute(
      {
        start: { index: 0, departureS: 1000 },
        stops: [
          { index: 1, window: [0, 5000], serviceS: 300 },
          { index: 2, window: [0, 5000], serviceS: 200 },
        ],
        home,
      },
      matrix,
    );

    expect(result.stops).toEqual([
      { arrivalS: 1100, startS: 1100, departureS: 1400 },
      { arrivalS: 1450, startS: 1450, departureS: 1650 },
    ]);
    expect(result.returnS).toBe(1900);
    expect(result.violations).toEqual([]);
  });

  it('waits for the window to open and departs after the wait plus service', () => {
    const result = scheduleRoute(
      {
        start: { index: 0, departureS: 1000 },
        stops: [
          { index: 1, window: [2000, 3000], serviceS: 300 },
          { index: 2, window: [0, 5000], serviceS: 200 },
        ],
        home,
      },
      matrix,
    );

    expect(result.stops[0]).toEqual({ arrivalS: 1100, startS: 2000, departureS: 2300 });
    expect(result.stops[1]).toEqual({ arrivalS: 2350, startS: 2350, departureS: 2550 });
    expect(result.violations).toEqual([]);
  });

  it('reports a stop whose service would start after its window closes', () => {
    const result = scheduleRoute(
      {
        start: { index: 0, departureS: 1000 },
        stops: [
          { index: 1, window: [0, 1050], serviceS: 300 },
          { index: 2, window: [0, 5000], serviceS: 200 },
        ],
        home,
      },
      matrix,
    );

    expect(result.violations).toEqual([{ kind: 'late', stop: 0 }]);
    // Propagation continues from the late departure.
    expect(result.stops[1]?.arrivalS).toBe(1450);
  });

  it('accepts service starting exactly at the window end', () => {
    const result = scheduleRoute(
      { start: { index: 0, departureS: 1000 }, stops: [{ index: 1, window: [0, 1100], serviceS: 1 }], home },
      matrix,
    );

    expect(result.violations).toEqual([]);
  });

  it('reports returning home after shift end, and accepts exactly at shift end', () => {
    const input = {
      start: { index: 0, departureS: 1000 },
      stops: [{ index: 2, window: [0, 5000] as [number, number], serviceS: 300 }],
    };

    // Depart 1000 + 200 -> 1200 + 300 = 1500, home leg 250 -> 1750.
    expect(scheduleRoute({ ...input, home: { index: 0, shiftEndS: 1750 } }, matrix).violations).toEqual([]);
    expect(scheduleRoute({ ...input, home: { index: 0, shiftEndS: 1749 } }, matrix)).toMatchObject({
      returnS: 1750,
      violations: [{ kind: 'after_shift_end' }],
    });
  });

  it('returns directly home when there are no stops', () => {
    const result = scheduleRoute({ start: { index: 1, departureS: 500 }, stops: [], home }, matrix);

    expect(result).toEqual({ stops: [], returnS: 650, violations: [] });
  });
});
