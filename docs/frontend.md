# Frontend

## Component library — shadcn/ui, not raw Tailwind

**shadcn/ui is Tailwind.** It is a CLI that copies component source into the
repository, built on **Radix UI** primitives and styled with Tailwind. It is
not a runtime dependency, there is no version lock, and every component is
editable source you own.

The decision is settled by one product rule: **no browser-native form
controls.** Native `<select>` and `<input type="date">` are exactly what
plain Tailwind gives you, and they look wrong in a dense application UI.

Replacing them properly means focus trapping, keyboard navigation, ARIA
roles, portal positioning and viewport collision detection — weeks of work
that is very easy to get subtly wrong, and that Radix has already done.

### Banned outright

| Never use | Use instead |
|---|---|
| `<select>` | Radix Select, or Combobox for anything searchable |
| `<input type="date">` | Calendar (react-day-picker) inside a Popover |
| `<input type="datetime-local">` | Calendar + a time Select |
| `window.alert` / `confirm` / `prompt` | Dialog / AlertDialog |
| `title=""` as a tooltip | Tooltip |
| Native scrollbars on custom panels | ScrollArea |

### Components needed

Install as the work requires, not all at once:

**Core** — Button, Input, Textarea, Label, Checkbox, Switch, Badge, Avatar,
Separator, Skeleton, ScrollArea.

**Overlay** — Dialog, AlertDialog, Sheet (mobile panels), Popover,
DropdownMenu, ContextMenu, Tooltip, HoverCard.

**Selection** — Select, Command (cmdk — powers the command palette, mention
picker, assignee picker, tag picker, search autocomplete), Calendar,
RadioGroup, Toggle, ToggleGroup.

**Layout** — Tabs, Accordion, Collapsible, Resizable, Table.

**Feedback** — Sonner (toasts), Progress, Alert.

`Command` is the workhorse. Every picker in this product is a searchable
combobox: assignee, tag, sprint, status, issue link, mention, and the global
`⌘K` palette.

## Libraries beyond shadcn

| Concern | Package |
|---|---|
| Data fetching, polling, optimistic updates | `@tanstack/react-query` |
| Tables — issue list, timesheet, matrix report | `@tanstack/react-table` |
| **Virtualised long lists** | `@tanstack/react-virtual` |
| Drag and drop — board, backlog, article tree, field order | `@dnd-kit/core`, `@dnd-kit/sortable` |
| Markdown editor | `@tiptap/react` + starter kit + markdown serialiser |
| Markdown rendering | `unified`, `remark-parse`, `remark-gfm`, `rehype-sanitize`, `rehype-highlight` |
| Charts | `recharts` |
| Date arithmetic | `date-fns` |
| Date **formatting and timezone conversion** | native `Intl.DateTimeFormat` |
| Theme switching | `next-themes` |
| Forms | `react-hook-form` + `@hookform/resolvers` + the shared Zod schemas |
| QR code for two-factor setup, drawn from the `otpauth://` URI as React SVG | `qrcode.react` |

`@tanstack/react-virtual` matters: an issue list of two thousand rows with
inline editing will not survive unvirtualised.

Use **native `Intl.DateTimeFormat`** for display rather than a timezone
library. It handles IANA zones correctly, ships with the browser, and costs
zero bundle. `date-fns` is for arithmetic only.

## Colour and visual design — owned by `design/`

**`design/tokens.css` is the single source of truth for colour, type scale,
spacing, sizing, radius and motion.** `apps/web/app/globals.css` carries a
verbatim copy between `tokens:start` / `tokens:end` markers, refreshed with
`bun run tokens:sync` inside `apps/web` — never edited by hand, and never
imported across the package boundary (decided 21 Sep 2026). `design/DESIGN-SYSTEM.md` explains the
system; `design/scripts/palette.mjs` generates the palette from OKLCH targets
and validates it for WCAG contrast and colour-vision deficiency.

Do not restate colour values here or anywhere else. Edit the script, not the
hex.

What the design system settles, so it is not re-litigated:

- **14 palette tokens**, each with `-bg`, `-fg` and `-solid` variants in both
  themes: `gray, red, orange, amber, yellow, lime, green, teal, cyan, blue,
  indigo, violet, pink, brown`.
- **Colour means deviation.** Chrome is monochrome. Colour appears only where
  a value departs from its default — a priority above Normal, a status that
  has started or finished, an overdue date, a quota past threshold. A typical
  list row has zero or one coloured element.
- **Status categories separate by texture, not only hue** — backlog faded,
  unstarted solid, cancelled hatched, all in gray; only `started` (amber) and
  `done` (green) take colour. That survives colour-vision deficiency and
  print, and makes a distribution strip light up only where work is actually
  moving.
- **Chart series** are a fixed, CVD-validated order of eight:
  `blue → orange → teal → amber → pink → green → violet → red`. Never cycle;
  a ninth series folds into *Other*; colour follows the entity, never its
  rank.
- **Tags and type badges render neutral in dense lists**, taking their
  palette colour on the issue page, in the tag manager and in charts.

### One thing this does not change

The database still stores a **colour token name per status, priority, type
and tag**, exactly as `data-model.md` specifies. Storage and rendering are
separate concerns: the seed assigns a token to every row, and the design
system decides where that token is actually painted. A future dense-vs-
colourful toggle, or a project that recolours its statuses, needs the stored
value to exist.

## Typography

| Use | Font |
|---|---|
| UI | **Inter**, via `next/font` (self-hosted, no external request) |
| Code, issue keys, durations | **JetBrains Mono**, same |

Issue keys (`SH-622`), durations (`1w 2d 4h`) and project keys render in
mono. They are identifiers, they are compared at a glance, and tabular
figures keep them aligned in lists.

Type scale: `12 / 13 / 14 / 16 / 20 / 24 / 32`. Body is 14px — this is a
dense application, not a marketing page.

## Theming

`next-themes` with three states: light, dark, system. Dark is a first-class
target rather than an inversion — the reference product is used predominantly
in dark mode, and every palette token above is defined for both.

Semantic CSS variables follow the shadcn convention (`--background`,
`--foreground`, `--muted`, `--border`, `--primary`, `--destructive`), with
the 14 tokens layered on top.

## Rules

1. **No browser-native form controls.** See the banned list above.
2. **No arbitrary colour values** in components. Use palette tokens or
   semantic variables — never `text-[#ff6600]`.
3. **Date and time formatting lives in one module**, `apps/web/lib/datetime`,
   implementing [ui-conventions.md](./ui-conventions.md). A lint rule bans
   formatting anywhere else.
4. **Every list over 100 rows is virtualised.**
5. **Optimistic updates on every mutation**, reconciled by TanStack Query.
   The UI must never feel like it is waiting for a round trip.
6. **Empty states always offer an action.** Never a blank panel.
7. **Loading states are skeletons**, shaped like the content, not spinners.
   The one exception is the **full-page loader**: shown only while the
   signed-in shell boots and nothing on screen is known yet — the session is
   being confirmed, so neither the navigation nor the organisation can render.
   Once the shell is up, every subsequent load inside it is a skeleton.
8. **Keyboard first.** Every primary action has a shortcut; every dialog
   closes on `Escape`; every list is arrow-navigable.
9. **No UI test suite** — an explicit product decision. Correctness lives in
   the API, which is tested thoroughly.

## One API client

**Every request to the backend goes through one file.** No `fetch` or HTTP
library call anywhere else.

```
apps/web/lib/api/
├── client.ts          the single fetch wrapper — the only place that calls fetch
├── issues.ts          typed functions: listIssues, getIssue, createIssue…
├── projects.ts
└── …                  one module per resource, all calling client.ts
```

`client.ts` is the single place that owns:

- **Base URL and credentials** — `credentials: "include"` for the session
  cookie, on every request
- **Timeout** — 10s via `AbortController`, so a hung request surfaces instead
  of spinning forever
- **`401`** — clear cached state, redirect to sign-in, preserve the return path
- **`403` / `404`** — mapped to typed errors the UI renders consistently
- **Error envelope parsing** — unwraps `{ error: { code, message, … } }` into
  a typed `ApiError` carrying `code`, `field`, `valid_values`, `request_id`
- **`meta.request_id`** — captured and attached to any error reported, so a
  user's screenshot maps to one server trace
- **`Idempotency-Key`** on create operations
- **Retry policy** — idempotent GETs only, never writes

The reason this is a hard rule rather than a preference: the day you want a
custom message on `401`, or a 10-second cutoff, or a request ID on every
error report, you change one file. With `fetch` scattered across forty
components, you change forty files and miss six.

Use native **`fetch`**, not axios — no dependency, works in server
components, and `AbortController` is built in.

**Every DTO comes from `@nothingleft/types`.** Never redeclare a response
shape locally — a local `type Me = {...}` is a second source of truth that
drifts from the API the moment a field changes, silently and at runtime.
If a DTO is missing from the package, that is a backend task to add it, not
a reason to declare it in `lib/api/`.

The same applies to `Envelope<T>`, `Meta` and the error shape: they are
defined once, in `@nothingleft/types`, and imported.

TanStack Query hooks call the typed resource functions. Components call
hooks. **Components never call `client.ts` directly and never call `fetch`.**

A lint rule bans `fetch(`, `axios` and `XMLHttpRequest` outside
`apps/web/lib/api/`.

## Package installation policy

**Always install at `@latest`.**

```
bun add <package>@latest
bun add -d <package>@latest
```

The exception, and the only one:

```
bun add -d typescript@~5
```

Rationale: a model's training data contains older version numbers, so an
unqualified `bun add react-query` reliably installs something eighteen
months stale, and the resulting bugs are subtle and waste hours. `@latest`
costs nothing and removes the failure mode entirely.

Reproducibility comes from **committing `bun.lock`**, not from pinning
exact versions in `package.json`. Carets stay; the lockfile is the record.

Before starting a milestone, run `bunx npm-check-updates -i` to see what
has moved.
