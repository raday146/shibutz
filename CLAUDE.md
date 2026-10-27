# Field Technician Routing

Learning project: assign and route field technicians by skill, time window and shift,
using PostGIS, OSRM (car, MLD) and VROOM. Backend NestJS (strict TS), frontend React + map,
local env via docker-compose on macOS Apple Silicon.

Two flows: batch day optimization (VROOM) and dynamic insertion of a new job into
existing routes with minimum detour (hand-written heuristic, compared against VROOM).

## Source of truth
Spec issue #1 (`gh issue view 1`) is the source of truth for scope, decisions and acceptance criteria.
`docs/BRIEF.md` is the original planning brief and background; where the two disagree, the spec wins.

## Current status
Implemented on `feat/field-routing` (draft PR against `main`). The spec is GitHub issue #1 and supersedes
`docs/BRIEF.md` wherever they differ; tickets #2-#12 (closed) are the build history. Open follow-ups are the
`needs-triage` issues. How to run the stack, tests and demo commands: `README.md`; infra pins: `docs/infra.md`;
heuristic vs VROOM numbers: `docs/comparison-report.md`.

## UI
All UI work must follow `DESIGN.md`.

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
