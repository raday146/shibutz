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
| `--ink-3` | `#78716c` | Quiet text. Passes 4.5:1 only on `--bg` and `--surface`; on `--surface-2` use `--ink-2` |
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
- All pairs: eight colors cannot all be pairwise distinct (worst pair about 10 against the 15 floor). So color is never the only carrier of identity. Each home marker shows the technician's initial, the selected route shows numbered stops, tooltips carry the name, and selecting one fades the rest.
- A ninth technician reuses the least-used slot, lowest slot first on a tie. Colors only ever mark a technician: no status, no chart series.
- Route color is never used for text. Text stays in ink tokens beside a colored mark.

### Basemap

OpenStreetMap tiles stay, muted with a CSS filter on `.leaflet-tile-pane` only: `grayscale(1) contrast(0.8) brightness(1.12)`. Never on the overlay, marker or any other pane, or the validated route and status colors would turn grey. No new tile provider. Median basemap luminance after the filter is about 0.72, so land reads as light grey. Route lines are 3.5px, drawn over a 7px white casing. Thin default routes are 2px over a 5px casing. Home markers and stop numbers get a 2px white ring.

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
- Top bar across the full width. Left panel about 320px: Unassigned (when not empty) above Technicians. Map fills the rest. Work-day drawer overlays the end side. New job is a modal.
- Sizes: top bar 52px, left panel 320px, drawer 400px, modal 480px, controls 28px (dense) or 32px (forms), icon button 28px, stop number 26px.
- Minimum supported width 1024px. Below about 760px the panels stack.
- Use logical properties (`inline-start`, `inline-end`, `padding-inline`, `margin-inline`), never left and right. Panels and the drawer mirror under RTL. The map itself never mirrors and its controls sit at the inline-end corner.

## Shape and depth

- Radius 6px for buttons, chips and inputs. 8px for rows, the drawer and the modal. A full circle for swatches and stop numbers.
- Depth comes from hairlines and the surface step, not shadows. The drawer and the modal use one soft shadow: `0 0 0 1px var(--hairline), 0 12px 32px rgb(28 25 23 / 0.10)`.
- Layers (z-index): map 0, map controls 5, panels and top bar 10, drawer 20, modal 30, toast 40. No other values.

## Components

- Buttons: filled (`--ink` on white text), outlined (hairline border, transparent), icon button (28px, no border until hover). Height 28-32px. Hover shifts the background one step. Focus shows a 2px `--focus` ring.
- Rows: white surface, 1px hairline, 8px radius, 9-12px padding. Selected rows use `--surface-2` and a 3px inline-start bar in the technician's color.
- Stop number: a 26px circle filled with the owner's color. A done stop is an outlined circle with a check.
- Chips: 12px text, `--surface-2`, hairline, 6px radius. Skills only.
- Inline notes: a quiet block under the stop with the text and an "Updated 08:55" line. A collapsed stop with a note shows a small note glyph.
- Empty, loading and error states: skeleton rows on first load, a thin progress line on reloads, per-region errors with Retry, action errors inline at the control that failed.

## Motion

Short, answering a user action only: 120ms background and color transitions, panel open and close. No entrance animations. Respect `prefers-reduced-motion`.

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

- Hebrew is the default, with an English toggle in the top bar. Strings live in two dictionaries, and the English one is typed as the Hebrew one so a missing key fails typecheck.
- Text and control contrast meets WCAG AA. Keyboard reaches every control. Escape closes the topmost layer: map-pick, then modal, then drawer.
- Western digits and 24-hour times in both languages.
