#!/usr/bin/env bash
# Smoke test for the local stack (issue #2). Needs: curl, jq. Run after `docker compose up -d`.
set -euo pipefail

OSRM_URL=${OSRM_URL:-http://localhost:5001}
VROOM_URL=${VROOM_URL:-http://localhost:3000}
fail() { echo "FAIL: $*" >&2; exit 1; }

# 1. OSRM /route Tel Aviv -> Jerusalem ([lon,lat])
route=$(curl -fsS "$OSRM_URL/route/v1/driving/34.7818,32.0853;35.2137,31.7683?overview=false") || fail "OSRM unreachable"
[ "$(jq -r .code <<<"$route")" = Ok ] || fail "OSRM code: $(jq -c . <<<"$route")"
dist=$(jq '.routes[0].distance' <<<"$route")
dur=$(jq '.routes[0].duration' <<<"$route")
# Road distance TLV->JLM is ~60-70 km.
jq -e '.routes[0].distance > 50000 and .routes[0].distance < 90000' <<<"$route" >/dev/null || fail "OSRM distance out of range: $dist"
echo "OK osrm /route Tel Aviv->Jerusalem: ${dist} m, ${dur} s"

# 2. VROOM: 2 vehicles, 5 jobs, skills, custom duration matrix (locations by index).
# Location 0 = depot. Vehicle 1 has skill 1, vehicle 2 has skill 2.
# Jobs 1-2 need skill 1, jobs 3-4 need skill 2, job 5 needs skill 1 AND 2 -> nobody can do it.
problem='{
  "vehicles": [
    {"id": 1, "start_index": 0, "end_index": 0, "skills": [1]},
    {"id": 2, "start_index": 0, "end_index": 0, "skills": [2]}
  ],
  "jobs": [
    {"id": 1, "location_index": 1, "service": 300, "skills": [1]},
    {"id": 2, "location_index": 2, "service": 300, "skills": [1]},
    {"id": 3, "location_index": 3, "service": 300, "skills": [2]},
    {"id": 4, "location_index": 4, "service": 300, "skills": [2]},
    {"id": 5, "location_index": 5, "service": 300, "skills": [1, 2]}
  ],
  "matrices": {"car": {"durations": [
    [0,   600, 700, 800, 900, 500],
    [600, 0,   200, 900, 900, 400],
    [700, 200, 0,   900, 900, 400],
    [800, 900, 900, 0,   250, 400],
    [900, 900, 900, 250, 0,   400],
    [500, 400, 400, 400, 400, 0  ]
  ]}}
}'
sol=$(curl -fsS -H 'Content-Type: application/json' -d "$problem" "$VROOM_URL/") || fail "VROOM unreachable"
[ "$(jq -r .code <<<"$sol")" = 0 ] || fail "VROOM code: $(jq -c . <<<"$sol")"
jobs_of() { jq -c "[.routes[] | select(.vehicle==$1) | .steps[] | select(.type==\"job\") | .id] | sort" <<<"$sol"; }
[ "$(jobs_of 1)" = '[1,2]' ] || fail "vehicle 1 jobs: $(jobs_of 1)"
[ "$(jobs_of 2)" = '[3,4]' ] || fail "vehicle 2 jobs: $(jobs_of 2)"
[ "$(jq -c '[.unassigned[].id]' <<<"$sol")" = '[5]' ] || fail "unassigned: $(jq -c .unassigned <<<"$sol")"
# Cost = 600+200+700 (v1) + 800+250+900 (v2) = 3450
[ "$(jq .summary.cost <<<"$sol")" = 3450 ] || fail "cost: $(jq .summary.cost <<<"$sol")"
echo "OK vroom custom matrix: v1=$(jobs_of 1) v2=$(jobs_of 2) unassigned=[5] cost=3450"
