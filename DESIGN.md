# Dispatch console design

Adapted from the Vercel DESIGN.md in VoltAgent/awesome-design-md. Kept: the near-white canvas, hairline borders, 4px spacing unit, tight 6-8px corners, weights 400/500/600 and the "one filled button" idea. Replaced: its proprietary fonts (Geist for Latin, Heebo for Hebrew), its cool greys (warm stone greys instead), and everything marketing (gradients, mono eyebrows, hero bands). No brand names, logos or slogans carried over.

Status: base decisions plus the type scale, route palette, status colors, spacing and basemap from the design-system step. Light theme only. All colors are semantic CSS variables so a dark set can be added later without touching components.

## Principles

- Color carries ownership and status, nothing else. The chrome is neutral so each technician's color is the loudest thing on the map.
- Show information when it is relevant. Collapsed by default, expanded on demand.
- One filled primary action per view: "Plan day" in the top bar. Every repeated per-row action ("Start", "Find a slot") is outlined.
- A control that cannot run stays visible, disabled, with the reason beside it. It is never hidden.
- Color is never the only signal: pair it with a ring, glyph, number or text.

## Colors (semantic tokens, light)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#fafaf9` | Page and map-panel background |
| `--surface` | `#ffffff` | Rows, drawer, modal, top bar |
| `--surface-2` | `#f5f5f4` | Selected row, inset regions, hover |
| `--hairline` | `#e7e5e4` | All 1px borders and dividers |
| `--ink` | `#1c1917` | Headings, primary text, the one filled button |
| `--ink-2` | `#57534e` | Secondary text |
| `--ink-3` | `#6f6963` | Quiet text. 5.2:1 on `--bg`, 5.4:1 on `--surface`, 5.0:1 on `--surface-2` |
| `--control-border` | `#8a837d` | Borders of inputs, checkboxes and buttons (3.7:1 on white, 3.3:1 on `--control-bg`). `--hairline` is decoration only |
| `--control-bg` | `#f1efed` | Fill of every standalone button. `--ink-3` text on it is 4.7:1 |
| `--control-bg-hover` | `#e7e5e4` | Button hover (13.9:1 for ink) |
| `--control-bg-active` | `#d6d3d1` | Button pressed (11.7:1 for ink) |
| `--done-ink` / `--done-bg` / `--done-line` | `#166534` / `#f0fdf4` / `#4d9a68` | Done status pill (text 6.8:1, border 3.3:1) |
| `--progress-ink` / `--progress-bg` / `--progress-line` | `#1e40af` / `#eff6ff` / `#5b83d6` | In-progress status pill (text 8.0:1, border 3.4:1) |
| `--focus` | `#1c1917` | Focus ring: 2px ink with a 2px offset. Not blue, because blue is a route color |
| `--attention` | `#b45309` | Amber: needs attention (unassigned, open incident, late) |
| `--attention-ink` | `#92400e` | Text on `--attention-bg` (6.8:1) |
| `--attention-bg` | `#fffbeb` | Attention banners and badges |
| `--danger` | `#b91c1c` | Red: destructive or failed (6.5:1 on white) |
| `--danger-ink` | `#991b1b` | Text on `--danger-bg` (7.6:1) |
| `--danger-bg` | `#fef2f2` | Error and destructive-confirm backgrounds |

Amber and red are reserved for attention and status. Both pair with an icon and a label, never color alone. Their nearest route color is 19.8 (amber) and 16.4 (red) apart in OKLab, so neither reads as a technician.

### Route palette (technician colors)

Eight fixed slots, stored as `technicians.color` (1 to 8). The order never changes and is never cycled. Tokens `--route-1` to `--route-8`:

| Slot | Hex | Hue |
|---|---|---|
| 1 | `#ac47c2` | orchid |
| 2 | `#416407` | olive green |
| 3 | `#6c2cb4` | violet |
| 4 | `#1479b0` | cyan blue |
| 5 | `#99007a` | magenta |
| 6 | `#5d67ee` | indigo |
| 7 | `#06825d` | teal green |
| 8 | `#0256a9` | blue |

The hues deliberately skip roughly 0 to 100 degrees (red, orange, amber, yellow), which belong to status. Validated with the dataviz palette validator on the light surface:
- Adjacent pairs: worst color-blind separation 9.5 (target 8), worst normal-vision separation 19.5 (floor 15).
- Contrast: at least 3.5:1 against the muted basemap land and at least 4.5:1 for white text on a route fill (stop numbers). Against the darkest 5% of basemap pixels some slots drop to about 2.1 to 2.4, which is why every route line has a white casing (below).
- All pairs: eight colors cannot all be pairwise distinct (worst pair about 10 against the 15 floor). So color is never the only carrier of identity. Each home marker shows the technician's initial, the selected route shows numbered stops, tooltips carry the name, and selecting one fades the rest to 45%.
- A ninth technician reuses the least-used slot, lowest slot first on a tie. Colors only ever mark a technician: no status, no chart series.
- Route color is never used for text on a light surface. Text stays in ink tokens beside a colored mark. White text on a route fill is the one exception (drawer header band, stop badges): every slot passes 4.5:1 for it.
- Where the color shows in the panels: the selected technician's row (stripe and tint), the drawer header band, and the numbered stop badges in the drawer. Nowhere else, so the color keeps meaning one technician.
- Status uses its own pills, never a route color: done is green, in progress is blue, assigned is neutral, unassigned is amber. Amber and red stay reserved for attention.

### Basemap

OpenStreetMap tiles stay, muted with a CSS filter on `.leaflet-tile-pane` only: `grayscale(1) contrast(0.72) brightness(1.2)`, a lighter wash than the first pass so the route colors carry more of the picture. Never on the overlay, marker or any other pane, or the validated route and status colors would turn grey. No new tile provider. The filter maps land (about 93% grey in the tiles) to 97%, hill shading (70%) to 77% and map text (35%) to 47%. Against filtered land the weakest route color is 4.25:1 (4.0:1 before), against hill shading 2.6:1, which the white casing covers. Route lines are 3.5px, drawn over a 7px white casing. Thin default routes are 2px over a 5px casing. Home markers and stop numbers get a 2px white ring.

## Typography

- Families: Geist for Latin and digits, Heebo for Hebrew, with a system fallback. Geist and Heebo share digit height and x-height within 1% at the same size, so mixed lines such as "סיום 08:41" hold together.
- Weights: 400 body, 500 controls and labels, 600 headings and names. Never 700 or heavier.
- Tracking: about -0.011em on body text. No tracking on Hebrew-only runs.
- Numbers: `font-variant-numeric: tabular-nums` on every time, count and duration.
- Times, ranges and ids sit in an LTR isolate (`<bdi dir="ltr">` or `unicode-bidi: isolate; direction: ltr`) so "08:00–16:00" reads left to right inside Hebrew text. Without it, a range reverses and a trailing comma moves to the line start.
- No all-caps labels. Sentence case everywhere.
- Scale (size / line height, weight, tracking). Body is 14px because the console is dense. Hebrew keeps zero tracking (`:lang(he)`).

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `--text-xs` | 12 / 16 | 400 | 0 | Meta, chips, "Updated 08:55" |
| `--text-sm` | 13 / 18 | 400, 500 | 0 | Secondary row text, skills line, address |
| `--text-md` | 14 / 20 | 400, 500, 600 | -0.006em | Body, row titles, controls |
| `--text-lg` | 16 / 24 | 600 | -0.011em | Drawer title, KPI value, section heading |
| `--text-xl` | 20 / 28 | 600 | -0.017em | Modal title, empty-state title |

- Line length stays under 70 characters in notes and reports.

## Layout and spacing

- Base unit 4px. Spacing steps: 4, 8, 12, 16, 24, 32, 40, 48.
- Top bar across the full width. Left panel about 320px with a segmented switch at its top: "Technicians | Unassigned (n)". One list shows at a time and gets the full panel height, with no nested scrolling. Map fills the rest. The work-day drawer overlays the end side. New job is a modal.
- Switching rules for the left panel:
  - The default tab is Unassigned when n is above 0 and nothing is planned yet for the date (no route has a stop), otherwise Technicians.
  - Clicking the Unassigned KPI, an unassigned pin on the map, or "Create and find a slot" switches to Unassigned. The new job's row opens at the top of the list.
  - Clicking a technician on the map switches to Technicians.
  - Switching is instant: no animation on the list content.
- Rows in the Unassigned list are collapsed by default: title, reason and "Find a slot" on two lines. Expanding shows address, window and skills. Opening options scrolls the row to the top of the list.
- Sizes: top bar 52px, left panel 320px, drawer 400px, modal 480px, controls 28px (dense) or 32px (forms), icon button 28px, stop number 26px.
- Minimum supported width 1024px. Below about 760px the panels stack.
- Use logical properties (`inline-start`, `inline-end`, `padding-inline`, `margin-inline`), never left and right. Panels and the drawer mirror under RTL. The map itself never mirrors. Its zoom control and the Map key sit on the inline-start side, because the drawer owns the inline-end side. Selecting a technician fits the map to their route, never closer than zoom 13, with the home marker in view.

## Shape and depth

- Radius 6px for buttons, chips and inputs. 8px for rows, the drawer and the modal. A full circle for swatches and stop numbers.
- Depth comes from hairlines and the surface step, not shadows. The drawer and the modal use one soft shadow: `0 0 0 1px var(--hairline), 0 12px 32px rgb(28 25 23 / 0.10)`.
- Layers (z-index): map 0, map controls 5, panels and top bar 10, drawer 20, modal 30, toast 40. No other values.

## Components

- Buttons: filled (`--ink` on white text, one per view), standard (`--control-bg` fill with a `--control-border` border), icon button (28px square with the same fill and border, e.g. the modal ×). Height is 28px everywhere (32px in forms), with no smaller size. Hover moves the fill to `--control-bg-hover`, pressed to `--control-bg-active` with the 0.97 scale. A disabled button drops to `--bg` with a hairline. Row-like buttons (tabs, list rows, timeline rows, section toggles, menu items) have no fill or border: the row is the affordance, and hover uses `--surface-2`. Focus shows a 2px `--focus` ring. The drawer heading takes focus programmatically and shows no ring; the drawer is announced by its label.
- Stop rows keep a fixed order: time and title, then the note icon, then the status. "Add incident" is a full-width button under its input.
- Rows: white surface, 1px hairline, 8px radius, 9-12px padding. The selected technician row, while their drawer is open, has a 4px inline-start stripe in the technician's color and a tint of 14% of that color over white. Every row reserves the 4px transparent stripe, so selecting moves nothing. Muted text inside the tinted row uses `--ink-2` (4.5:1 or more on every tint).
- Drawer header: a full-width band in the technician's color with the name and the Close button in white (the button is a translucent white fill with a white border).
- Stop badge: a 22px circle in the owner's color with the stop's number in white, before the time in each drawer row. It repeats the number on the map pin and is hidden from assistive technology.
- Status pill: 12px text, 999px radius, a glyph plus the word. Done is green, in progress is blue, assigned is neutral (`--surface-2`), unassigned is amber.
- New-job modal: anchored 48px below the top edge, never vertically centered, so its height changing never moves the title. Every field reserves one line under it for its validation message. A × icon button sits in the top inline-end corner (top-left in RTL) next to the title, and "Close" stays at the bottom. Both dismiss the same way.
- Map stop number: a 26px circle filled with the owner's color. A done stop is an outlined circle with a check.
- Chips: 12px text, `--surface-2`, hairline, 6px radius. Skills only.
- Inline notes: a quiet block under the stop with the text and an "Updated 08:55" line. A collapsed stop with a note shows a small note glyph.
- Empty, loading and error states: skeleton rows on first load, a thin progress line on reloads, per-region errors with Retry, action errors inline at the control that failed.

## Motion

Motion answers an action or shows a state change. It is never decoration, and the console is used all day, so most things do not animate.

Tokens:

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--dur-press` | 120ms |
| `--dur-fast` | 150ms |
| `--dur-pop` | 180ms |
| `--dur-panel` | 220ms |

Rules:
- Animate only `transform` and `opacity`, and name the properties. Never `transition: all`, never `ease-in`, never a UI animation over 250ms. Exits are faster than entrances (at most 140ms).
- Nothing starts from `scale(0)`. Popovers scale from 0.97 with a fade, from their trigger. Modals scale from 0.96 and stay anchored near the top.
- Use CSS transitions, not keyframes, for anything that can be triggered rapidly, so it can be interrupted.
- Hover effects are gated behind `@media (hover: hover) and (pointer: fine)`.
- Keyboard-initiated actions do not animate. A drawer opened with Enter or Space appears instantly, and Escape closes it instantly. Keyboard mode zeroes the animation duration (`animation-duration: 0s`), never `animation: none`: removing the name and restoring it on the next pointer event replays the entrance of every open dialog, which looked like the modal jumping while the user typed and ticked.

By element:

| Element | Motion |
|---|---|
| Buttons and rows | Background and border color 120ms `--ease-out`. Buttons scale to 0.97 on press. |
| Left-panel switch and date change | None. Content swaps instantly and the progress line shows loading. |
| Work-day drawer (pointer) | Opens with a 24px slide from the inline-end side plus fade, `--dur-panel` `--ease-drawer`. Closes in 140ms `--ease-out`. |
| New-job modal | Scrim fades 150ms. Dialog scales 0.96 to 1 with a fade, `--dur-pop`. Exit 120ms. |
| Map-pick | The modal collapses to the pick bar with a 120ms fade. The crosshair appears instantly. |
| Overflow menu | Scales from 0.97 with a fade at its trigger, 125ms. Exit instant. |
| Stop row and options expand | Content fades in over 120ms. Height is not animated. |
| Fade others on select | Opacity of other routes and markers goes to 45% over `--dur-fast`. Stroke width changes instantly. |
| "Find a slot" preview | Dashed lines appear instantly on hover or focus and stay until another option is hovered, so moving between options does not flicker. |
| Linked highlight | The marker or row pulses once (scale 1.35, 600ms `--ease-out`) when its pair is clicked. |
| In-progress ring | Opacity pulse 1.6s `--ease-in-out`, a state indicator. Static under reduced motion. |
| Toast | Enters with 8px rise plus fade in `--dur-panel`, exits in 140ms. Stays 3.5s. The timer pauses on hover and while the tab is hidden. |
| Reload progress line | Grows across the top over 1s `--ease-out`. |
| Map tooltips | 125ms. After one is open, the next opens with no delay and no animation. |

Interaction details:
- Save feedback: "Saving" appears only if a save takes longer than 400ms, so quick saves do not flicker. "Saved" stays for 2s.
- Status actions (Start, Finish) are not optimistic, because the server can refuse them. The clicked button shows a busy state, and a refusal appears inline at the row.
- Touch: hover previews are replaced by tap. The first tap on an option previews it, a second tap on "Assign here" commits.
- Under `prefers-reduced-motion`, keep opacity fades and remove all movement and scaling.

## Copy

All strings and their keys are in `docs/console-copy.md`.

- Voice: plain, neutral and short, from the dispatcher's side of the screen. No exclamation marks, no apologies, no "oops". Errors say what happened and what to do next.
- One term per thing, taken from `GLOSSARY.md`. The Hebrew vocabulary table in `docs/console-copy.md` is the reference.
- Buttons name the outcome. English buttons start with a verb ("Plan day", "Find a slot"). The same word runs through the whole flow ("Assign here", then "Job assigned").
- Hebrew grammar: never use gendered imperatives ("תכנן", "מצא", "התחל"). Buttons and labels are action nouns or infinitives ("תכנון יום", "חיפוש חלון", "התחלה", "סיום", "הסרת שיבוץ"). Instructions use the impersonal "יש ל…" ("יש ללחוץ על המפה"). Questions use the infinitive ("לבטל את העבודה?"). No slash forms such as טכנאי/ת, and groups use the generic plural (טכנאים).
- "ביטול" is reserved for cancelling a job. A dialog is dismissed with "סגירה" or with a phrase naming what stays ("השארת העבודה").
- Confirmations name the object and the consequence, and their buttons repeat the action ("ביטול עבודה" / "השארת העבודה").
- Counts: prefer "label: number". Where a count sits inside a sentence, use `Intl.PluralRules` with one, two and other forms.
- Dates use `Intl.DateTimeFormat` for the active language. Times and ranges sit in an LTR isolate.

## Language and accessibility

Standard: WCAG 2.1 AA, plus the 2.2 target-size rule.

- Language: Hebrew is the default, with an English toggle in the top bar. Strings live in two dictionaries, and the English one is typed as the Hebrew one so a missing key fails typecheck. Western digits and 24-hour times in both languages.
- Contrast: all text pairs in the token tables pass 4.5:1. Borders that identify a control use `--control-border` (3:1 or more). Hairlines separate only. White text on every route fill passes 4.5:1. Focus is a 2px ink ring with a 2px offset (16:1).
- Target size: 28px minimum for dense controls. Under `@media (pointer: coarse)` buttons and rows grow to 44px. Map markers get a transparent hit area of at least 24px.
- Status is never color alone: a ring or glyph plus a text label. Amber is only ever a dashed hollow ring, a badge with a number, or text with an icon, never a filled dot or a line. Under red-green color blindness amber sits close to the olive route (slot 2), and the dashed shape keeps them apart. Red always comes with an icon and a label.
- Keyboard order follows the DOM and the visual order in both directions: top bar, left panel, map, drawer. The left-panel switch is a tab list: arrow keys move between the two tabs (mirrored in RTL), and the active tab controls the list below it.
- Focus management:
  - Opening the drawer moves focus to its heading, and closing it returns focus to the technician row that opened it.
  - The modal is `role="dialog"` with `aria-modal`, traps focus (the × is first in tab order), starts on the Title field and returns focus to "Add job".
  - Map-pick collapses the modal to a bar and moves focus to it. Escape returns to the modal with focus on "Set location on map".
  - Escape closes only the topmost layer.
- Map parity: everything on the map has a list equivalent (technician rows, drawer stops, the unassigned queue), so the map is never the only way in. The map container is labeled "Map", with keyboard panning and zoom on. Choosing a job location works by click, and also by a fixed center crosshair with a "Use this point" button, so keyboard-only and touch users can pan and confirm.
- Screen readers:
  - Landmarks: header, main, the left panel as complementary, the drawer as complementary and labeled with the technician's name.
  - A polite live region announces selection ("Dana Levi, 6 stops") and plan results.
  - Errors use `role="alert"` at the control that failed. Regions set `aria-busy` while loading.
  - Progress bars are `role="progressbar"` with text such as "4 of 6 done".
  - Stops are an ordered list. A status glyph has a text alternative, and the note indicator is labeled "Has a note".
- Right-to-left:
  - `<html lang dir>` flips with the language.
  - Title, address, note, report and incident text use `dir="auto"`, since users type in either language.
  - Direction-implying icons mirror (chevrons, back arrows, progress fill). Check, note and pin do not.
  - The map never mirrors. Times and ranges sit in an LTR isolate.
  - Hebrew body line height is at least 1.45.
- Reflow: at 200% zoom the viewport is about 640 CSS px, below the 760px stack breakpoint, so the stacked layout must be fully usable. The drawer becomes a full-width bottom sheet and the modal becomes full-screen. Only the map may scroll in two dimensions.
- Motion: respect `prefers-reduced-motion`. The pulsing in-progress ring becomes a static ring. Nothing flashes.
