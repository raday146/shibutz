// Integration tests against the dockerized services. Each suite is tagged with the
// services it needs and is skipped when global-setup could not reach them.
import { describeIfUp, OSRM_URL, VROOM_URL } from './stack';

describeIfUp('osrm')('OSRM', () => {
  it('routes between Tel Aviv and Jerusalem ([lon, lat] order)', async () => {
    const res = await fetch(`${OSRM_URL}/route/v1/driving/34.7818,32.0853;35.2137,31.7683?overview=false`);
    const body = (await res.json()) as { code: string; routes: { duration: number }[] };

    expect(body.code).toBe('Ok');
    expect(body.routes[0]?.duration).toBeGreaterThan(0);
  });
});

describeIfUp('vroom')('VROOM', () => {
  it('solves a custom-matrix problem without a router', async () => {
    const res = await fetch(VROOM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vehicles: [{ id: 1, start_index: 0, end_index: 0 }],
        jobs: [{ id: 10, location_index: 1 }],
        matrices: { car: { durations: [[0, 100], [120, 0]] } },
      }),
    });
    const body = (await res.json()) as { code: number; summary: { cost: number } };

    expect(body.code).toBe(0);
    expect(body.summary.cost).toBe(220);
  });
});
