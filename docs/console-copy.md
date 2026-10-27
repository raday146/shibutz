# Console copy

Every string in the dispatch console, in Hebrew and English. The keys here become the dictionary keys; the English dictionary is typed as the Hebrew one, so a missing key fails typecheck. Voice and grammar rules are in `DESIGN.md`. Terms follow `GLOSSARY.md`.

## Vocabulary

| English | Hebrew | Notes |
|---|---|---|
| Technician | טכנאי | Plural טכנאים is the generic plural. No slash forms. |
| Job | עבודה | Plural עבודות. Shown by its title, never by id. |
| Skill | כישור | Plural כישורים |
| Stop | עצירה | |
| Route | מסלול | |
| Work day | יום עבודה | |
| Plan day | תכנון יום | |
| Find a slot | חיפוש חלון | |
| Detour | תוספת נסיעה | Shown as added driving minutes |
| Unassigned | לא משובצת | |
| Unassign | הסרת שיבוץ | |
| Cancel (a job) | ביטול עבודה | "ביטול" is used only for this. Dialogs are dismissed with "סגירה" or "השארת …". |
| Note | הערה | |
| Day report | סיכום יום | |
| Incident | אירוע | |

## Top bar

| Key | Hebrew | English |
|---|---|---|
| `app.name` | שיבוץ | Shibutz |
| `date.prev` | היום הקודם | Previous day |
| `date.next` | היום הבא | Next day |
| `date.today` | היום | Today |
| `refresh` | רענון | Refresh |
| `kpi.assigned` | משובצות | Assigned |
| `kpi.unassigned` | לא משובצות | Unassigned |
| `kpi.done` | הושלמו | Done |
| `kpi.drive` | זמן נסיעה | Drive time |
| `plan.action` | תכנון יום | Plan day |
| `plan.busy` | התכנון מתבצע | Planning |
| `plan.disabled` | אי אפשר לתכנן מחדש, עצירה באותו יום כבר התחילה. | Can't re-plan: a stop that day has already started. |
| `plan.done` | התכנון הושלם: {assigned} שובצו, {unassigned} לא שובצו. | Plan ready: {assigned} assigned, {unassigned} unassigned. |
| `plan.confirm.title` | לתכנן מחדש את היום? | Re-plan this day? |
| `plan.confirm.body` | התכנון יחליף את המסלולים של {jobs}. ההערות נשמרות. | Planning replaces the routes of {jobs}. Notes are kept. |
| `plan.confirm.jobs` (plural) | one: עבודה משובצת אחת / two: שתי עבודות משובצות / other: {n} עבודות משובצות | one: 1 assigned job / other: {n} assigned jobs |
| `plan.confirm.ok` | תכנון מחדש | Re-plan |
| `plan.confirm.keep` | השארת התכנון הנוכחי | Keep current plan |
| `incidents.indicator` | אירועים לבדיקה | Incidents to review |
| `incidents.list.title` | אירועים לבדיקה | Incidents to review |
| `incidents.list.empty` | אין אירועים לבדיקה. | Nothing to review. |
| `lang.toggle` | EN | עב |

## Left panel

| Key | Hebrew | English |
|---|---|---|
| `techs.title` | טכנאים | Technicians |
| `tech.progress` | {done}/{total} הושלמו | {done}/{total} done |
| `tech.noStops` | אין עצירות | No stops |
| `tech.openIncidents` | אירועים פתוחים: {n} | Open incidents: {n} |
| `tech.open` (aria) | פתיחת יום העבודה של {name} | Open {name}'s work day |
| `techs.empty` | אין טכנאים להצגה. | No technicians to show. |
| `unassigned.title` | עבודות לא משובצות | Unassigned jobs |
| `unassigned.empty` | כל העבודות משובצות. | Every job is assigned. |
| `job.window` | חלון {start}–{end} | Window {start}–{end} |
| `job.noAddress` | אין כתובת | No address |
| `reason.none` | טרם שובצה. | Not placed yet. |

## Unassigned reasons

| Key (API value) | Hebrew | English |
|---|---|---|
| `reason.NO_SKILLED_TECHNICIAN` | אין טכנאי עם כל הכישורים הנדרשים. | No technician has all the required skills. |
| `reason.WINDOW_OUTSIDE_ALL_SHIFTS` | חלון הזמן של העבודה מחוץ למשמרות של כל הטכנאים. | The job's time window is outside every technician's shift. |
| `reason.UNREACHABLE` | אין דרך להגיע למיקום הזה בכביש. | There is no road route to this location. |
| `reason.NOT_FEASIBLE_IN_PLAN` | לא נמצא מקום בתכנון שעומד בכל חלונות הזמן. | No place in the plan meets every time window. |

## Find a slot

| Key | Hebrew | English |
|---|---|---|
| `slot.action` | חיפוש חלון | Find a slot |
| `slot.searching` | החיפוש מתבצע | Searching |
| `slot.title` | האפשרויות הטובות ביותר | Best options |
| `slot.detour` | תוספת נסיעה: {n} דק׳ | {n} min added driving |
| `slot.position` | אחרי {prev}, לפני {next} | After {prev}, before {next} |
| `slot.home` | הבית | home |
| `slot.eta` | הגעה {time} | Arrives {time} |
| `slot.pick` | שיבוץ כאן | Assign here |
| `slot.assigned` | העבודה שובצה אצל {name}. | Job assigned to {name}. |
| `slot.none` | אף טכנאי לא יכול לקחת את העבודה: | No technician can take this job: |
| `slot.rejection.MISSING_SKILL` | חסר כישור נדרש | Missing a required skill |
| `slot.rejection.ROUTE_ALREADY_LATE` | המסלול כבר מאחר | The route is already running late |
| `slot.rejection.NO_FEASIBLE_POSITION` | אין מיקום שעומד בחלון הזמן | No position fits the time window |
| `slot.stale` | המסלול השתנה מאז חישוב האפשרויות. האפשרויות רועננו, יש לבחור שוב. | The route changed since these options were calculated. Options are refreshed, choose again. |

## Work-day drawer

| Key | Hebrew | English |
|---|---|---|
| `drawer.close` | סגירה | Close |
| `drawer.shift` | משמרת {start}–{end} | Shift {start}–{end} |
| `drawer.finish` | סיום צפוי {time} | Expected finish {time} |
| `drawer.late` | צפוי איחור של {n} דק׳ | Running {n} min late |
| `drawer.empty` | אין עצירות ביום הזה. אפשר לתכנן את היום או לשבץ עבודה מהרשימה. | No stops this day. Plan the day or assign a job from the list. |
| `stop.drive` | {n} דק׳ נסיעה | {n} min drive |
| `stop.duration` | {n} דק׳ | {n} min |
| `stop.details` | פרטים | Details |
| `note.label` | הערה | Note |
| `note.placeholder` | הערה על העבודה | Add a note about this job |
| `note.saving` | בשמירה | Saving |
| `note.saved` | נשמר | Saved |
| `note.updated` | עודכן {time} | Updated {time} |
| `note.error` | השמירה נכשלה. הטקסט נשמר כאן, יש לנסות שוב. | Couldn't save. Your text is still here. Try again. |
| `action.start` | התחלה | Start |
| `action.finish` | סיום | Finish |
| `action.more` | פעולות נוספות | More actions |
| `action.unassign` | הסרת שיבוץ | Unassign |
| `action.cancelJob` | ביטול עבודה | Cancel job |
| `blocked.order` | אפשר להתחיל רק את העצירה הראשונה שלא הושלמה. | Only the first unfinished stop can be started. |
| `blocked.busy` | לטכנאי יש כבר עצירה בביצוע. | This technician already has a stop in progress. |
| `status.unassigned` | לא משובצת | Unassigned |
| `status.assigned` | משובצת | Assigned |
| `status.in_progress` | בביצוע | In progress |
| `status.done` | הושלמה | Done |
| `status.cancelled` | בוטלה | Cancelled |
| `cancelled.title` | בוטלו היום | Cancelled today |
| `cancelled.reason` | סיבה: {reason} | Reason: {reason} |

## Confirmations

| Key | Hebrew | English |
|---|---|---|
| `cancel.title` | לבטל את "{title}"? | Cancel "{title}"? |
| `cancel.body` | העבודה תוסר מהמסלול והעצירות הבאות יחושבו מחדש. אי אפשר להחזיר עבודה שבוטלה. | The job leaves the route and later stops are re-timed. A cancelled job can't be restored. |
| `cancel.reason` | סיבה (לא חובה) | Reason (optional) |
| `cancel.ok` | ביטול עבודה | Cancel job |
| `cancel.keep` | השארת העבודה | Keep job |
| `unassign.title` | להסיר את השיבוץ של "{title}"? | Unassign "{title}"? |
| `unassign.body` | העבודה תחזור לרשימת הלא משובצות ואפשר יהיה לשבץ אותה מחדש. | The job goes back to the unassigned list and can be placed again. |
| `unassign.ok` | הסרת שיבוץ | Unassign |
| `unassign.keep` | השארת השיבוץ | Keep assignment |

## End-of-day summary and incidents

| Key | Hebrew | English |
|---|---|---|
| `report.title` | סיכום יום | End-of-day summary |
| `report.placeholder` | סיכום קצר של היום | A short summary of the day |
| `incidents.title` | אירועים | Incidents |
| `incident.add` | הוספת אירוע | Add incident |
| `incident.placeholder` | מה קרה? | What happened? |
| `incident.link` | קישור לעבודה (לא חובה) | Linked job (optional) |
| `incident.open` | פתוח | Open |
| `incident.reviewed` | נבדק | Reviewed |
| `incident.mark` | סימון כנבדק | Mark reviewed |
| `incident.none` | לא נרשמו אירועים. | No incidents logged. |

## New job modal

| Key | Hebrew | English |
|---|---|---|
| `job.add` | הוספת עבודה | Add job |
| `job.new` | עבודה חדשה | New job |
| `field.title` | כותרת | Title |
| `field.address` | כתובת | Address |
| `field.skills` | כישורים נדרשים | Required skills |
| `field.duration` | משך השירות (בדקות) | Service time (minutes) |
| `field.window` | חלון זמן (שעון ישראל) | Time window (Israel time) |
| `location.label` | מיקום | Location |
| `location.pick` | הגדרת מיקום במפה | Set location on map |
| `location.picking` | יש ללחוץ על המפה כדי להגדיר מיקום. Esc לחזרה. | Click the map to set the location. Esc to go back. |
| `location.set` | המיקום נקבע | Location set |
| `location.change` | שינוי מיקום | Change location |
| `location.use` | שימוש בנקודה הזו | Use this point |
| `location.back` | חזרה | Back |
| `field.window.from` | תחילת החלון | Window start |
| `field.window.to` | סיום החלון | Window end |
| `modal.create` | יצירה וחיפוש חלון | Create and find a slot |
| `modal.close` | סגירה | Close |
| `validation.title` | יש להזין כותרת. | Enter a title. |
| `validation.address` | יש להזין כתובת. | Enter an address. |
| `validation.location` | יש להגדיר מיקום במפה. | Set a location on the map. |
| `validation.skills` | יש לבחור לפחות כישור אחד. | Pick at least one skill. |
| `validation.duration` | משך השירות חייב להיות גדול מאפס. | Service time must be more than 0. |
| `validation.window` | סיום החלון חייב להיות אחרי ההתחלה. | The window must end after it starts. |
| `create.failed` | יצירת העבודה נכשלה. {message} | Couldn't create the job. {message} |

## Empty, loading and error states

| Key | Hebrew | English |
|---|---|---|
| `empty.day.title` | אין עבודות בתאריך הזה | No jobs on this date |
| `empty.day.body` | אפשר להוסיף עבודה ואז לתכנן את היום. | Add a job, then plan the day. |
| `loading` | טעינה | Loading |
| `error.region` | הנתונים לא נטענו. {message} | Couldn't load this. {message} |
| `error.action` | הפעולה לא הושלמה. {message} | That didn't go through. {message} |
| `error.network` | אין חיבור לשרת. יש לבדוק את החיבור ולנסות שוב. | Can't reach the server. Check the connection and try again. |
| `error.stale` | המסלול עודכן במקום אחר. הנתונים רועננו, יש לנסות שוב. | The route was changed elsewhere. Data is refreshed, try again. |
| `error.retry` | ניסיון חוזר | Try again |

## Map

| Key | Hebrew | English |
|---|---|---|
| `map.key` | מקרא | Map key |
| `map.key.color` | הצבע מציין את הטכנאי | Color shows the technician |
| `map.key.ring` | הסימן על הנקודה מציין מצב | The mark on a dot shows status |
| `map.home` | הבית של {name} | {name}'s home |
| `map.stop` | עצירה {n}: {title} | Stop {n}: {title} |

## Server messages

The API's own messages are English only. Known ones map to keys: "Only the first not-done stop of a route can be started" is `blocked.order`, "Technician already has a stop in progress" is `blocked.busy`, "Route changed concurrently; retry" and "Route changed since the suggestion" are `error.stale`, and "A stop that day has already started" is `plan.disabled`. Any other message is shown as received, after the localized lead sentence.

## Keys added by the foundation ticket

Strings of the existing screen that the deck above did not cover: `date.label`, `lang.toggle.label` (accessible name of the toggle, written in the language it switches to), `tech.noSkills`, `job.ref` (a job shown as "Job {id}" until jobs have titles), `slot.close`, `map.legend.home`, `map.needs`, `duration.min`, `route.title`, `stops.one`/`stops.two`/`stops.other`, `stop.line`. Source of truth is `apps/web/src/i18n.ts`.
