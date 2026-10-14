# Nothing Left — Design System

Everything here is implementable as-is with Tailwind v4 + shadcn/ui (the stack chosen
in `docs/tech-stack.md`).

| File | What |
|---|---|
| `design/DESIGN-SYSTEM.md` | This document: the rules every screen follows. |
| `design/tokens.css` | Every token, both themes. The single source of truth. |
| `design/scripts/palette.mjs` | Generates the 14-token palette from OKLCH targets. Edit this, not the hex. |

Hard product constraints this system implements come from `docs/ui-conventions.md`:
14 colour tokens shared by tags / statuses / priorities / types / charts, one-character
letter badges, `19 Sep 2026` and `8:48pm` formats, empty-value labels, dark mode as a
first-class target, keyboard shortcuts.

---

## 1. Principles

1. **Colour means deviation.** The UI chrome is monochrome (Vercel / X register): ink
   buttons, hairline borders, grey text ramps, neutral avatars and tags. Colour appears
   only where a value departs from its default state: a priority above Normal, a status
   that has started or finished, an overdue date, a quota past its threshold. The 14
   palette tokens carry that meaning; in a typical list row zero or one thing is
   coloured. One interactive accent (`--accent`) marks links, focus, selection and
   unread; it never fills a button and can be turned to grey with one variable.
2. **Dense by default.** 14px base, 36px rows, 32px controls. Teams under 20 people live
   in this tool all day; information per screen beats whitespace.
3. **Identifiers are code.** Issue keys, durations (`1h 30m`) and the query language are
   set in the monospace face. Nothing else is. That is the one typographic accent.
4. **Hairlines, not shadows.** In-page structure is 1px borders and background steps.
   Shadows exist only on popovers and dialogs, because only those float.
5. **Lists, not cards.** Repeated rows are hairline-separated rows. Cards are reserved
   for peer objects that are genuinely independent (project tiles). Stat rows are one
   ruled line of figures, never four boxes.
6. **Empty is an instruction.** Every empty section names the action that fills it.
   Nullable fields show their configured empty label in muted text, never a blank.

---

## 2. Stack decision

**Tailwind v4 + shadcn/ui, tokens as CSS custom properties.**

- `tokens.css` is copied verbatim into `apps/web/app/globals.css` (`bun run tokens:sync`
  in `apps/web`; the file is not imported across packages). Tailwind's
  `@theme inline reference` then maps utilities onto it:
  ```css
  @import "tailwindcss";
  @import "./tokens.css";
  @theme inline {
    --color-bg-app: var(--bg-app);  --color-bg-surface: var(--bg-surface);
    --color-text: var(--text);      --color-text-muted: var(--text-muted);
    --color-accent: var(--accent);  --color-border: var(--border);
    --font-sans: var(--font-sans);  --font-mono: var(--font-mono);
    --radius-sm: var(--radius-sm);  /* …and so on, one line per token */
  }
  ```
- shadcn's own variables (`--background`, `--foreground`, `--primary`, `--muted`,
  `--border`, `--ring`, `--radius`) are aliased to these tokens in `globals.css`, so the
  copied-in primitives restyle themselves with zero component edits.
- Theme switch: `data-theme="light|dark"` on `<html>`; absent means follow the OS.
  Persist the override in `localStorage`; the server renders a no-flash inline script.
- Recharts reads `--chart-1…8` via `getComputedStyle` at mount and on theme change.

### shadcn primitives to copy in (and nothing else until needed)

`button`, `input`, `textarea`, `select`, `checkbox`, `switch`, `dropdown-menu`,
`popover`, `command` (⌘K search and pickers), `dialog`, `sheet` (mobile issue sidebar),
`tooltip`, `tabs`, `toast` (sonner), `avatar`, `separator`, `scroll-area`,
`skeleton`, `calendar` (date picker).

### Custom components (not in shadcn)

`LetterBadge`, `StatusPill`, `IssueKey`, `Tag`, `IssueRow`, `GroupHeader`,
`StatusStrip`, `Meter`, `StatRow`, `Kbd`, `QueryInput` (autocomplete), `SprintLine`,
`ProjectCard`, `EmptyState`, `RelativeTime` (with the absolute tooltip).

---

## 3. Colour

### 3.1 Neutrals

All neutrals are `oklch(L C 260)` with C ≤ 0.01. Only L changes between tokens, so the
whole grey ramp is one dial.

| Token | Light L | Dark L | Use |
|---|---|---|---|
| `--bg-app` | 0.965 | 0.19 | Sidebar, canvas behind panels, group headers |
| `--bg-surface` | 1.00 | 0.225 | Main content, cards, inputs |
| `--bg-raised` | 1.00 | 0.27 | Popovers, menus, dialogs |
| `--bg-inset` | 0.955 | 0.275 | Code, kbd, meter tracks |
| `--bg-hover` / `--bg-active` | ink at 5% / 9% | white at 5% / 9% | Row and nav states |
| `--bg-selected` | accent at 12% | accent at 16% | Selected rows |
| `--border` | 0.91 | 0.31 | Every panel edge and divider |
| `--border-subtle` | 0.94 | 0.275 | Row separators inside a list |
| `--border-strong` | 0.84 | 0.38 | Inputs, hovered cards |
| `--text` | 0.20 | 0.93 | Primary |
| `--text-secondary` | 0.47 | 0.73 | Labels, meta |
| `--text-muted` | 0.63 | 0.56 | Timestamps, empty values, placeholders |
| `--text-disabled` | 0.77 | 0.42 | |
| `--ink` | 0.20 | 0.94 | Primary button fill |

Dark is a **selected** set of steps against surface L 0.225 (≈ `#1a1d21`), not an
inversion. The sidebar is one step darker than the content in both themes so the shell
recedes.

### 3.2 Accent — the brand colour

A warm yellow, hue 83. It is light (L 0.81 / 0.83), so it works as a **fill** and never
as body text on the surface.

```css
--accent-h: 83;      /* hue. The knob to turn. */
--accent-c: 0.16;    /* chroma. 0 = fully monochrome UI. */
--accent-l: 0.81 | 0.83                     /* per theme */
--accent:      oklch(var(--accent-l) var(--accent-c) var(--accent-h));
--accent-soft: color-mix(in oklch, var(--accent) 15%, var(--bg-surface));   /* active nav, selected rows */
--accent-text: oklch(0.39 …) | oklch(0.85 …) /* the same hue at a text-safe lightness: links */
--on-accent:   oklch(0.17 0 0)               /* text on an accent fill: the unread badge */
--focus:       darker step on light, = accent on dark   /* focus ring */
```

Where it appears, and nowhere else: the zero and strike in the wordmark, the last bar
of the mark, the period after page titles (`Projects.`), the 2px active-nav bar and its soft tint, the unread count,
the unread dot in Inbox, selected table rows (soft), starred icon, the focus ring,
a `+1` reaction you made, links (`--accent-text`).
Never: button fills (those are `--ink`), status, priority, charts.

`--accent-h` is the only thing to change if the brand shifts; `--accent-c: 0` turns
the whole UI monochrome.
- **Focus ring: a flat 2px `--focus-soft`**, on every focusable element, always visible
  on `:focus-visible`. Not a surface gap plus a solid accent ring: that reads as a bright
  ring hovering off the control rather than as part of it. `--focus-soft` is the accent
  mixed down — 55% on dark, 80% on light — because the
  accent is light on dark and dark on light, so the same percentage is not the same
  strength. Those two numbers are the *lowest* that clear the 3:1 a focus indicator
  needs (WCAG 1.4.11): 3.92:1 on `--bg-surface` and 3.68:1 on `--bg-raised` in dark,
  3.28:1 in light. 35% was tried first and measured 2.35:1 / 1.71:1 — it looked right
  and failed, which is the whole reason the number is written down here.
- **Declare the ring once.** It lives on `:focus-visible` in `globals.css` and nowhere
  else. A component that adds its own `focus:ring-*` gets a second treatment, and the
  product ends up loud on the controls that forgot and quiet on the ones that did not.

### 3.3 The 14-token palette

Each token has three roles per theme, written as `oklch()`. Values are generated by
`palette.mjs` and verified on their sRGB equivalents: every `fg` on its `bg` ≥ 7:1,
every `solid` on the surface ≥ 3:1, in both themes. Neutrals are also `oklch()` at hue
260 with chroma ≤ 0.01, so the greys share one temperature across themes.

| Role | Where |
|---|---|
| `--palette-{hue}-bg` | Tinted fills: tags, letter badges, banners |
| `--palette-{hue}-fg` | Text on that fill |
| `--palette-{hue}-solid` | Dots, priority edges, distribution strips, meters, chart marks |

Hues: `red orange amber yellow lime green teal cyan blue indigo violet pink brown gray`.

Use via the utility class `.c-{hue}`, which sets `--c-bg / --c-fg / --c-solid` on the
element. Components style against the role, never the hue:

```html
<span class="badge c-amber">M</span>     <!-- Major -->
<span class="tag c-teal">onboarding</span>
<i class="dot c-green"></i>
```

### 3.3a Label colours (statuses, priorities, types)

Statuses, priorities and types are coloured from their own grid, not the 14-token
palette, and none of the three is neutral by default. A 40-swatch grid: 8 families (`gray red orange yellow
green teal blue pink`) × 5 shades, pale `1` to deep `5`, named `green-1` … `pink-5`.
Generated by `palette.mjs --labels --write` into its own block in `tokens.css`:

| Role | Where |
|---|---|
| `--label-{name}-bg` | the swatch; one value in both themes |
| `--label-{name}-fg` | text on it — dark or light, whichever reads better, chosen by the script |
| `--label-{name}-solid` | dots and edges: the nearest shade of the family that clears 3:1 on each theme's surface |

`.l-{name}` sets `--c-bg / --c-fg / --c-solid`, so `LetterBadge` and the status dot
style against roles exactly as `.c-{hue}` does. Five swatches are fixed colours rather
than generated ones, text included (`red-3`, `pink-3`, `yellow-2`, `green-1`, `gray-4`);
`red-3`'s text is 3.4:1, under AA, kept by decision. Every generated pair clears 4.5:1.

The picker (`components/label-color-picker.tsx`) is the 8 × 5 grid of `a` swatches in a
popover, families as columns.

### 3.4 Semantic mapping (seeded defaults)

| Concept | Label colour | Letter |
|---|---|---|
| Priority Show-stopper / Critical / Major / Normal / Minor | `red-3` / `pink-3` / `yellow-2` / `green-1` / `gray-4` | `S` `C` `M` `N` `M` |
| Type Bug / Feature / Task / Epic | `red-2` / `blue-2` / `gray-2` / `pink-2` | `B` `F` `T` `E` |
| Status Submitted · Open · In Progress · Reopened | `gray-1` · `blue-2` · `yellow-2` · `orange-2` | |
| Status Fixed · Closed | `green-2` · `green-3` | |
| Status Can't Reproduce · Duplicate · Won't fix · Obsolete | `gray-2` | |
| Status category backlog | hollow dot; 40 %-opacity segment in strips | |
| Status category cancelled | **hatched** in strips and dots; key struck through | |

Backlog, unstarted and cancelled all sit in gray deliberately: they differ by texture
(faded, solid, hatched), so the distinction survives colour-vision deficiency and print,
and a strip only lights up where work is actually moving (amber) or finished (green).
Resolved issue keys (done + cancelled) render struck through everywhere.

**Tags** are neutral outlined chips in lists and board cards. Their palette colour shows
on the issue page (beneath the title), in the tag manager, and in charts.

**Avatars** are DiceBear styles, rendered by the API (`GET /avatars/{kind}`) rather than a hosted service. People use the `initials` style over a **five-colour
pastel set**, picked deterministically from the seed so one person keeps one colour:

```
backgroundColor=ffe3ea,e3edff,e2f5e9,fdf1d4,efe6ff   textColor=151618
```

Person avatars do not carry the theme's neutrals. A wall of identical grey circles is harder to scan
than a wall of faintly different ones, and colour that identifies a person is not the
deviation-signalling colour rule 1 is about — it never competes with a priority badge
or an overdue date for meaning. The set is deliberately pale enough to read on both
themes without swapping, and the fixed dark text clears 15:1 on every one of the five.

**Projects** use the same `initials` style on the project's own `avatar_color`, the hue
picked in project settings, seeded by the project key:

```
/avatars/project?seed=<project key>&color=<avatar_color>
```

The initials are white at weight 600 on every hue, in the style's plain `alt` variant (the
default variant overlays a blended, half-opacity copy of the letters, which washes them out
at sidebar size). The background is the hue's light-theme `solid`, one value for both
themes, deepened until white clears **APCA Lc 75**. WCAG 2 ratios were not enough: they
rated dark text on the mid-tone hues (orange through cyan, pink) at 4.5–6:1, while APCA put
it at Lc 36–46, and at 22 px it read as unreadable. Hues whose `solid` falls short come out a
step deeper; the rest keep it.

`palette.mjs --marks --write` generates the colours twice: as hex in
`apps/api/src/config/project-mark-colors.ts`, and as `--mark-{hue}` / `--mark-text` in
`tokens.css`, which `.c-{hue}` exposes as `--c-mark`. The colour picker in project settings
and the loading stand-in draw from those tokens, so the swatch, the stand-in and the image
are the same colour. Edit the script, never either output.

The API builds the URL (`Project.avatar_url`), so a recolour changes the URL and the
immutable cache never serves the old colour. `avatar_color` and `avatar_initials` draw the
stand-in while the image loads.

The pastel five and the project mark colours are the one place a colour lives outside
`tokens.css`, because the mark is an SVG the API renders and cannot read the stylesheet.
The pastels are restated in exactly one constant — `AVATAR_PASTEL_BACKGROUNDS` and
`AVATAR_INITIALS_TEXT` in `apps/api/src/config/constants.ts`; the project colours are
generated, as above. Nowhere else.

Organisations use the `blobs` style seeded by the org name, and are the more saturated
mark of the two. Initials render underneath as the offline fallback. Real photos
replace the generated one when a user uploads.

**Resolved issues** dim as a whole: key struck and muted, title struck and muted, badges
at 55 % opacity. The row still sits in its group; it just recedes.

### 3.5 Chart series

Fixed order, validated CVD-safe for adjacent pairs in both themes with the dataviz
validator (worst adjacent ΔE 10.8, normal-vision ΔE 20.6):

`blue → orange → teal → amber → pink → green → violet → red`

Rules: never cycle; a ninth series folds into "Other"; colour follows the entity, never
its rank; a filter that changes the series count must not repaint survivors. Series
labels and values wear text tokens, never the series colour. Status-category colours
are used only when the chart *is* grouped by status.

**Magnitude in a grid** (the matrix report) is a neutral ramp, not a hue: `--heat-1…5`
mix the text colour into the surface at 5 / 10 / 16 / 23 / 31 %, so ink text clears 4.5:1 on every
step in both themes (8.2:1 light, 6.2:1 dark at the deepest). The alternative the viewer can pick
is a hairline bar under each count, `--text-muted`, as long as the count's share of the largest
cell. **Timeline bars** (Gantt) are the text colour at 16 % on the surface with the status
category as a 4 px left edge — the board card's dot, stretched — hatched when cancelled, and a
5 px `--palette-red-solid` end cap when an open issue is past its due date.

---

## 4. Typography

| Role | Face | Size / line | Weight | Notes |
|---|---|---|---|---|
| UI body, rows, inputs | Inter | 14 / 20 | 400 | The base. `cv05 cv11 ss01` features on. |
| Secondary meta, tags, timestamps | Inter | 13 / 18 | 400–500 | |
| Micro (legend, kbd, counts) | Inter | 12 / 16 | 500 | Never below 12px. |
| Issue title on detail | Inter | 15 / 22 | 500 | |
| Section heading | Inter | 14 / 20 | 600 | Same size as body; weight carries it. |
| Page title | Inter | 22 / 28 | 600 | `-0.01em` tracking |
| Issue h1 | Inter | 26 / 32 | 600 | `-0.01em` |
| Stat figure | Inter | 22 / 28 | 600 | Tabular figures |
| Hero figure | Inter | 34 / 40 | 600 | At most one per view |
| Issue key, duration, query, PAT | JetBrains Mono | 13 / 18 | 400–500 | The only mono use |

- Tabular figures (`tnum`) on every number that sits in a column or a stat.
- No all-caps labels, no letterspaced eyebrows. Section titles are sentence case.
- Line length ≤ 80 characters in prose (descriptions, comments, KB articles): cap the
  markdown column at 72ch.
- Fonts load from Google Fonts with `display=swap`; the `system-ui` stack is the
  fallback and must look acceptable, since self-hosters may block the request.

---

## 5. Space, size, radius

4px grid. `--space-1…16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

| Element | Size |
|---|---|
| List row | 36 (`--row`), 32 dense, 40 two-line |
| Control (button, input, select) | 32; small 26; large 36 (search, primary CTA) |
| Icon | 16 (14 in dense rows) |
| Letter badge | 18 × 18, radius 3 |
| Avatar | 26; 22 in rows; 32 in headers. Square for orgs/projects, round for people. |
| Sidebar | 248, collapsed 56 (`[` toggles; state remembered per user) |
| Top bar | 48 |
| Right rail | 336 |
| Page padding | 24; 16 on phones |
| Content max width | **none** — pages are fluid and fill the viewport at every sidebar state; only prose (markdown) is capped, at 72ch. `--content-max` is unused by the shell. |

Radius: 3 badge · 4 buttons, inputs, tags, pills · 6 cards, panels · 8 dialogs, popovers.
Radius encodes hierarchy: the bigger the floating surface, the rounder.

Motion: 120ms for hover/press/focus, 200ms expand/collapse/popover, 320ms dialog and
sidebar. `ease-out` for entering, `ease-in-out` for state changes. Everything collapses
to 0ms under `prefers-reduced-motion`. No page-load animation.

---

## 5a. Brand

- **Mark**: four slanted bars, right-aligned and shortening downward, a burndown on its
  side; the last, shortest bar is accent. At 32 px and below it switches to a drawing
  snapped to a 16 px grid (bars 2 px tall, 2 px apart), because the master's thin bars
  blur at favicon size. Ink follows the theme; the accent bar stays accent everywhere.
- **Wordmark**: `nothing left` in Inter 700, lowercase, outlined. The `o` is an accent
  ring (zero, the count of what is left) and `left` is struck through by an accent bar.
  15 px tall in the sidebar and auth headers. No white-on-accent version: at small sizes
  the ring and strike disappear into the yellow.
- Top-left of the sidebar, above the organisation switcher; collapsed sidebar keeps only
  the mark. The app renders mark and wordmark inline from
  `apps/web/components/shell/brand.tsx` so they follow the in-app theme. The favicon,
  `apps/web/app/icon.svg`, is the small drawing and follows `prefers-color-scheme`.
- **Full-page loader**: the mark at 40 px with its bars burning down one by one, shortest
  first, then returning. Static under `prefers-reduced-motion`.
- The same accent period closes every page title (`My work.` `Projects.` `Issues.`),
  implemented as `h1::after`. Never on content titles such as an issue's summary.

## 6. Shell

```
┌──────────┬────────────────────────────────────────────────────────────┐
│ Org ▾    │ Breadcrumb            [ Search or query  ⁄ ]  [Create c] ☼ ◯ │  44
│ Home     ├────────────────────────────────────────────────────────────┤
│ Inbox  4 │                                                            │
│ My issues│  Page title   date                       [tab] [tab]       │
│ Starred  │  ───────────────────────────────────────────────────────   │
│          │  stat │ stat │ stat │ stat                                 │
│ Projects+│  ───────────────────────────────────────────────────────   │
│ ▾ PP     │  ┌ main column ───────────────────┐ ┌ rail 320 ─────────┐ │
│   Issues │  │ section                        │ │ section           │ │
│   Board  │  │   rows…                        │ │   items…          │ │
│   …      │  └────────────────────────────────┘ └───────────────────┘ │
│ ▸ IT     │                                                            │
│ Saved    │                                                            │
│ views    │                                                            │
│ ──────── │                                                            │
│ Settings │                                                            │
│ ? Keys   │                                                            │
└──────────┴────────────────────────────────────────────────────────────┘
   240
```

- **Sidebar** sits on `--bg-app`; content on `--bg-surface`. Top: the **organisation
  switcher** (ink mark, name, "Organisation" caption, ⇅). Active nav item: `--bg-active`
  plus a 2px accent bar at the far left. Projects expand inline to Issues / Board /
  Backlog / Reports / Knowledge base; the project key is its own column so it is never
  confused with the org. Saved views list below with a neutral dot and count.
  Footer: Settings, Shortcuts (`?`), the current user (avatar + name,
  opens profile/account), and **Collapse**. Collapsed = icons only, tooltips on hover.
- **Top bar** holds: breadcrumb, the search/query input (`/`), Create issue (`c`), the Inbox
  icon with the unread count on an accent pill (in the top bar as well as the sidebar, so
  it survives a collapsed sidebar and phones), theme toggle. The search input is set in mono because it *is* the query language;
  its placeholder shows a real query.
- Below 1200px the rail drops beneath the main column as a 2-up grid; below 900px the
  sidebar becomes a sheet, stat rows go 2-up, and rows hide tags / status / assignees.

---

## 7. Components

### Letter badge
18×18, 11px/600. **Filled** in the value's label colour for statuses, priorities and
types; **neutral outlined** for work types, which have no colour. Always with a `title` tooltip naming the value. Used wherever a row must show
priority and type in ≤ 44px: lists, link lists, inbox. Board cards show a dot and the name
instead: a card has the width, and letters there read as noise.

### Status pill
Dot (8px; gray hollow for backlog, gray solid for unstarted, amber for started, green
for done, gray hatched for cancelled) + name, 13px secondary text, 26px tall, min-width
104px so columns align. Hover reveals a hairline border to
signal inline editability; click opens a `command` picker.

### Issue key
Mono 12px, `--text-secondary`. Struck through and muted when resolved. Copy on click on
detail pages.

### Tag
20px tall, 12px/500, radius 4. In lists: neutral outlined chip. On the issue page and
in the tag manager: `--c-bg`/`--c-fg` tinted. Displays `name` as typed. Inline `×` on
hover only where removal is allowed.

### Issue row (32px)
`[P][T] KEY  Title  sub-progress · tags … · status · due · assignees`
Grid columns: `auto auto minmax(80px,auto) minmax(0,1fr) auto auto auto auto`.
Title truncates; nothing else does. Overdue due-dates use `--danger-fg` + 500; today
uses `--text` + 500; everything else muted. Multi-assignees stack with a 1.5px surface
ring, overlapping 4px. Unassigned = dashed hollow circle, tooltip "Unassigned".

### Group header (28px)
`--bg-app` band, 12px/500 secondary text, count in muted regular. Counts respect the
active filter. Overdue groups colour the label `--danger-fg`.

### Status distribution strip
6px tall, 2px gaps between segments, radius 3 on the ends only. Segments are
`--c-solid`; cancelled segment hatched. Always followed by a legend (dot + name + bold
count) so identity is never colour-alone. Hover on a segment: "58 cards in status Open".
The same component lives on the board header, project cards, and sprint lines.

### Meter
4px track (`--bg-inset`), fill `--c-solid`. Blue for neutral progress, amber ≥ 80%,
red ≥ 95% for quota meters.

### Stat row
One `border-top`/`border-bottom` band; figures 20px/600 tabular; label 12px secondary
under each; vertical hairlines between. Optional small unit (`of 40h`) and delta
(`+7 vs last week`, green/red by direction × whether up is good). An alert figure
(overdue) is `--danger-fg`. Max 5 per row.

A linked figure makes its whole cell the link, meter included. Hover and keyboard focus
wash the cell in `--bg-hover` from hairline to hairline, brighten the label to `--text`
and fade in a small arrow after it; the figure itself never changes. No underline, no
scale, nothing moves. A row with any link insets its outer cells 12px so the figure
clears the wash's edge.

### Kbd
11px/500 muted, `--bg-inset`, 1px border with a 2px bottom. Shown inside the primary
button (`c`), the search input (`/`), and the shortcuts nav item (`?`).

### Banner
Full-width, `--warning-bg`/`--warning-fg` (or danger), 12px, icon left, single action
link right. Only rendered when the condition is true (storage ≥ 80%, seats > 20).

### Empty state
Muted 12px sentence inside the section it replaces, naming the action:
*"Internal Tools has no active sprint."* / *"Plan one from the backlog"* as a link.
The first-project empty state (`docs/onboarding.md`) is the one exception that gets
three equal actions.

---

## 8. The dashboard

Route: `/dashboard` (Home; `/` redirects). Two compositions, tabs, default by role. Contributors and Observers
see only **My work** with no tab bar. Project Admin and above see **My work | Projects**
and land on Projects.

### My work
1. Stat row: Overdue (alert) · Due today · Open assigned to me (with project count) ·
   Logged this week (with meter vs the org workweek, the week's make-up on hover of the
   unit). Logged time is the user's own time on any issue they can read, whoever it is
   assigned to now, and links to their timesheet.
2. **Assigned to me**, grouped Overdue / Today / This week / Later / No due date with
   filter-aware counts. Ten rows in all, never more: every non-empty group first gets an
   equal share (at most three), the rest goes to the earliest groups. Each group fetches
   its own rows (`group_limit`), so a long Overdue never empties the later groups. A group
   with more says _View all 13 overdue_ and opens that group's own query; the header link
   _View all assigned issues_ goes to the issue list with
   `assignee: me #Unresolved sort by: due date asc` grouped by due date.
3. **Starred**.
4. Rail: **Inbox** (grouped by issue, unread dot, "Mark all read"), **Active sprints**
   the user has issues in (days left, red under 3 days, personal strip), **Recently
   viewed** (this device, one list per account and organisation; an issue that no longer
   opens drops out).
5. Empty states name a destination the user can reach: _Open the Mobile app backlog_
   with one writable project, _Browse projects_ otherwise; _press c to create one_ only
   for someone who can create.

### Projects
1. Org banners when relevant (Org Admin and Owner).
2. Toolbar: _Show_ Active | All, _Sort_ Needs attention | A–Z, the count, and _New
   project_ (outline, small) for those who may create one. **Active** is the default and
   governs the stat row, the cards and every drill-down: the archived projects' keys are
   negated in each list link, since a search reads archived projects too. **All** adds
   archived cards, marked _Archived_, after the active ones. **Needs attention** orders by
   overdue, then unassigned, then open, so an empty project sinks to the end.
3. Stat row: Open · Overdue · Unassigned · Resolved 7d (with delta; no change is neutral
   `±0`) · Created 7d.
4. **Project cards**, 2-up: avatar, name, key, lead → active sprint line with dates,
   days left, strip + legend (or the no-sprint empty state) → five figures → team load
   (avatar + first name + open count; more than 15 open is danger ink with a tooltip that
   says only that) → footer links and "Updated N ago" with the absolute tooltip. The card
   is not a link, so it has no hover state; its links do.
5. Rail, Org Admin and Owner only: **Members and limits** (seat meter, storage meter; a
   sentence appears under a meter only once it passes 80% — pricing lives in settings),
   **Activity** (org-level audit feed; each line names its subject — `@username`, a
   field's name — and links the project key it carries). A Project Admin sees the same
   cards across the full width, without the rail: the audit feed and project creation are
   an Org Admin's.

A section whose data failed to load says so with _Retry_ in its place — never a zero or an
empty list. A refresh that fails keeps what loaded before under a one-line notice; a failed
stat row shows `–`, not `0`. Each figure's link wraps the number and its label, so its
name reads _100 Overdue_.

Every number is a link to the filtered list that produced it.

## 8a. Issue list

Route: `/projects/PP/issues?q=…` (also `/issues?q=…` across projects). **The query bar drives everything and the URL mirrors it.**

1. **Query bar** (36 px, mono): the live query in the product's search language,
   attributes in secondary ink, values in primary. `/` focuses. Right: `Save view`.
   Autocomplete drops below in groups — Attributes (with plain-language description),
   Values (grouped by source), Saved searches, Recent — footer *Press ⇥ to complete the
   first item*.
2. **View tabs**: saved views as pills with counts; the active one filled. Right:
   `Group by ▾`, `Columns ▾`, export.
3. **Table**: sticky header; columns `☐ P T Key Title(+meta) Tags Status Assignee Due
   Updated`. Meta after the title in muted 12 px: subtasks `4/9`, comments, attachments.
   Group headers carry the status dot, filter-aware count, and `showing N` when
   truncated; resolved groups start collapsed. Checkboxes appear on hover; selecting
   any row shows them all.
4. **Bulk bar**: sticky at the bottom, only while a selection exists: `N selected · Set
   status · Set priority · Assign · Add tag | Move · More | Clear`.
5. Inline edit: the status pill and assignee open a `command` picker in place.
6. Phones: key + title + status only; the query bar stays.

## 8b. Issue page

Route: `/issue/PP-622/<title-slug>` (routes: `docs/frontend-guide.md#routes`). Two columns: main (max 900 px) and a **336 px sidebar
that is `position: sticky`** inside the scrolling page, with its own scroll when taller
than the viewport. Below 1100 px the sidebar stacks under the title.

**Top bar**: breadcrumb `Projects / Partner Portal / Issues / PP-622 ⧉` with a copy-key
button; right: `‹ 12 of 96 ›` pager (j / k), Create issue, theme.

**Main, top to bottom**
1. Provenance: *Created by X about 2 months ago · Updated by Y 12 days ago*, absolute
   date in the tooltip. Right: star (accent when on, implies watch), vote with count.
2. Title (26 px) with inline actions: edit (`e`), tag, link, more.
3. Tags as removable chips directly under the title, plus `+`. This is the one place
   tags wear their palette colour.
4. Description: rendered markdown, 15 px / 22, 72ch max, checkable task lists,
   inline code, images as bordered blocks. Click to edit in place.
5. Links: tabs per link type with counts (`Parent for 3`), `Add links`. Rows: P, T,
   key (struck when resolved), title, status pill.
6. Attachments: count, `Hidden files N · show`, `Attach files`; no overflow menu until
   something needs one. Image thumbnails; file tiles with a neutral type square and size.
   Hidden entirely while the issue has no files (`docs/ui-conventions.md` § Issue page).
7. Activity: tabs All / Comments / Spent time (total) / History. Entries grouped by
   save (`change_group_id`): one header, several `Field: old → new` lines. A comment
   saved with a change shows the change in a bordered block under the comment body.
   Time entries: mono duration, work type, note. Reactions: the fixed five, yours
   accent-outlined. A hairline joins consecutive entries. MCP actors get the `⌘` mark.
8. Comment editor: block type, B I S A, quote, code, link, lists, task list, code
   block, table, image; `Visual | Markdown` toggle; `Add comment ⌘↵`, `Cancel`,
   `Add spent time` right-aligned. No visibility dropdown, no AI button.

**Sticky sidebar**: label above value, 13 px, value badge or avatar in the right column.
An editable value wears a dotted hairline underline in `--border-strong` as its standing
cue, and hover adds the `--bg-hover` surface, darkens the rule and shows a small pencil
beside the label. A surface that only appears on hover leaves people unsure what they
can change. Read-only rows carry none of it. Order: Project, Priority, Type, Status, Assignees,
Sprint, Start date, Due date, Estimation, Spent time (`+` logs time; shows `of 4h`),
Story points, Boards, then **Custom fields**, then Watchers and Votes. Empty values
render their configured label in muted text: `No severity`, `No customer`.

---

## 8c. Auth pages

**Split, two equal columns.** Someone landing on `/sign-up` from a link has never seen
the product, and a blank column tells them nothing. Form left, product panel right,
each half the viewport.

Below `lg` the panel is removed outright and the form takes the full width. A
decorative half on a phone is just something to scroll past.

**Always light.** The auth pages and the invite landing (`/invite/<token>`) ignore the
visitor's theme: they continue the marketing site, which is light-only, and the dark
panel only reads as a separate surface beside a light form. The account's theme takes over
at `/welcome` (decided 11 Oct 2026).

### The form column

400 px of content, vertically centred. Wordmark top-left, Docs / Self-host top-right,
licence line in the footer. Order inside: heading (22 px) → one-line lede → alert, if
any → fields → primary button, full width → fine print → the swap link.

**No browser-native validation anywhere.** No `required`, no `minLength`, no
`pattern`, and every form carries `noValidate`, so the browser's own bubble can never
appear over ours. Validation runs against the same Zod schema in `packages/types` that
the API validates with, and each message is ours. This is CLAUDE.md rule 10 applied to
validation as well as to controls.

Inputs are 32 px, bordered, on `--bg-surface`, with the label above in 13 px secondary
ink. Password fields carry a show/hide eye. A field in error gets a `--danger-fg`
border and its message directly beneath — never a tooltip.

### The panel column

`--panel-*` tokens: **dark in both themes**, the one inverted surface in the product,
so the page reads the same whichever theme a visitor arrives on. It holds an inline SVG
of the product drawn in those tokens, then a 22 px headline and two lines of body copy
at the bottom.

Two illustrations, so sign-up and the rest do not read as the same picture:

| Panel | Used by | Shows |
|---|---|---|
| `BoardArt` | `/sign-up` | A board filling up — three columns, a few cards, one amber tag. Lighter and airier: a new organisation has nothing in it yet. |
| `ListArt` | everything else | A query bar over an issue list, one row carrying the accent. Denser: a returning user has a backlog. |

The accent appears exactly once per illustration. That is the same rule the app obeys
— colour means deviation — stated in a picture.

### Views

| View | What it says / does |
|---|---|
| Sign in | Email + password, plus provider buttons. Wrong credentials → one inline alert above the fields, both kept, and it names the lockout rule (5 attempts, 15 min) with a link to reset. |
| Create account | Name, work email, password. Panel is `BoardArt`. Below the password: a four-segment **advisory** strength meter and one requirement line, "At least 8 characters". The meter stays neutral unless the password is genuinely weak, because the only rules the API refuses on are length and the breach list — a red bar for "no symbols" would be a lie about what happens on submit. |
| Check your inbox | Mail icon, the address in the lede, 24-hour expiry, `Resend email · 42s` cooldown, and a primary button that continues into the app: verifying gates invites, not usage. |
| Verify result | Success and failure are two states of the same route, since the link is what carries the token. |
| Reset | Email → "Send reset link", then a success state on the same route. Copy states single-use, one hour, signs out everywhere, and that the answer is identical whether or not the account exists. |
| New password | Reached with `?token=`. Same strength meter. Copy says the link works once. |
| Two-factor | Six mono cells, auto-advance; error under the cells says codes rotate every 30 s. Link to recovery codes. Password sign-in only. |
| Invite landing (Path A) | The invite card *first*: org mark, org · project, inviter, role chip. Email pre-filled and marked `verified` when the invite was emailed. Primary button names the org: "Join Acme Corporation". **Rendered in the § 8d frame, not this split.** |
| Accept (Path B) | Signed-in user sees the card and two buttons, Accept / Decline; copy explains why nothing is automatic. **§ 8d frame.** |

Provider buttons are outlined ink with the provider glyph in currentColor — no brand
colours. The primary action is the ink button, full width. **The accent never fills a
button**, on these pages or anywhere else.

## 8d. Onboarding and invitations

Route: `/welcome/*` and `/invite/<token>`. These do not use the § 8c auth split. The
auth split's job is to show a stranger what the product is. Somebody halfway through creating an organisation has
already decided; what they want to know is how much further there is to go. So the
decorative panel is replaced by a **step rail** that answers exactly that.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ≡ nothing left                      Signed in as alex@…     Sign out │ 64
├──────────────────────────┬───────────────────────────────────────────┤
│ ╭──────────────────────╮ │  Step 2 of 4                              │ 14
│ │ Four short steps and │ │  Create your organisation                 │ 26/600
│ │ you are in. Nothing  │ │  An organisation holds your projects…     │ 15
│ │ here is configuration│ │                                           │
│ │                      │ │  Organisation name                        │
│ │  ( ✓ ) Your profile  │ │  [ Acme Corporation                ]     │ 32
│ │   ┆    Your name,…   │ │                                           │
│ │  (( )) Organisation  │ │  Web address                              │
│ │   ┆    An organisa…  │ │  [ acme-corporation                ]     │
│ │  ( ▤ ) First project │ │  Lowercase letters, numbers and hyphens…  │
│ │   ┆    A project is… │ │  ───────────────────────────────────────  │
│ │  ( +) Invite people  │ │  ← Back   [ Save and continue ]           │
│ ╰──────────────────────╯ │                                           │
│      --bg-app, 400        │            --bg-surface                  │
└──────────────────────────┴───────────────────────────────────────────┘
        the page itself is --bg-surface; no outer card
```

- **Flat, not a card in a card.** The header is a full-width band with a bottom
  hairline, and the body fills the width beneath it. The rail is the only rounded block
  on the screen. No outer floating card: it puts three edges between the viewport and
  the form and makes a five-field page feel like a modal.
- **Surfaces.** Page and form on `--bg-surface`; the rail an inset `--bg-app` block with
  `6` of margin around it. One step back, the same relationship the shell gives its
  sidebar (§ 6).
- **Markers are icons, not numbers.** A 36px circle per step: done is an `--ink` fill
  with a white check and a solid `--ink` connector above it; current is a surface fill
  with a 2px `--ink` ring; upcoming is `--bg-inset` with the icon in secondary ink and a
  dashed connector. No numbers — the eyebrow already says *Step 2 of 4*, and a digit in
  a circle is the generic treatment. **No accent anywhere in the rail**:
  progress is not a deviation from a default, so it is not what colour is for here.
- **Rail prose is `--text-secondary` at 14px, never `--text-muted`.** Muted measures
  3.97:1 on `--bg-app` in dark and 3.16:1 in light; a paragraph somebody has to read
  before deciding what to type cannot be set in it. Muted is for a timestamp.
- **Heading 26/600**, one lede line at 15 under it, fields at 32, and a footer above a
  hairline: `← Back` as a ghost button, the ink primary beside it, and a skip as a plain
  text link pushed to the far right where it is visible but not competing.
- **The eyebrow is sentence case.** `Step 2 of 4` at 14px secondary — not
  `STEP 2 OF 4`, because § 4 has no caps-and-tracking eyebrows anywhere in this product.
- **Below `lg`** the rail collapses to one line on `--bg-app` with a bottom hairline, and
  the form takes the full width. The panel's own eyebrow hides, since that line says it.

The step list is built per path and is **not** fixed; the three lists and the rule for
when the verification step appears live in
`docs/frontend-guide.md § Onboarding and invitations`.

## 9. Feedback

Every message body is monochrome; the leading icon carries the meaning in the same
palette tokens the product already uses.

| Kind | Colour | Lifetime | Voice |
|---|---|---|---|
| Success | green | 6 s, paused on hover | past tense, object named: "Moved to Fixed" |
| Info | neutral | 6 s | what happened elsewhere: "Claude (via MCP) created 4 issues" |
| Progress | neutral, spinning | until it becomes success or error | present tense with numbers |
| Warning | amber | until the situation changes | the state + what still works |
| Error | red | until dismissed | object, cause, current truth, way out |

**Toasts** (`.toast`): bottom-right, newest at the bottom, at most three. One optional
action — Undo, Retry, Open — never two. Used only for things that happened *away* from
the pointer; an inline edit you just made needs no toast. `role="status"` for success /
info, `role="alert"` for warning / error.

**Inline alerts** (`.alert`): inside the form or panel they concern, above the first
field, persistent. Error and warning take the palette tint (`-bg`, `-fg`, tinted
border); success and info stay on the surface with a hairline. Optional actions on the
right.

**Field validation** (`.field.invalid` / `.valid`): validate on blur, then on every
keystroke once invalid. Red border and red help text move together; nothing else on the
page changes. Help text says what fails *and* what passes. Green is used only for
availability checks, never as praise.

**Banners**: page-level, rendered only while the condition is true, one sentence and
one link. Warning tint at thresholds, danger tint when blocked, neutral inset for
informational states (Observer role).

**Confirmations** (`.dialog`): for irreversible actions and for ones that affect other
people — which includes deleting an issue and archiving a project, even though both can be
undone. State every consequence with real counts. The
destructive button is the single red fill in the product (`.btn.danger`). A reversible
action that touches only the actor gets a success toast with Undo instead of a dialog.

**Empty / loading / error**: an empty result names the query that produced it and
offers to widen or clear; loading keeps the layout with skeleton bars; error pages say
what happened, whether data is safe, one way forward. Denied and missing both render
`404`.

**Words**: no "Oops", "Sorry", "successfully", or exclamation marks. Title = what
happened. Detail = cause, current truth, way out. Buttons repeat the title's verb.

## 9b. Writing

Sentence case everywhere. Buttons say what happens: "Create issue", "Mark all read",
"Plan one from the backlog". Meta lines are sentences with a subject: *"Alex Lee
mentioned you"*, not `mention · Alex · 12m`. Relative times under 7 days, absolute
after, always with the absolute tooltip. Empty values use the configured label.
Product name never leads a subject or a heading.
