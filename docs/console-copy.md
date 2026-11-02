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
| Active / Inactive | פעיל / לא פעיל | |
| Deactivate | השבתה | Verb forms "להשבית", "להשבית את {name}" |
| Reactivate | הפעלה מחדש | |
| Review step | סקירה | Button: "המשך לסקירה" |
| Change log | יומן שינויים | Shown as "שינויים אחרונים" |

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
| `incidents.list.mark` | סימון כנבדק: {text} | Mark reviewed: {text} |
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
| `drawer.stops` | עצירות | Stops |
| `note.has` | יש הערה | Has a note |
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
| `cancelled.at` | בוטלה ב־{time} | Cancelled at {time} |
| `cancelled.arrived` | הגעה {time} | Arrived {time} |

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
| `modal.x` | סגירת החלון | Close dialog |
| `validation.title` | יש להזין כותרת. | Enter a title. |
| `validation.address` | יש להזין כתובת. | Enter an address. |
| `validation.location` | יש להגדיר מיקום במפה. | Set a location on the map. |
| `validation.skills` | יש לבחור לפחות כישור אחד. | Pick at least one skill. |
| `validation.duration` | משך השירות חייב להיות גדול מאפס. | Service time must be more than 0. |
| `validation.window` | סיום החלון חייב להיות אחרי ההתחלה. | The window must end after it starts. |
| `create.failed` | יצירת העבודה נכשלה. {message} | Couldn't create the job. {message} |

## Job edit

| Key | Hebrew | English |
|---|---|---|
| `job.edit` | עריכת עבודה | Edit job |
| `job.edit.title` | עריכת "{title}" | Edit "{title}" |
| `job.edit.save` | שמירה | Save |
| `job.edit.saved` | העבודה עודכנה. | Job updated. |
| `job.edit.saved.unassigned` | העבודה עודכנה. אפשר לחפש לה חלון. | Job updated. You can find it a slot. |
| `job.edit.routed` | העבודה משובצת במסלול. כותרת וכתובת ניתנות לעריכה. כדי לשנות מיקום, כישורים, משך או חלון זמן, קודם יש להסיר את השיבוץ. | This job is on a route. Title and address can be edited. To change location, skills, duration or time window, unassign it first. |
| `job.edit.locked` | אי אפשר לערוך עבודה שהושלמה או בוטלה | A done or cancelled job can't be edited. |
| `job.edit.conflict` | העבודה שובצה במסלול בינתיים. יש להסיר את השיבוץ כדי לשנות שדות תזמון. | The job was placed on a route in the meantime. Unassign it to change scheduling fields. |
| `coords` | {lat}, {lon} | {lat}, {lon} |

Title, address and priority are free on any job that is not done or cancelled. Location, skills, duration and window need a job with no route stop; on a routed job those fields are disabled with `job.edit.routed` as the hint. The location picker reuses the New job modal's `location.*` keys.

## Technician management

| Key | Hebrew | English |
|---|---|---|
| `tech.add` | הוספת טכנאי | Add technician |
| `tech.add.disabled` | 8 טכנאים פעילים. יש להשבית אחד קודם. | 8 technicians are active. Deactivate one first. |
| `tech.edit` | עריכה | Edit |
| `tech.edit.title` | עריכת {name} | Edit {name} |
| `tech.new.title` | טכנאי חדש | New technician |
| `tech.field.name` | שם | Name |
| `tech.field.home` | מיקום הבית | Home location |
| `tech.field.home.hint` | יש ללחוץ על המפה כדי לבחור את מיקום הבית. | Click the map to pick the home location. |
| `tech.field.shift` | משמרת | Shift |
| `tech.field.skills` | כישורים | Skills |
| `tech.color.note` | הצבע נקבע אוטומטית. | The color is assigned automatically. |
| `tech.toReview` | המשך לסקירה | Continue to review |
| `tech.save` | שמירה | Save |
| `tech.saved.name` | השם עודכן. | Name updated. |
| `tech.inactive.title` | לא פעילים | Inactive |
| `tech.inactive.badge` | לא פעיל | Inactive |
| `tech.inactive.editHint` | אפשר לערוך רק את השם. כדי לשנות בית, משמרת או כישורים, קודם יש להפעיל מחדש. | Only the name can be edited. To change home, shift or skills, reactivate first. |
| `tech.deactivate` | השבתה | Deactivate |
| `tech.reactivate` | הפעלה מחדש | Reactivate |
| `tech.reactivate.disabled` | 8 טכנאים פעילים. יש להשבית אחד קודם. | 8 technicians are active. Deactivate one first. |

An inactive technician renders in history in neutral grey with initials instead of a route color.

## Technician review step

| Key | Hebrew | English |
|---|---|---|
| `review.title.new` | סקירה לפני יצירת הטכנאי | Review before creating the technician |
| `review.title.edit` | סקירה לפני שמירת השינויים | Review before saving changes |
| `review.title.reactivate` | סקירה לפני הפעלה מחדש | Review before reactivating |
| `review.change` | {field}: {before} ← {after} | {field}: {before} → {after} |
| `review.color` | צבע המסלול | Route color |
| `review.back` | חזרה לעריכה | Back to edit |
| `review.confirm.new` | יצירת טכנאי | Create technician |
| `review.confirm.edit` | שמירת שינויים | Save changes |
| `review.confirm.reactivate` | הפעלה מחדש | Reactivate |
| `review.warnings` | לתשומת לב | Worth a look |
| `review.stale` | הנתונים השתנו מאז הסקירה. יש לסקור שוב. | The data changed since this review. Review again. |

`review.color` is shown as a color swatch beside the label, never as a number. On create and on reactivation the swatch is the slot the technician will get; on an edit it is the current color. Coordinates in the summary use `coords` ("lat, lon"). The review step shows only what changed on an edit. A name-only change skips it.

### Warnings

All are non-blocking and need no acknowledgement. Thresholds are named constants in one place.

| Key | Hebrew | English |
|---|---|---|
| `warn.farHome` | הבית רחוק יותר מ־{km} ק״מ מהטכנאי הפעיל הקרוב ביותר. | Home is more than {km} km from the nearest active technician. |
| `warn.shortShift` | המשמרת קצרה מ־{h} שעות. | The shift is shorter than {h} hours. |
| `warn.longShift` | המשמרת ארוכה מ־{h} שעות. | The shift is longer than {h} hours. |
| `warn.noSkills` | לא נבחרו כישורים, ולכן לא תשובץ עבודה שדורשת כישור. | No skills selected, so no job that needs a skill will be assigned. |
| `warn.duplicateName` | כבר יש טכנאי בשם הזה. | A technician with this name already exists. |
| `warn.duplicateName.inactive` | יש טכנאי לא פעיל בשם הזה. אולי עדיף להפעיל מחדש את הקיים? | An inactive technician has this name. Reactivate the existing one instead? |

## Deactivation and reactivation

No message with `{name}` uses a verb that agrees with the name (see the gender rule in `DESIGN.md`). The wording is built around the action instead.

| Key | Hebrew | English |
|---|---|---|
| `deactivate.title` | להשבית את {name}? | Deactivate {name}? |
| `deactivate.body` | טכנאי מושבת לא נכלל בתכנון ובחיפוש חלון. ההיסטוריה של {name} נשמרת. אפשר להפעיל מחדש בכל עת, והצבע עשוי להשתנות. | A deactivated technician is left out of planning and Find a slot. {name}'s history is kept. You can reactivate at any time; the color may change. |
| `deactivate.ok` | השבתה | Deactivate |
| `deactivate.keep` | להשאיר פעיל | Keep active |
| `deactivate.blocked.one` | ל־{name} יש עצירות שטרם הושלמו בתאריך {dates}. יש להסיר את השיבוץ שלהן קודם. | {name} has unfinished stops on {dates}. Unassign them first. |
| `deactivate.blocked.two` | ל־{name} יש עצירות שטרם הושלמו בשני התאריכים {dates}. יש להסיר את השיבוץ שלהן קודם. | {name} has unfinished stops on both dates: {dates}. Unassign them first. |
| `deactivate.blocked.other` | ל־{name} יש עצירות שטרם הושלמו בתאריכים {dates}. יש להסיר את השיבוץ שלהן קודם. | {name} has unfinished stops on these dates: {dates}. Unassign them first. |
| `deactivate.blocked.open` | פתיחת {date} | Open {date} |
| `deactivate.done` | השבתה בוצעה: {name} | Deactivated: {name} |
| `reactivate.done` | הפעלה מחדש בוצעה: {name} | Reactivated: {name} |
| `tech.created` | הוספה בוצעה: {name} | Added: {name} |
| `tech.updated` | הפרטים של {name} עודכנו. | {name}'s details were updated. |

`{dates}` lists every date that has unfinished stops, not just one. Each date is formatted by the existing date helper and links to that day. The plural key is chosen with `pluralKey`.

## Change log

Rows store the technician's name as it was at the time, so a later rename does not rewrite history.

| Key | Hebrew | English |
|---|---|---|
| `changes.title` | שינויים אחרונים | Recent changes |
| `changes.empty` | עדיין אין שינויים. | No changes yet. |
| `changes.created` | הוספה: {name} | Added: {name} |
| `changes.updated` | הפרטים של {name} עודכנו: {fields} | {name}'s details were updated: {fields} |
| `changes.deactivated` | השבתה: {name} | Deactivated: {name} |
| `changes.reactivated` | הפעלה מחדש: {name} | Reactivated: {name} |
| `changes.deleted` | מחיקה: {name} | Deleted: {name} |
| `changes.history` | היסטוריית שינויים | Change history |

## Errors from the activity rules

| Key | Hebrew | English |
|---|---|---|
| `error.techInactive` | הטכנאי הושבת בינתיים. לא נשמר דבר. | The technician was deactivated in the meantime. Nothing was saved. |
| `error.activeCap` | כבר יש 8 טכנאים פעילים. | 8 technicians are already active. |

`error.techInactive` is shown when Find a slot or Plan day is refused with 409 because a technician it would write to is no longer active. The options then refresh, as with `slot.stale`.

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
| `map.label` | מפה | Map |
| `map.key` | מקרא | Map key |
| `map.key.color` | הצבע מציין את הטכנאי | Color shows the technician |
| `map.key.ring` | הסימן על הנקודה מציין מצב | The mark on a dot shows status |
| `map.home` | הבית של {name} | {name}'s home |
| `map.stop` | עצירה {n}: {title} | Stop {n}: {title} |

## Server messages

The API's own messages are English only. Known ones map to keys: "Only the first not-done stop of a route can be started" is `blocked.order`, "Technician already has a stop in progress" is `blocked.busy`, "Route changed concurrently; retry", "Route changed since the suggestion" and "Concurrent change; retry" (a deadlock the API turned into a 409) are `error.stale`, and "A stop that day has already started" is `plan.disabled`. A 409 about an inactive technician is `error.techInactive`; one saying the technician changed since the data was read (a batch or insert racing a technician edit) is `review.stale` (`slot.stale` when choosing a slot); one about the 8-active cap is `error.activeCap`; the job guard's "Job is on a route" is `job.edit.conflict`. Server text is never shown. Any other refusal gets a generic text by HTTP status, after the localized lead sentence: `error.http.400` (invalid request), `error.http.404` (not found), `error.http.409` (the data changed or the action is not possible), `error.http.503` (routing or planning service unavailable), `error.http.500` (any other server error). All of it lives in `apps/web/src/serverError.ts`.

| Key | עברית | English |
|---|---|---|
| `error.techHasStops` | לטכנאי יש עצירות במסלול. יש לבטל את השיבוץ של העבודות או לבטל אותן קודם. | The technician has stops on a route. Unassign or cancel those jobs first. |
| `error.unreachable` | אין דרך לחלק מהמיקומים. | Some locations cannot be reached by road. |
| `error.http.400` | הבקשה לא תקינה. | The request was not valid. |
| `error.http.404` | הפריט לא נמצא. | It was not found. |
| `error.http.409` | הנתונים השתנו או שהפעולה לא אפשרית כרגע. | The data changed or the action is not possible right now. |
| `error.http.503` | שירות הניתוב או התכנון לא זמין. | The routing or planning service is unavailable. |
| `error.http.500` | אירעה שגיאה בשרת. יש לנסות שוב. | Server error. Try again. |

## Keys added by the foundation ticket

Strings of the existing screen that the deck above did not cover: `date.label`, `lang.toggle.label` (accessible name of the toggle, written in the language it switches to), `tech.noSkills`, `job.ref` (a job shown as "Job {id}" until jobs have titles), `slot.close`, `map.legend.home`, `map.needs`, `duration.min`, `stops.one`/`stops.two`/`stops.other`. Source of truth is `apps/web/src/i18n.ts`.

## Keys added by the add-technician ticket

Not in the deck above, needed by the add form: `tech.field.shift.from` (Shift start / תחילת המשמרת), `tech.field.shift.to` (Shift end / סיום המשמרת), `validation.name` (Enter a name. / יש להזין שם.), `validation.shift` (The shift must end after it starts. / סיום המשמרת חייב להיות אחרי ההתחלה.). Source of truth is `apps/web/src/i18n.ts`.
