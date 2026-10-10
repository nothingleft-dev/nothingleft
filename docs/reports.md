# Reports

Nine reports. Each is available as a chart in the UI **and** through the MCP
tool `run_report(name, params)`, which returns a markdown table plus the
underlying series — so an agent works from exactly the numbers the chart is
drawn from.

Report definitions live server-side. The UI and the MCP tool call the same
definition, so they cannot drift.

Every report is scoped by a [search query](./search-query-language.md), which
means any filter expressible in the search bar is expressible as a report
scope. Saved views can be used as report scopes directly.

## The nine

### 1. Issues per assignee

Distribution of issues across assignees.

- **Charts:** bar, pie
- **Params:** `projects[]`, `filter`, `include_unassigned`
- **Notes:** an issue with multiple assignees counts once per assignee; the
  total is stated so the arithmetic is not confusing.

### 2. Issues per project

Distribution across projects in an organisation.

- **Charts:** bar, pie
- **Params:** `org`, `filter`

### 3. Issues per arbitrary field

Distribution by any field — status, assignee, priority, type, sprint, tag, or
any custom field — across one or more projects.

- **Charts:** bar, pie
- **Params:** `field`, `projects[]`, `filter`
- **Notes:** when projects have renamed statuses, grouping by status offers a
  *group by category* toggle so cross-project totals stay meaningful.

### 4. Matrix report

Distribution across **two** fields at once — status × assignee, priority ×
type, or any two custom fields.

- **Charts:** matrix table (with cell heat), stacked bar
- **Params:** `row_field`, `column_field`, `projects[]`, `filter`
- **Notes:** cells link straight to the filtered issue list for that
  intersection.

### 5. Burndown

Remaining work across a sprint.

- **Chart:** line, with an ideal-trend reference line
- **Params:** `sprint`, `measure` (`story_points` | `issue_count` |
  `remaining_estimate`)
- **Source:** `sprint_snapshots`, written nightly. Reading a precomputed
  table rather than replaying the activity log makes the chart instant and
  keeps history accurate even after issues are edited.
- **Notes:** scope changes mid-sprint are shown as a distinct series, so
  "we finished nothing" and "they added 30 points on Tuesday" are
  distinguishable.

### 6. Average issue age

How long issues have been open, grouped by a field.

- **Chart:** bar
- **Params:** `projects[]`, `group_by`, `filter`, `unresolved_only`
- **Source:** `created_at` to `resolved_at`, or to now for open issues.

### 7. Time report

Total time spent on projects or sprints, against original estimates.

- **Charts:** table, bar
- **Params:** `projects[]` or `sprints[]`, `date_range`,
  `group_by` (`work_type` | `user` | `issue` | `project`)
- **Columns:** spent, original estimate, difference, percentage of total
- **Notes:** this is why `work_items.work_type_id` exists. Grouping by work
  type answers "how much of last month was investigation rather than
  implementation?"

### 8. Gantt chart

Timeline of issues with dependencies.

- **Chart:** timeline with dependency arrows
- **Params:** `project`, `filter`, `group_by` (`epic` | `assignee` | `none`)
- **Source:** `start_date` and `due_date` for bars; `depends` links for
  arrows.
- **Notes:** issues missing dates are listed separately rather than silently
  dropped — a Gantt that quietly omits half the work is worse than no Gantt.

### 9. Timesheet report

Per-day grid of logged time.

- **Chart:** table
- **Params:** `users[]`, `date_range`, `projects[]`
- **Layout:** users as rows, days as columns, totals on both axes; drill down
  to the individual work items in a cell.
- **Notes:** the date-range expansion in work-item entry (one row per working
  day) is what keeps this a simple grid rather than a range-overlap
  calculation.

## Implementation notes

- **Charting:** Recharts, using the shared colour palette so tag colours,
  status colours and chart series are one visual system in both light and
  dark mode.
- **Caching:** expensive reports cache in Redis with a short TTL. The key is
  the hash of **report name + canonical params + query AST + the caller's
  user id + the sorted set of project ids the caller may read + the per-org
  data version**. The user id is there because `me` and the user's timezone
  change the result; the readable-project set is there because two callers
  with the same query must never share a result one of them could not see.
  Permission scoping before aggregation protects the computation; this key
  protects the cache. Invalidated by org writes through the data version.
- **Export:** every report exports to CSV. The MCP tool returns the same data
  as markdown.
- **Permissions:** a report never reveals an issue the caller could not open
  directly. Scoping is applied before aggregation, not after.
- **Empty states:** a report with no data says what filter produced nothing
  and offers to widen it, rather than rendering an empty axis.

## As built in Phase 5 (API half, 27 Sep 2026)

Decided with the owner before building. The web half (`/reports`, `/reports/<report>`,
`/projects/PROJ/reports`, `/timesheets`) is a separate session.

### Routes

One route per report, each with its CSV twin, all `GET` and all *View reports* /
*Export report to CSV* (every role; a token needs `issues:read`):

| Report | Route | Parameters beyond the scope |
|---|---|---|
| Issues per assignee | `/v1/reports/issues-per-assignee` | `include_unassigned` (default true) |
| Issues per project | `/v1/reports/issues-per-project` | — |
| Issues per field | `/v1/reports/issues-per-field` | `field`, `by_category` |
| Matrix | `/v1/reports/matrix` | `row_field`, `column_field` |
| Burndown | `/v1/reports/burndown` | `project`, `sprint`, `measure` — no scope query |
| Average age | `/v1/reports/average-age` | `group_by` (a field or `none`), `unresolved_only` (default true) |
| Time | `/v1/reports/time` | `group_by`, the period |
| Gantt | `/v1/reports/gantt` | `project` (one), `group_by`, `q`, `view` |
| Timesheet | `/v1/reports/timesheet` | `users`, the period |
| Timesheet drill-down | `/v1/reports/timesheet/work-items` | `user`, the period, `limit`, `offset` |

`…/export.csv` exists for each of the nine. Shapes are the DTOs in
`packages/types/src/reports.ts` and `docs/openapi.yaml`.

- **Scope** is `q` (the search query language, `#{views}` included), `view` (a saved view by
  name, ANDed with `q`; an unknown one is `400 report.unknown_view` with the visible views) and
  `projects` (comma-separated keys; one the caller cannot read is `404`). The earlier `filter`
  parameter is `q`; the Time report's `sprints[]` is `sprint:` inside `q`, which already spans
  projects and checks names; `org` is the current organisation as everywhere.
- **One pipeline.** Every issue report runs through `search.context` → `compile` → the
  compiler's scoped predicate, and aggregates over that predicate
  (`packages/db/src/repositories/reports.repository.ts`). Grouping uses the list's own
  definition (`packages/db/src/search/issue-groups.ts`), so a report groups by
  `custom:<slug>` exactly as `group_by` does — empty label, "applies to the issue's type",
  statuses merged across projects by name.
- **Every group carries `query`**, the issue-list query for exactly the issues it counts (the
  scope plus the group's clause; a status category expands to its status names, a due bucket to
  its date range, an empty tag group to `has: -tag`). A matrix cell carries both clauses. Other
  has no query. The route tests check that each query's count equals the group's.
- **Empty results** answer `200` with `empty: {reason, message, filters}`. `message` comes
  from the catalogue, names the filter in the user's own words (*No issues match priority:
  Critical, in ACME.*) and never a request parameter; each filter carries the query without it
  (`widen_query`) or null when it is a parameter to drop (projects, period, people).
  Reasons: `no_issues`, `no_time`, `no_snapshots` (a sprint not yet started), `no_dates` (Gantt:
  issues exist, none has both dates).

### Series and limits

- **The API decides the series** (DESIGN-SYSTEM § 3.5). The eight largest groups get a slot
  1–8 (`--chart-N`), numbered in the field's own order — position for statuses, priorities,
  types and options, name for people, projects, tags and sprints — never by rank, so a colour
  follows its entity. The rest fold into Other. `palette` says what colours a chart: `series`,
  `label` (grouped by status: the statuses' own label colours) or `category` (by category).
  A filter that removes a series between two others renumbers the ones after it; accepted.
- Limits: 500 groups per table (`truncated`), 50 × 50 matrix axes (the rest merge into an
  `other` group), 500 Gantt bars and 500 missing-dates issues, a 62-day timesheet, a 366-day
  time report, 200 named users, 100 named projects. Over a limit is `400` naming it.

### Counting

- **Multi-valued fields** (assignee, tag, multi-select, multi-user) count an issue once per
  value. `total_issues` is distinct, `total_counted` is the bars' sum and
  `multi_valued_issues` how many issues have more than one value — the MCP table states it
  (*12 issues; 3 have more than one value, so the groups add up to 15*). Shares are of
  `total_counted`, so a pie adds up to 100%.
- **Group by category** (`by_category=true`, status only) gives the five status categories,
  merged across projects; `by_category_available` is true when the projects in scope name their
  statuses differently, which is when the web offers the toggle.
- **Average age** runs from `created_at` to `resolved_at`, or to now while unresolved — an
  instant difference, so there is no timezone — in calendar days to one decimal. Unresolved
  issues only unless `unresolved_only=false`.
- **Time** sums `work_items.duration_minutes` with `work_date` in the period on the issues the
  scope matches, never `spent_minutes`. A project whose Spent time is a custom duration field
  changes nothing here — that field mirrors the same rollup. Grouped by `work_type`, `user`,
  `issue`, `project` or `attribute:<Name>` (a work item attribute, merged by name; unknown is
  `400 report.unknown_attribute` with the ones in scope). **The estimate** is the project's
  Estimation field where one is chosen, else the built-in, summed over the distinct issues that
  have time in the period, and only for issue and project groupings — an issue's estimate cannot
  be split between people or work types, so those rows show none. **Difference** is estimate −
  spent (negative is over); **share** is the row's spent over the total. `estimate_sources`
  names each project's source.
- **The period** is `from` + `to`, or `period` in the query language's date words (`Last
  week`, `This month`, `2026-09`, `2026-09-01 .. 2026-09-14`) resolved in the caller's timezone
  and the organisation's week; neither is This week.
- **Timesheet**: one row per author, one column per calendar day (`working_day` marks the
  organisation's working days), totals both ways. `users` absent is everyone with time in the
  period; a named user gets a row even when it is empty. Anyone's time on an issue the caller can
  read is visible (*Read work items*). A cell drills down through
  `/v1/reports/timesheet/work-items?user=&from=&to=` (a one-day period).
- **Gantt**: an issue with both a start date and a due date is a bar; one missing either goes
  in `missing` with its group, never dropped. `dependencies` are `depends` links between two
  drawn bars (`from` is the prerequisite); each bar also lists `depends_on` among the report's
  issues. `group_by`: `epic` is the nearest live ancestor — or the issue itself — whose type is
  named Epic, else *No epic*; `assignee` is the first assignee by username, else *Unassigned*;
  `none` is one group. Groups are ordered by their earliest start.
- **Burndown** reads `sprint_snapshots` (UTC days) and, for an active sprint, today's figures
  read live with the same SQL as the snapshot job (`sprintsRepository.liveFigures`), marked
  `live`. `measure`: `story_points` (default), `issue_count` or `remaining_estimate`
  (the project's Estimation field where chosen). Per day: `remaining`, `scope` (the committed
  total), `scope_added` (net change since the first stored snapshot — snapshots hold totals, so
  it is net, not added and removed separately), `completed`, and `ideal` — a straight line from
  the first snapshot's remaining to 0 on the planned end date, falling only on working days.
  Days with no snapshot are null, never interpolated. The axis runs from the start (or
  `started_at`) to the end or completion, at most 366 days.
  `sprint_snapshots.total_estimate_minutes` gives the remaining-estimate measure its scope line.
  A burndown takes no query: snapshots are whole-sprint.

### Cache

- The key is sha256 of the report name, the canonical parameters, the expanded query AST, the
  caller's id, **timezone and today** (they change `me`, date words and due buckets), the
  sorted readable-project ids, and the organisation's **data version**.
- **The data version is a Redis counter per organisation**, `report:v:{org}`. The access layer
  records every organisation a request resolves (AsyncLocalStorage); an `onResponse` hook bumps
  each one after any successful `POST` / `PUT` / `PATCH` / `DELETE`
  (`@plugins/report-version`). One hook covers every route present and future, and MCP writes,
  which arrive as REST calls. It is coarse — a star bumps it too, and `#Star` does affect
  queries — but it cannot be forgotten. The nightly `sprint.snapshot` job bumps each
  organisation it writes to.
- **TTL five minutes**, which bounds how stale "now" can be in the age report.
- **Redis down means no cache**: a failed read, write or version read computes and serves the
  report, never an error. The CSV reads the same cached result as the JSON.

### CSV

The same figures as the JSON; headers are snake_case ids, durations read `1w 1d 1h 1m` with the
organisation's calendar, and a closing `Total` row where the report has totals:

| Report | Columns |
|---|---|
| Distribution | `label, value, issues, share` |
| Matrix | the row field, one column per column value, `total` |
| Burndown | `date, remaining, ideal, scope, scope_added, completed, live` |
| Average age | `group, value, issues, average_age_days, oldest_days, oldest` |
| Time | `group, value, spent, spent_minutes, estimate, estimate_minutes, difference, difference_minutes, share` |
| Gantt | `key, title, group, start_date, due_date, status, assignees, depends_on, scheduled` (missing dates follow, `scheduled` false) |
| Timesheet | `user, username, <each date>, total, total_minutes` |

A number keeps its sign; formula-leading text is quoted, as in every CSV.

### MCP

`run_report` with flat arguments — `report` plus the report's own parameters (`query`, `view`,
`projects`, `project`, `field`, `row_field`, `column_field`, `by_category`,
`include_unassigned`, `unresolved_only`, `group_by`, `sprint`, `measure`, `period`, `from`,
`to`, `users`, `user`) — so the kernel validates each and the generated reference lists them;
an argument that does not apply to the chosen report is refused by name with the ones that do.
It answers with the scope line, the table (the CSV's columns), the series the chart uses, the
totals statement, or the empty message with what to drop. `get_time_summary` is folded in:
`run_report` with `report: time` is the same data. No `report://` resource (a URI carrying
parameters is a worse `run_report`) and no new prompt (`standup-summary` and `sprint-report`
already cover time and burndown).

### Analytics

`report_viewed` (`report`, `via`, `empty`, `cached`, `group_count`, `project_count`) once per
user per report per UTC day, and `report_exported` (`report`, `via`) on every CSV — ids, enums
and counts only.

## As built in Phase 5 (web half, 27 Sep 2026)

Proposed to the owner before building; the visual choices were picked from rendered options. These are the decisions:

### Where they live

- `/reports` lists the nine as rows in three groups — *Issues*, *Sprints and schedule*, *Time* —
  each with its one-line description. `/projects/PROJ/reports` is the same list scoped to the
  project (without *Issues per project*): its links carry `?projects=PROJ`, or `?project=PROJ`
  for Burndown and Gantt, and the Burndown row names the active sprint and its days left. A
  report opened from a project is still `/reports/<report>?…`; there are no nested report
  routes.
- **Reports** and **Timesheets** sit in the sidebar's personal section; the project navigation
  already had *Reports*. `g r` opens the project's reports inside a project, else `/reports`.
- **`/timesheets` is the one timesheet page.** `/reports/timesheet?…` redirects to it with the
  same parameters. It shows the viewer (`users` absent means `me`) and This week; *Everyone* is
  `users=*`, which no username can be.

### The page

- Header: the report's name, *as of 8:48pm* (`generated_at`, with the zone in the tooltip) and
  **Export CSV**, disabled while the report is empty or failed.
- The scope row: the issue list's query bar (autocomplete, the at-fault span underlined, no
  *Save view*), then **View**, **Projects** and the report's own pickers in one wrapping row,
  with the display toggles on the right. Burndown takes no query; Gantt takes one project.
- A sentence under the pickers says what the figures cover: *242 issues in Partner Portal,
  Mobile app. 25 have more than one assignee, so the bars add up to 267.*
- Every chart has a table with the same numbers under it (or beside it for the pie); every
  label, count and cell links to the issue list for its `query`. Other is plain text.
- **URL.** Parameters carry the API's names and are left out at their defaults, so the
  address is the request. UI-only parameters: `chart=pie` (distribution), `chart=stacked` and
  `cells=length` (matrix), `zoom=month` (Gantt), `issue=KEY` (the Gantt's issue modal).
  Committing a query pushes a history entry; a picker replaces it.
- **Refetch** keeps the previous figures on screen at 60 % opacity. Report pages never poll.
- Burndown and Gantt without a project in the address take the last project visited, else
  the first, and write it into the address.

### States

- **Loading**: a skeleton shaped like the report (bars, grid, line, timeline, sheet).
- **Empty**: the API's `message` verbatim, then one button per filter: a clause is *Drop
  priority: Critical* (`q` = `widen_query`), a view drops `view`, projects is *Every project*,
  people is *Everyone*, `unresolved_only` is *Include resolved issues*. A **period** is
  widened by a longer one — *This month*, *This year* — because dropping it means This week
  again. The Gantt's `no_dates` shows the message above its missing-dates list, and its CSV
  stays available because it lists them. A sprint not yet started (`no_snapshots`) links to its
  backlog: *Start it from the backlog*. The scope sentence is left out while a report is empty.
- **400 on `q`**: the query bar's own error, and *Fix the query to see the report.* in the body. **400 on any other parameter** and **404**: an
  inline alert with the message and each `valid_values` entry as a chip that sets that
  parameter (a sprint chip becomes `PROJ/<name>`); a 404 on projects adds *Every project*.
- **Anything else**: *The report could not be loaded.* with the message and *Try again*.

### Charts

Recharts, painted from `markPaint` (`apps/web/lib/reports/colors.ts`): `--chart-N` for a
series, the status's `--label-*-solid` for `palette: label`, the category colours of the status
strip for `category`, `--border-strong` for Other; cancelled hatched, backlog faded. Text is
always a text token. Bars are at most 20 px with a 4 px rounded end; tooltips lead with the value.

- **Distribution**: horizontal bars in the API's order, value at the tip; or a donut with the
  counted total in the middle. *Statuses | Categories* appears for status when
  `by_category_available`. *Include unassigned* is a switch.
- **Matrix**: **Table | Stacked**. The table has sticky row headers, totals both ways, blank
  zero cells, and two cell styles the viewer picks (owner, 27 Sep 2026): **Shade** — five grey
  steps mixed from the text colour into the surface (`--heat-1…5`), capped so ink clears 4.5:1
  on every step in both themes — and **Length**, a hairline bar under each count proportional to
  the largest cell. Rows and columns swap with one button.
- **Burndown**: a stat row (committed at the start · scope added since, amber when non-zero ·
  completed · remaining · days left or finished), then Remaining (`--chart-1`, dots, the live
  day hollow), Scope (`--chart-2`, stepped) and Ideal (`--chart-ideal`, dashed), non-working days
  shaded, a *Today* rule, gaps where a day has no figure, and a *Daily figures* table on request.
  Remaining estimate reads `1w 1d 1h` on the axis.
- **Average age**: bars of the average with an ink rule at the overall average; the table names
  each group's oldest issue.
- **Time**: bars of spent time on round duration ticks; the table's Estimate is `--` where the
  grouping has none and Difference is signed, over the estimate in `--danger-fg`; the footnote
  names each project's estimate source, or says why a person or work type has none.
- **Gantt** (not Recharts): issues on the left, the timeline on the right in **Days | Weeks**,
  non-working days shaded, a *Today* rule, group bands linking to their list. Bars are neutral
  with the status category on a 4 px left edge (owner's pick, 27 Sep 2026), cancelled hatched,
  and a red end cap when an unresolved issue is past its due date. A dependency is an elbow
  arrow from the prerequisite's end to the dependent's start, red when the dependent starts
  before its prerequisite ends; hovering a bar lights its arrows. A bar or title opens the issue
  modal. **The missing-dates list is always drawn** under the timeline, with each issue's group,
  status and which date it lacks.
- **Timesheet**: a sticky person column and total column, weekday and date headings,
  non-working days tinted, blank zero cells (a sheet of `--` is noise), totals both ways; a
  month opens scrolled to today. A cell,
  or a person's total, opens a popover with its time entries, 50 at a time.
