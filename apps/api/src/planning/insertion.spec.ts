import { suggestInsertions, type InsertionCandidate, type NewJob } from './insertion';
import { scheduleRoute } from './schedule';

type Point = [x: number, y: number];
const euclid = (points: Point[]): number[][] => points.map((a) => points.map((b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]))));

// Matrix index 0 is always the new job.
const NEW: NewJob = { index: 0, window: [0, 100_000], serviceS: 100 };

describe('suggestInsertions', () => {
  // home (0,0), one stop (100,0), new job (50,50): t(home,new) = t(new,stop) = 71, t(home,stop) = 100.
  const points: Point[] = [[50, 50], [0, 0], [100, 0]];
  const tech = (stopWindow: [number, number], shiftEndS = 100_000): InsertionCandidate => ({
    technicianId: 1,
    start: { index: 1, departureS: 0 },
    stops: [{ index: 2, window: stopWindow, serviceS: 100 }],
    home: { index: 1, shiftEndS },
  });

  it('lets waiting absorb a detour: the stop still starts at its window opening', () => {
    const { options } = suggestInsertions([tech([500, 600])], NEW, euclid(points));
    const first = options.find((o) => o.slot === 0);
    expect(first?.detourS).toBe(42);
    // new job arrives at 71, leaves at 171, reaches the stop at 242 and waits until 500.
    expect(first?.schedule.stops.map((s) => s.startS)).toEqual([71, 500]);
  });

  it('places a job whose service is longer than its window when it can start inside it', () => {
    const long: NewJob = { index: 0, window: [71, 100], serviceS: 1000 };
    const { options } = suggestInsertions([tech([0, 100_000])], long, euclid(points));

    expect(options.find((o) => o.slot === 0)?.schedule.stops[0]?.startS).toBe(71);
  });

  it('rejects a slot whose detour pushes a later stop past its window', () => {
    const { options } = suggestInsertions([tech([100, 150])], NEW, euclid(points));
    expect(options.map((o) => o.slot)).toEqual([1]); // after the stop: arrival at 100 stays on time
  });

  it('rejects a slot whose return leg ends after the shift', () => {
    // index 0 new, 1 home, 2 stop. Cheap: both slots fit. Expensive: t(new, home) = 500 breaks only the last slot.
    const matrix = (newToHome: number): number[][] => [
      [0, newToHome, 50],
      [100, 0, 100],
      [50, 100, 0],
    ];
    const t = tech([0, 100_000], 700);
    expect(suggestInsertions([t], NEW, matrix(100)).options.map((o) => o.slot)).toEqual([0, 1]);
    expect(suggestInsertions([t], NEW, matrix(500)).options.map((o) => o.slot)).toEqual([0]);
  });

  it('reports NO_FEASIBLE_POSITION when every slot fails', () => {
    // Existing route: stop at 100 (on time), back home at 300 (shift end 320). Slot 0 misses the stop window, slot 1 the shift end.
    const { options, rejections } = suggestInsertions([tech([0, 100], 320)], NEW, euclid(points));
    expect(options).toEqual([]);
    expect(rejections).toEqual([{ technicianId: 1, reason: 'NO_FEASIBLE_POSITION' }]);
  });

  it('excludes a technician whose route is already late', () => {
    const { options, rejections } = suggestInsertions([tech([10, 50])], NEW, euclid(points));
    expect(options).toEqual([]);
    expect(rejections).toEqual([{ technicianId: 1, reason: 'ROUTE_ALREADY_LATE' }]);
  });

  it('treats an empty route as home -> new -> home', () => {
    const empty: InsertionCandidate = { technicianId: 1, start: { index: 1, departureS: 0 }, stops: [], home: { index: 1, shiftEndS: 100_000 } };
    const { options } = suggestInsertions([empty], NEW, euclid(points));
    expect(options.map((o) => [o.slot, o.detourS])).toEqual([[0, 142]]);
  });
});

describe('suggestInsertions ranking', () => {
  // Two identical technicians (indices 1-2 and 3-4); the new job is index 0 at the same distance from both.
  const points: Point[] = [[0, 50], [-100, 0], [-100, 100], [100, 0], [100, 100]];
  const make = (technicianId: number, base: number, serviceS = 100): InsertionCandidate => ({
    technicianId,
    start: { index: base, departureS: 0 },
    stops: [{ index: base + 1, window: [0, 100_000], serviceS }],
    home: { index: base, shiftEndS: 100_000 },
  });
  const ids = (cs: InsertionCandidate[]): number[] => suggestInsertions(cs, NEW, euclid(points)).options.map((o) => o.technicianId);

  it('ranks by detour first', () => {
    const near: InsertionCandidate = { ...make(9, 1), stops: [{ index: 2, window: [0, 100_000], serviceS: 100 }] };
    const far: Point[] = [[0, 50], [-100, 0], [-100, 100], [100, 0], [300, 0]];
    const result = suggestInsertions([make(1, 3), near], NEW, euclid(far));
    expect(result.options[0]?.technicianId).toBe(9);
  });

  it('breaks a detour tie by total route duration', () => {
    expect(ids([make(1, 1, 900), make(2, 3, 100)]).slice(0, 2)).toEqual([2, 2]);
  });

  it('breaks a full tie by technician id', () => {
    expect(ids([make(7, 1), make(3, 3)]).slice(0, 2)).toEqual([3, 3]);
  });
});

describe('suggestInsertions property', () => {
  // mulberry32: fixed seed keeps the run reproducible.
  function prng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('never returns an infeasible option, and only rejects when every slot is infeasible', () => {
    const rand = prng(20260626);
    const int = (max: number): number => Math.floor(rand() * max);
    let feasible = 0;
    let rejected = 0;

    for (let round = 0; round < 300; round++) {
      const stopCount = int(5);
      const points: Point[] = Array.from({ length: 2 + stopCount }, () => [int(2000), int(2000)]);
      const matrix = euclid(points);
      const stops = Array.from({ length: stopCount }, (_, i) => {
        const open = int(4000);
        return { index: 2 + i, window: [open, open + int(3000)] as [number, number], serviceS: 1 + int(300) };
      });
      const home = { index: 1, shiftEndS: 3000 + int(6000) };
      const job: NewJob = { index: 0, window: [int(3000), 3000 + int(5000)], serviceS: 1 + int(300) };
      const t: InsertionCandidate = { technicianId: 1, start: { index: 1, departureS: int(1000) }, stops, home };

      const { options, rejections } = suggestInsertions([t], job, matrix);
      for (const o of options) {
        const route = [...stops.slice(0, o.slot), { index: 0, window: job.window, serviceS: job.serviceS }, ...stops.slice(o.slot)];
        expect(scheduleRoute({ start: t.start, stops: route, home }, matrix).violations).toEqual([]);
        feasible++;
      }
      if (options.length === 0 && rejections[0]?.reason === 'NO_FEASIBLE_POSITION') {
        for (let slot = 0; slot <= stopCount; slot++) {
          const route = [...stops.slice(0, slot), { index: 0, window: job.window, serviceS: job.serviceS }, ...stops.slice(slot)];
          expect(scheduleRoute({ start: t.start, stops: route, home }, matrix).violations).not.toEqual([]);
        }
        rejected++;
      }
    }
    // The generator must exercise both outcomes, or the test proves nothing.
    expect(feasible).toBeGreaterThan(20);
    expect(rejected).toBeGreaterThan(10);
  });
});
