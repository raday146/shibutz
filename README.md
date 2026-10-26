# shibutz

Field technician routing (see `docs/BRIEF.md`, spec in GitHub issue #1).

## Layout
- `apps/api`: NestJS API (strict TS, Drizzle, migrations in `apps/api/drizzle`)
- `packages/contracts`: zod schemas shared by API and (later) the web app

## Run
Requires Node 24 (`nvm use`) and pnpm. Start the docker stack first (`docker compose up -d`, see `docs/infra.md`).

```sh
pnpm install
pnpm typecheck     # tsc -b over all packages
pnpm lint
pnpm test          # unit tests: apps/api/src/**/*.spec.ts
pnpm test:e2e      # e2e (*.e2e-spec.ts) + integration (*.int-spec.ts), see below
pnpm --filter @shibutz/api start          # migrate + run on :3001
pnpm --filter @shibutz/api db:generate    # new migration after editing src/db/schema.ts
```

## Demo data
Both commands migrate, wipe skills/technicians/jobs (ids restart at 1) and insert fixed data from
`apps/api/src/seed/datasets.ts`. They first snap every point to OSRM `/nearest` and abort if one is more than
500 m from a road (outside the extract); if OSRM is down the check is skipped with a warning.

```sh
pnpm --filter @shibutz/api db:seed       # 6 skills, 8 technicians, 60 jobs on 2026-11-02 around 10 central-Israel towns
pnpm --filter @shibutz/api db:scenario   # heuristic-vs-VROOM comparison scenario (below)
```
- The seed uses a fixed PRNG seed and a fixed day, so every run produces identical rows and ids.
- The comparison scenario (`comparisonScenario`) has 3 technicians, 8 jobs and one new job (id 9, Givatayim, plumbing).
  Each technician's existing stop order is listed in `comparisonScenario.routes` as job ids. Those jobs are
  loaded as `assigned` and the new job as `unassigned`. The routes are not in the database yet: the
  `routes` tables arrive with #6, and the comparison (#12) should read them from that same export.

## Tests
- E2E boots the real `AppModule` against `shibutz_test` on the compose PostGIS. Jest global setup creates
  the database if missing and migrates it once per run; `setupTestApp()` (`apps/api/test/app.ts`) truncates
  all tables before each test. Runs `--runInBand`.
- Integration tests against OSRM/VROOM use `describeIfUp('osrm' | 'vroom', ...)` from `apps/api/test/stack.ts`
  and are skipped when the service does not answer.
- Env overrides: `DATABASE_URL` (admin/dev DB; tests switch to `shibutz_test`), `OSRM_URL`, `VROOM_URL`, `PORT`.
