import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { z } from 'zod';
import type { LonLat } from '@shibutz/contracts';
import type { VroomPayload, VroomSolution } from '../planning/vroom-mapping';

/** Integer seconds, `[from][to]`; `null` means no road connection. */
export type DurationMatrix = (number | null)[][];
export interface LineString {
  type: 'LineString';
  coordinates: LonLat[];
}

// ponytail: no UNREACHABLE pre-check yet (#7); a null cell fails the whole request.
export function requireReachable(matrix: DurationMatrix): number[][] {
  return matrix.map((row) =>
    row.map((cell) => {
      if (cell === null) throw new UnprocessableEntityException('Some locations are not reachable by road');
      return cell;
    }),
  );
}

/** Duration standing in for "no road": longer than any shift, so such a leg is always infeasible. */
export const NO_ROAD_S = 1_000_000;

export const ROUTING_GATEWAY = Symbol('ROUTING_GATEWAY');
export interface RoutingGateway {
  durationMatrix(points: LonLat[]): Promise<DurationMatrix>;
  routeGeometry(points: LonLat[]): Promise<LineString>;
}

export const SOLVER_GATEWAY = Symbol('SOLVER_GATEWAY');
export interface SolverGateway {
  solve(payload: VroomPayload): Promise<VroomSolution>;
}

/** POSTs JSON and parses the reply; any failure (down, timeout, bad reply) is a 503 naming the service. */
export async function postJson<T>(service: string, url: string, body: unknown, schema: z.ZodType<T>, timeoutMs: number): Promise<T> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return schema.parse(await res.json());
  } catch (err) {
    throw new ServiceUnavailableException(`${service} unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}
