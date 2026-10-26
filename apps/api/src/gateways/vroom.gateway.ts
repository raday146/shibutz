import { vroomSolutionSchema } from '../planning/vroom-mapping';
import type { VroomPayload, VroomSolution } from '../planning/vroom-mapping';
import { postJson } from './ports';
import type { SolverGateway } from './ports';

/** vroom-express `POST /`. Payloads always carry a custom matrix, so VROOM never routes. */
export class VroomSolverGateway implements SolverGateway {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 30_000,
  ) {}

  solve(payload: VroomPayload): Promise<VroomSolution> {
    return postJson('VROOM', this.url, payload, vroomSolutionSchema, this.timeoutMs);
  }
}
