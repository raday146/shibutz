# shibutz

Field technician routing (see `docs/BRIEF.md`, spec in GitHub issue #1).

## Layout
- `apps/api`: NestJS API (strict TS, Drizzle, migrations in `apps/api/drizzle`)
- `apps/web`: Vite + React + Leaflet map UI (needs API, seeded data and OSRM for route lines)
- `packages/contracts`: zod schemas shared by API and web

## Run
Requires Node 24 (`nvm use`) and pnpm. Start the docker stack first (`docker compose up -d`, see `docs/infra.md`).

```sh
pnpm install
pnpm typecheck     # tsc -b over all packages
pnpm lint
pnpm test          # unit tests: apps/api/src/**/*.spec.ts
pnpm test:e2e      # e2e (*.e2e-spec.ts) + integration (*.int-spec.ts), see below
pnpm --filter @shibutz/api start          # migrate + run on :3001
pnpm --filter web dev                     # map UI on :5173, proxies API calls to :3001 (API_URL overrides)
pnpm --filter @shibutz/api compare        # heuristic-vs-VROOM report, in memory (needs OSRM + VROOM, no DB)
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
  loaded as `assigned` and the new job as `unassigned`, but no `routes` rows are written: `pnpm ... compare`
  reads the stop orders from that same export, not from the database.

## Tests
- E2E boots the real `AppModule` against `shibutz_test` on the compose PostGIS. Jest global setup creates
  the database if missing and migrates it once per run; `setupTestApp()` (`apps/api/test/app.ts`) truncates
  all tables before each test. Runs `--runInBand`. Set `TEST_DB_NAME` (default `shibutz_test`) per worktree so
  parallel runs do not truncate each other's data.
- Integration tests against OSRM/VROOM use `describeIfUp('osrm' | 'vroom', ...)` from `apps/api/test/stack.ts`
  and are skipped when the service does not answer.
- Env overrides: `DATABASE_URL` (admin/dev DB; tests switch to `TEST_DB_NAME`), `INSERTION_RADIUS_M` (default 10000), `OSRM_URL`, `VROOM_URL`, `PORT`.

## Known limitations
Accepted on purpose for this learning project (see the closed issues for the reasoning):
- **Cancelling an `in_progress` job deletes its stop**, so its `actual_departure` is not stored; the cancel time is
  only used as the start of the ETA recompute (#13). Planned-vs-actual metrics can't see cancelled stops.
- **Check-then-write guards**: `DELETE /technicians/:id` and edits to a routed job's location, window, service
  duration or skills are refused by a pre-check, not a lock, so a batch or insert committing in the same
  instant can slip past. Re-running the batch for the day repairs the result (#15).
- After a `done` stop the technician is assumed to still be at that stop (no GPS).
- Planned `eta`/`etd` of later stops are not rewritten when a stop is marked `done` or `in_progress`; actual times
  live in `actual_arrival`/`actual_departure`.
