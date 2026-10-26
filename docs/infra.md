# Local stack

```sh
docker compose up -d      # first run: downloads Israel extract + OSRM preprocessing (~1 min on M2)
./scripts/smoke.sh        # needs curl + jq
```

| Service | Image (pinned) | arm64 | Host port |
| --- | --- | --- | --- |
| postgis | `imresamu/postgis:17-3.5` | native | 5432 (user/pass/db `shibutz`) |
| osrm-download (one-off) | `curlimages/curl:8.16.0` | native | - |
| osrm-prep (one-off) | `ghcr.io/project-osrm/osrm-backend:v26.10.0-debian` | native | - |
| osrm | same as osrm-prep | native | 5001 |
| vroom | `ghcr.io/vroom-project/vroom-docker:v1.15.0` (VROOM v1.15.0, vroom-express v0.12.0) | native | 3000 |

OSRM data lives in `data/osrm/` (gitignored). Each one-off service skips when its output exists
(`israel.osm.pbf`, `israel.osrm.cell_metrics`). Delete `data/osrm/` to rebuild.

## arm64 findings (checked with `docker buildx imagetools inspect`)
- `postgis/postgis` (official) publishes **amd64 only**. `imresamu/postgis` is the multi-arch build of the
  same Dockerfiles (maintained by a docker-postgis maintainer), so no emulation needed.
- OSRM moved to date-based versions (v26.x) after v6.0.0. Since v26.4.1 the plain `vX.Y.Z` tag is no
  longer published; use the `-debian` or `-alpine` suffix. All are multi-arch.
- OSRM image has no curl/wget, hence the separate download service.
- macOS AirPlay Receiver holds port 5000, so OSRM is published on 5001.

## OSRM
- `osrm-routed --algorithm mld --max-table-size 500` (default table size is 100).

## VROOM v1.15.0 (from `docs/API.md` at tag v1.15.0)
- No router wiring. vroom-docker defaults to `VROOM_ROUTER=osrm` at `0.0.0.0:5000` inside its own
  container, which is never reached because we always send custom matrices.
- **`matrices`**: `{"<profile>": {"durations": [[...]], "distances"?: [[...]], "costs"?: [[...]]}}`,
  unsigned integers, keyed by vehicle `profile` (default `car`). `durations` drive all timing checks.
  If only `durations` are given and distances are needed (`-g` or non-zero `per_km`), VROOM calls the
  router; so never request geometry and keep `per_km` at 0. Custom `costs` conflicts with a non-default
  `per_hour`. With default costs (`per_hour` 3600), cost equals total travel seconds.
- **`location_index`**: mandatory on jobs when custom matrices are given; `location` becomes optional
  (echoed back if set). Vehicles use `start_index` / `end_index`. Same index for both = round trip;
  omit `end_index` for an open route.
- **Vehicle `steps`** (`{type: start|job|pickup|delivery|break|end, id?, service_at?, service_after?, service_before?}`):
  - Solve mode (default): steps seed a single search from that solution (instead of several concurrent
    searches). Only job/pickup/delivery steps are used for ordering; `service_*` keys are ignored.
    Error if the seeded route violates any constraint.
  - Plan mode (`-c`, over HTTP: `"options": {"c": true}` in the request body): output follows `steps`
    exactly, `service_*` act as hard timing constraints, ETAs are computed and constraint breaks are
    reported per step in `violations` (e.g. `delay`, `lead_time`, `skills`) instead of failing.
    Verified against the running container.
- Skills: a job is eligible only if `job.skills ⊆ vehicle.skills`; ineligible jobs land in `unassigned`.
- Response `code`: 0 ok, 1 internal, 2 input, 3 routing error.
