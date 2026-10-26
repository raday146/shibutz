// Gateway adapters against the dockerized OSRM and VROOM (skipped when they are down).
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { LonLat } from '@shibutz/contracts';
import { OsrmRoutingGateway } from '../src/gateways/osrm.gateway';
import { VroomSolverGateway } from '../src/gateways/vroom.gateway';
import { toVroomPayload } from '../src/planning/vroom-mapping';
import { describeIfUp, OSRM_URL, VROOM_URL } from './stack';

const TEL_AVIV: LonLat = [34.7818, 32.0853];
const JERUSALEM: LonLat = [35.2137, 31.7683];

describeIfUp('osrm')('OSRM routing gateway', () => {
  const osrm = new OsrmRoutingGateway(OSRM_URL);

  it('returns an integer duration matrix for [lon, lat] points', async () => {
    const matrix = await osrm.durationMatrix([TEL_AVIV, JERUSALEM]);

    expect(matrix).toHaveLength(2);
    expect(matrix[0]?.[0]).toBe(0);
    // About an hour by car; swapped coordinates would snap somewhere far off (or fail).
    expect(matrix[0]?.[1]).toBeGreaterThan(2400);
    expect(matrix[0]?.[1]).toBeLessThan(6000);
    expect(matrix.flat().every((c) => Number.isInteger(c))).toBe(true);
  });

  it('accepts exactly 500 locations', async () => {
    const points = Array.from({ length: 500 }, (_, i): LonLat => [34.7 + (i % 25) * 0.01, 32.0 + Math.floor(i / 25) * 0.005]);

    const matrix = await osrm.durationMatrix(points);

    expect(matrix).toHaveLength(500);
  }, 20_000);

  it('fails fast above 500 locations without calling OSRM', async () => {
    const offline = new OsrmRoutingGateway('http://127.0.0.1:9');
    const points = Array.from({ length: 501 }, (): LonLat => TEL_AVIV);

    await expect(offline.durationMatrix(points)).rejects.toThrow(BadRequestException);
  });

  it('returns a GeoJSON LineString route geometry in [lon, lat]', async () => {
    const line = await osrm.routeGeometry([TEL_AVIV, JERUSALEM]);

    expect(line.type).toBe('LineString');
    const [lon, lat] = line.coordinates[0] ?? [];
    expect(lon).toBeCloseTo(TEL_AVIV[0], 2);
    expect(lat).toBeCloseTo(TEL_AVIV[1], 2);
  });

  it('maps a timeout to 503 naming OSRM', async () => {
    const slow = new OsrmRoutingGateway(OSRM_URL, 1);

    await expect(slow.durationMatrix([TEL_AVIV, JERUSALEM])).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/^OSRM unavailable: .*timeout/) });
  });
});

describeIfUp('vroom')('VROOM solver gateway', () => {
  const payload = toVroomPayload(
    [{ id: 1, home: TEL_AVIV, skillIds: [], shift: [0, 3600] }],
    [{ id: 10, location: JERUSALEM, skillIds: [], serviceS: 60, window: [0, 3600], priority: 0 }],
    [
      [0, 100],
      [120, 0],
    ],
  );

  it('solves a custom-matrix payload', async () => {
    const solution = await new VroomSolverGateway(VROOM_URL).solve(payload);

    expect(solution.routes[0]?.duration).toBe(220);
    expect(solution.routes[0]?.steps.map((s) => [s.type, s.arrival])).toEqual([
      ['start', 0],
      ['job', 100],
      ['end', 280],
    ]);
  });

  it('maps a timeout to 503 naming VROOM', async () => {
    await expect(new VroomSolverGateway(VROOM_URL, 1).solve(payload)).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/^VROOM unavailable: .*timeout/) });
  });

  it('maps a solver error to 503 naming VROOM', async () => {
    await expect(new VroomSolverGateway(VROOM_URL).solve({ ...payload, vehicles: [] })).rejects.toThrow(ServiceUnavailableException);
  });
});
