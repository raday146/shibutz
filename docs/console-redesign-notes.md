# Console redesign: inputs for the spec

> Superseded by issue #35. These notes were the input to that spec; the data-model decisions, ticket order and scope there are authoritative, and this file is no longer kept in step with them.

Working notes from the design and grilling session. The spec issue is written from these, from `DESIGN.md`, `GLOSSARY.md`, `docs/console-copy.md` and `docs/adr/0001-cancelled-stop-history-in-its-own-table.md`. A throwaway interactive prototype and eight screenshots are on the branch `prototype/console-redesign` in `docs/prototype/`.

## Goal

Replace the developer test page with a dispatch console: a dispatcher plans a day, sees who owns what, places late jobs, and follows the day. Desktop first (1024px and up), Hebrew by default with full RTL and an English toggle, light theme only.

## Scope decisions

- In v1: top bar (date, four KPIs, plan day, incidents indicator, language toggle), left panel with a "Technicians | Unassigned (n)" switch, map with owner colors and numbered stops, work-day drawer, new-job modal with map-pick, stop status actions (start, finish, cancel with confirm, unassign), stop notes, end-of-day summary, incidents, open-incident count with a short list grouped by date.
- Out of v1: live updates (reload after actions and a refresh button), cross-day incident inbox, geocoding (the address is typed text and the location comes from the map), changing technician home, shift or skills in the UI, phone layouts.
- Phase 2, in the spec but not built first: a timeline (technicians by hours) behind a Map | Timeline switch.

## Data model and API changes

- `jobs`: required `title` and `address` (legacy rows backfilled with "Job {id}" and an empty address).
- `job_notes`: one editable note per job, with `created_at` and `updated_at`.
- `job_cancellations`: technician, date, previous status, actual arrival and departure, `cancelled_at`, optional reason (ADR 0001).
- `day_reports`: one per technician and date. `incidents`: technician, date, optional job, text, open or reviewed, timestamps. Technicians with history cannot be deleted. Deleting a job nulls the incident's job.
- `skills`: `name_en` and `name_he` (rename and backfill). Contract changes from `name` to `nameEn` and `nameHe`.
- `technicians.color`: palette slot 1 to 8, lowest free slot on creation, exempt from the active-stops edit guard.
- New API surface: notes and reports read and write, incidents list (open, across dates) and review, cancelled-today per technician, cancellation with a reason.
- Seed: Hebrew technician names, skills, job titles and addresses, plus a few notes, one report with an open incident, one cancelled job. A test asserts Hebrew strings are stored in logical order.

## Ticket candidates, in order

1. Split `App.tsx` into components with no behavior change (first, pure refactor).
2. Data model and API: job title and address, skill names, technician color, with migrations and contract changes.
3. Hebrew seed content.
4. Notes and cancellation history (`job_notes`, `job_cancellations`).
5. Day reports and incidents (tables, endpoints, open-incident list).
6. Design foundation: semantic tokens, fonts, type scale, he and en dictionaries typed from one another, `dir` and `lang` plumbing, muted basemap.
7. Top bar: date navigation with the remembered date, KPIs, plan day with the re-plan confirmation, language toggle.
8. Map: route colors with casing, markers, fade on select, two-way linking, map controls.
9. Left panel: the switch and its rules, technician rows, collapsed unassigned rows, find a slot with options and the dashed preview.
10. Work-day drawer: timeline, expandable stops, status actions with blocked reasons, notes with autosave, end-of-day summary and incidents.
11. New-job modal with map-pick (click and center crosshair).
12. Incidents indicator and list.
13. Accessibility pass against the rules in `DESIGN.md`.
14. The 200% zoom stacked layout (drawer as bottom sheet, full-screen modal). Its own ticket.
15. Phase 2: timeline view.

## Findings from the prototype

Accepted into `DESIGN.md`: the segmented switch in place of a stacked queue, options scrolled into view, zoom control on the inline-start side, 28px buttons, no focus ring on the drawer heading, a map zoom clamp, a fixed stop-row order, a full-width "Add incident" button, and touch behavior for the preview. The prototype still shows the earlier stacked queue, so it is out of date on that one point.
