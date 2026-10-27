# Dispatch console design

Adapted from the Vercel DESIGN.md in VoltAgent/awesome-design-md. Kept: the near-white canvas, hairline borders, 4px spacing unit, tight 6-8px corners, weights 400/500/600 and the "one filled button" idea. Replaced: its proprietary fonts (Geist for Latin, Heebo for Hebrew), its cool greys (warm stone greys instead), and everything marketing (gradients, mono eyebrows, hero bands). No brand names, logos or slogans carried over.

Status: base decisions from the console redesign spec. The type scale, route palette, status colors and basemap are settled in the design-system step and added here. Light theme only. All colors are semantic CSS variables so a dark set can be added later without touching components.

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
| `--focus` | `#0070f3` | Focus ring only |
| `--attention` | `#b45309` | Amber: needs attention (unassigned, open incident, late) |
| `--danger` | to be set | Red: destructive or failed |

Amber and red are reserved for attention and status. The technician route palette stays clear of that hue range (about 0 to 50 degrees) and of the focus blue. The palette itself, its size and its validation against the map tiles are decided in the design-system step.

## Typography

- Families: Geist for Latin and digits, Heebo for Hebrew, with a system fallback. Geist and Heebo share digit height and x-height within 1% at the same size, so mixed lines such as "סיום 08:41" hold together.
- Weights: 400 body, 500 controls and labels, 600 headings and names. Never 700 or heavier.
- Tracking: about -0.011em on body text. No tracking on Hebrew-only runs.
- Numbers: `font-variant-numeric: tabular-nums` on every time, count and duration.
- Times, ranges and ids sit in an LTR isolate (`<bdi dir="ltr">` or `unicode-bidi: isolate; direction: ltr`) so "08:00–16:00" reads left to right inside Hebrew text. Without it, a range reverses and a trailing comma moves to the line start.
- No all-caps labels. Sentence case everywhere.
- The scale is set in the design-system step.

## Layout and spacing

- Base unit 4px. Spacing steps: 4, 8, 12, 16, 24, 32, 40, 48.
- Top bar across the full width. Left panel about 320px: Unassigned (when not empty) above Technicians. Map fills the rest. Work-day drawer overlays the end side. New job is a modal.
- Minimum supported width 1024px. Below about 760px the panels stack.
- Use logical properties (`inline-start`, `inline-end`, `padding-inline`, `margin-inline`), never left and right. Panels and the drawer mirror under RTL. The map itself never mirrors and its controls sit at the inline-end corner.

## Shape and depth

- Radius 6px for buttons, chips and inputs. 8px for rows, the drawer and the modal. A full circle for swatches and stop numbers.
- Depth comes from hairlines and the surface step, not shadows. The modal and the drawer may use one soft, low-opacity shadow.

## Components

- Buttons: filled (`--ink` on white text), outlined (hairline border, transparent), icon button (28px, no border until hover). Height 28-32px. Hover shifts the background one step. Focus shows a 2px `--focus` ring.
- Rows: white surface, 1px hairline, 8px radius, 9-12px padding. Selected rows use `--surface-2` and a 3px inline-start bar in the technician's color.
- Stop number: a 26px circle filled with the owner's color. A done stop is an outlined circle with a check.
- Chips: 12px text, `--surface-2`, hairline, 6px radius. Skills only.
- Inline notes: a quiet block under the stop with the text and an "Updated 08:55" line. A collapsed stop with a note shows a small note glyph.
- Empty, loading and error states: skeleton rows on first load, a thin progress line on reloads, per-region errors with Retry, action errors inline at the control that failed.

## Motion

Short, answering a user action only: 120ms background and color transitions, panel open and close. No entrance animations. Respect `prefers-reduced-motion`.

## Language and accessibility

- Hebrew is the default, with an English toggle in the top bar. Strings live in two dictionaries, and the English one is typed as the Hebrew one so a missing key fails typecheck.
- Text and control contrast meets WCAG AA. Keyboard reaches every control. Escape closes the topmost layer: map-pick, then modal, then drawer.
- Western digits and 24-hour times in both languages.
