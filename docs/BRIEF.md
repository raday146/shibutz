# Field Technician Routing — Project Brief

> Input for a spec-driven session with Claude Code.
> Status: **superseded by the spec** (GitHub issue #1), which resolved the open questions in section 9 and changed some decisions (for example a `routes` table with versions, a custom VROOM matrix with no VROOM→OSRM wiring, forward propagation with waiting). Kept as planning background.

---

## 1. Purpose

A **learning project**. The goal is to gain hands-on understanding of:

- GIS data and spatial queries (PostGIS)
- Routing engines on OpenStreetMap data (OSRM)
- Vehicle Routing Problem (VRP) optimization (VROOM)
- Implementing a scheduling heuristic by hand and comparing it to a real solver

Clean architecture, tests and readable code matter more than feature count.

## 2. Problem statement

A field-service company has technicians working in the field. Each technician has a set of **skills**. Each job has a location, required skills, a service duration, a time window and a priority.

The system must support two flows:

1. **Batch optimization** — given all jobs for a day, assign them to technicians and order each route so total drive time is minimized, skills match, and time windows and shifts are respected.
2. **Dynamic insertion** — given technicians who already have a schedule for today, and a **new job** that arrives, find where it can be inserted (which technician, between which two stops) with the **smallest detour**, without breaking any existing time window or shift end. The business goal: fit more nearby jobs into a technician's existing day.

## 3. Agreed technical decisions

| Area | Decision |
|---|---|
| Routing engine | **OSRM**, `car` profile, **MLD** algorithm (`osrm-extract` → `osrm-partition` → `osrm-customize` → `osrm-routed --algorithm mld`) |
| Map data | Geofabrik extract: `asia/israel-and-palestine-latest.osm.pbf` |
| Optimizer | **VROOM** via `vroom-docker` (includes `vroom-express` HTTP wrapper), configured to use the OSRM container as router |
| Backend | **NestJS** (TypeScript, strict) |
| Database | **PostgreSQL + PostGIS** |
| Frontend | React + a map library (see open questions) |
| Local env | `docker-compose`, developer machine is **macOS on Apple Silicon (M2)** |

Why VROOM: OSRM only computes routes and duration/distance matrices; it does not assign jobs. VROOM natively models vehicle skills, job skills (job eligible only if `job.skills ⊆ vehicle.skills`), time windows, service duration, priority, working hours, breaks, and per-vehicle start/end. It can also take an initial plan via vehicle `steps`.

## 4. Initial domain model

- **technicians**: `id`, `name`, `home_location geography(Point,4326)`, `shift_start`, `shift_end`, skills (many-to-many)
- **skills**: `id` (integer — VROOM requires integer skill ids), `code`, `name`
- **jobs**: `id`, `location geography(Point,4326)`, required skills (many-to-many), `service_duration_s`, `tw_start`, `tw_end`, `priority` (0–100, VROOM range), `status` (`unassigned | assigned | in_progress | done | cancelled`)
- **route_stops**: `technician_id`, `job_id`, `date`, `sequence`, `eta`, `etd`

Modeling notes:
- OSRM and VROOM both use **`[lon, lat]`** order. PostGIS `ST_MakePoint(lon, lat)`. Enforce one helper for this — it is the most common bug.
- VROOM uses integer ids and seconds. Keep a mapping layer between domain entities and VROOM payloads.
- Store timestamps in UTC; convert to seconds-since-epoch (or since day start) only at the VROOM boundary.

## 5. Phases and acceptance criteria

### Phase 0 — Infrastructure
- `docker-compose` with: `postgis`, `osrm` (+ a one-off preprocessing script/service), `vroom` pointed at OSRM.
- **AC:** an OSRM `/route` call between two Israeli cities returns a route; a VROOM sample problem (2 vehicles, 5 jobs, skills) returns a solution via HTTP.

### Phase 1 — Domain, CRUD, seed data
- NestJS modules for technicians, skills, jobs. Migrations with PostGIS geography columns.
- Seed script: N technicians and M jobs, placed around **real town centers with small random jitter** (pure random points may land off-road or outside the extract).
- **AC:** seed is deterministic (fixed random seed); CRUD endpoints covered by e2e tests.

### Phase 2 — Map UI
- Show technicians, jobs (colored by status/skill) and routes (OSRM geometry as GeoJSON).
- **AC:** selecting a technician shows their ordered route for the day with ETAs.

### Phase 3 — Batch optimization
- `POST /optimization/day/:date` → build VROOM payload → call VROOM → persist `route_stops` → return summary.
- **AC:** no job assigned to a technician lacking a required skill; all time windows and shifts respected; unassigned jobs returned with a reason; total drive time reported.

### Phase 4 — Dynamic insertion (core learning phase)
Implement the heuristic by hand first:
1. **Candidate filter:** technicians with all required skills, whose route passes within a radius of the job (`ST_DWithin`) — reduces OSRM calls.
2. **Matrix:** one OSRM `/table` call for the new job + candidate stops.
3. **Insertion cost:** for each consecutive pair (a, b): `detour = t(a,new) + t(new,b) − t(a,b)`.
4. **Feasibility:** shift every later stop by `detour + service_duration`; reject if any time window or shift end is violated.
5. **Choose** the feasible insertion with minimum detour.

Endpoints:
- `POST /jobs/:id/insertion-suggestions` → top-N options (technician, position, detour, new ETAs).
- `POST /jobs/:id/insert` → commit a chosen option.

Then compare against VROOM solving with existing routes passed as vehicle `steps`.
- **AC:** heuristic is a pure function with unit tests over fixed, hand-built matrices; a test asserts it never returns an infeasible option; a comparison report (heuristic vs VROOM) for the seed scenario.

### Phase 5 — Advanced (optional)
Breaks, re-planning when a technician is delayed, day simulation, metrics (drive time, jobs per technician, utilization).

## 6. Non-goals

Authentication / multi-tenancy, mobile app, real-time GPS tracking, live traffic (OSRM has no live traffic), production deployment.

## 7. Risks to verify early

- **Apple Silicon:** confirm arm64 images exist for `osrm-backend` and `vroom-docker` at the chosen versions; fallback is `platform: linux/amd64`.
- **OSRM `/table` size limit:** `osrm-routed` has a default `--max-table-size`; raise it explicitly in compose.
- **VROOM `steps` semantics** differ between versions — pin a version and check its docs.
- Coordinate order `[lon, lat]` everywhere.

## 8. Testing strategy

- Unit: insertion heuristic and VROOM payload mapping (pure functions, fixed inputs).
- Integration: against dockerized OSRM/VROOM with a small known scenario.
- E2E: NestJS endpoints with a test database.

## 9. Open questions for the spec session

1. Map library: MapLibre GL vs Leaflet?
2. ORM / query layer: Prisma vs TypeORM vs Drizzle vs raw SQL — PostGIS geography support is the deciding factor.
3. Repo layout: monorepo (pnpm workspaces / Turborepo / Nx) or separate repos?
4. Optimization objective: drive time, distance, or load balance between technicians?
5. Does a technician start and end at home, or is the route open-ended?
6. Map scope: all of Israel, or a smaller region for faster preprocessing?
7. Planning horizon: single day only, or multi-day?

## 10. How the spec session was run

This section originally asked for `specs/requirements.md`, `specs/design.md` and `specs/tasks.md`. The project followed the mattpocock-skills flow instead:

1. Grilling session over this brief and section 9 (37 questions).
2. `to-spec`: the spec is GitHub issue #1.
3. `to-tickets`: tickets #2-#12 as sub-issues of #1, with native blocking edges.
4. `implement-spec`: implemented on the integration branch `feat/field-routing`, then reviewed and fixed.

Current status and pointers are in the root `CLAUDE.md`.
