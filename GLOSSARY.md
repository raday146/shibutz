# Field Technician Routing

Planning and dispatching field technicians: who visits which job, in what order, and when. Used by a dispatcher to plan a day, place late jobs, and follow the day as it unfolds.

## People and work

**Technician**:
A field worker with a home base, a daily shift and a set of skills.
_Avoid_: Worker, engineer, driver

**Job**:
One piece of work at one place, needing certain skills, with a service duration and a time window. It is either unassigned or part of one technician's route.
_Avoid_: Task, ticket, order

**Skill**:
A capability a job needs and a technician has. A technician can take a job only if they have every skill it needs.
_Avoid_: Trade, certification

**Time window**:
The earliest and latest time a job's service may start, within one local day.
_Avoid_: Slot, appointment

**Shift**:
The daily wall-clock hours a technician works, the same every day.
_Avoid_: Schedule, availability

## Planning

**Route**:
One technician's ordered stops for one date.
_Avoid_: Itinerary, run

**Stop**:
One job's place in a technician's route for a day, with planned and actual times.
_Avoid_: Visit, appointment

**Work day**:
The pair of one technician and one date. It is what the dispatcher opens to see the day, and what a day report belongs to.
_Avoid_: Shift (that is the hours), day plan

**Plan day**:
A full re-optimization of one date across all technicians. It replaces the existing plan, and is refused once any stop that day has started.
_Avoid_: Optimize, re-run, batch

**Find a slot**:
Placing one unassigned job into existing routes without reordering the stops already there, and offering the best positions.
_Avoid_: Insert (as a user-facing word), auto-assign

**Detour**:
The extra driving time a technician takes on when a job is added to their route.
_Avoid_: Delay, overhead

**Unassigned reason**:
The plain-language explanation of why no technician could take a job, from Plan day or Find a slot.
_Avoid_: Error, failure

## Day operations

**Unassign**:
Return a job that has not started to the unassigned pool. The job stays alive and can be placed again.
_Avoid_: Remove, drop

**Cancel**:
End a job for good. A cancelled job never returns to the pool.
_Avoid_: Delete, void

**Note**:
The dispatcher's free text about one job. It stays with the job whoever does it.
_Avoid_: Comment, remark

**Day report**:
An optional end-of-day summary for one work day.
_Avoid_: Log, journal

**Incident**:
Something from a work day to review later, optionally tied to a job. It is open until marked reviewed.
_Avoid_: Issue, problem, ticket
