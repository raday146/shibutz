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

## Tests
- E2E boots the real `AppModule` against `shibutz_test` on the compose PostGIS. Jest global setup creates
  the database if missing and migrates it once per run; `setupTestApp()` (`apps/api/test/app.ts`) truncates
  all tables before each test. Runs `--runInBand`.
- Integration tests against OSRM/VROOM use `describeIfUp('osrm' | 'vroom', ...)` from `apps/api/test/stack.ts`
  and are skipped when the service does not answer.
- Env overrides: `DATABASE_URL` (admin/dev DB; tests switch to `shibutz_test`), `OSRM_URL`, `VROOM_URL`, `PORT`.
