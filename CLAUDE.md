# Field Technician Routing

Learning project: assign and route field technicians by skill, time window and shift,
using PostGIS, OSRM (car, MLD) and VROOM. Backend NestJS (strict TS), frontend React + map,
local env via docker-compose on macOS Apple Silicon.

Two flows: batch day optimization (VROOM) and dynamic insertion of a new job into
existing routes with minimum detour (hand-written heuristic, compared against VROOM).

## Source of truth
`docs/BRIEF.md` is the source of truth for scope, decisions, domain model, phases and
acceptance criteria. Read it before any work. If this file and the brief disagree, the brief wins.

## Current status
Pre-spec. No implementation code yet. Next step per brief §10: resolve open questions, then
write `specs/requirements.md`, `specs/design.md`, `specs/tasks.md` and wait for approval.

## Rules that bite
- Coordinates are always `[lon, lat]` (OSRM, VROOM, `ST_MakePoint(lon, lat)`); use one helper.
- VROOM uses integer ids and seconds; keep a mapping layer at that boundary. Store UTC.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues on `raday146/shibutz` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
