# Reports

Nine reports turn your issues and logged time into numbers and charts. Every report is also
available to an AI agent through the [MCP tools](./mcp.md): `run_report` answers with the same
table the chart is drawn from, so an agent and a chart never disagree.

## Opening a report

- **Reports** in the sidebar lists all nine; press `g r` from anywhere. Inside a project, `g r`
  and the project's own **Reports** entry open the same list scoped to that project.
- **Timesheets** in the sidebar opens your own time for this week.
- The address holds every choice you make on a report, so copying it shares exactly what you
  see.

Across the top of a report:

- The **search bar** narrows it with a query, exactly as on the issue list.
- **View** picks a saved view, and **Projects** picks one or several projects.
- Then come the report's own choices: the field, the sprint, the period, the people.
- **Export CSV** downloads the numbers on screen.

A table with the same numbers sits under every chart. Hover a bar, slice or cell to read its
figure; click it to open the issues it counts.

## Choosing what a report covers

Every issue report is scoped the way you search:

- **A query** in the [search language](./search.md) — `type: Bug #Unresolved`,
  `sprint: {September 2026}`, `assignee: me`. Anything the search bar understands works here.
- **A saved view**, by name — *My open bugs*. A query and a view together narrow each other.
- **Projects** — one or several. Without them, a report covers every project you can open.

A report **never counts an issue you could not open yourself**: issues in projects you are not a
member of, deleted issues, and — for an agent — projects outside its access token are left out
before anything is counted.

Every bar, slice and cell leads to the issue list with exactly the issues it counts. A cell of
*Open × High* opens the list for `status: Open severity: High` within the same scope.

When a report finds nothing, it says which filter did it — *No issues match priority: Critical,
in ACME* — and offers to drop each filter in turn. A period is widened to *This month* or *This
year* rather than dropped.

## The nine

### Issues per assignee

How issues spread over the people they are assigned to. An issue assigned to both Alex Lee and
Casey Kim counts once for each, so the report states both numbers: *12 issues; 3 have more than
one assignee, so the bars add up to 15*. Unassigned issues are their own bar, which you can
leave out.

### Issues per project

How issues spread over the organisation's projects.

### Issues per field

How issues spread over any field: status, priority, type, assignee, tag, sprint, due date
(Overdue, Today, This week, Later, No due date), or a custom field — a select, multi-select,
person, people or checkbox field. Issues without a value are counted under the field's empty
label (*No Severity*), and a custom field counts only on the issue types it applies to.

When the projects in a report name their statuses differently, **group by category** adds them
up by the five status categories — Backlog, Unstarted, Started, Done, Cancelled — so *Fixed* in
one project and *Closed* in another both count as Done.

### Matrix

Two fields at once: status × assignee, priority × type, or any two custom fields. Each cell is
the number of issues with both values and leads to them. At most 50 values per side; the rest
are added up as *Other*. Pick **Rows** and **Columns**, or swap them with the arrows between.
**Shade** greys each cell by its size; **Length** puts a short bar under each count instead;
**Stacked** draws one bar per row value.

### Burndown

Remaining work across a sprint, day by day, against a straight ideal line that reaches zero on
the sprint's end date and falls only on working days. Measure it in story points, issue count
or remaining estimate.

The figures are recorded every night and when the sprint starts and finishes, so the chart
shows how the sprint really went even after issues are edited later; today's point is read
live. **Scope added after the start is its own line**, so *we finished nothing* and *they added
30 points on Tuesday* look different. A sprint that has not started yet has no figures. Choose the project and the sprint at the top;
**Daily figures** under the chart lists every day's numbers.

### Average issue age

How long issues have been open, per field value — from creation to resolution, or to now while
they are still open — in days. It looks at unresolved issues unless you include resolved ones,
and names the oldest issue in each group.

### Time report

Time logged over a period on the issues in scope, by work type, person, issue, project or one
of the project's work item attributes (*Billable*). It adds up the time entries themselves, so a
subtask's time is never counted twice through its parent.

Grouped by issue or project, each row also shows the estimate — the project's Estimation field
if it has chosen one — the difference (negative means over the estimate) and its share of the
total. An estimate belongs to a whole issue, so a report by person or work type shows no
estimate.

The period is two dates, or words the search language knows: *Last week*, *This month*,
*2026-09*, *2026-09-01 .. 2026-09-14*. It is this week unless you say otherwise, and covers at
most 366 days. To report on a sprint, add `sprint: {September 2026}` to the query.

### Gantt chart

A project's issues on a timeline, from start date to due date, with an arrow for every
*depends on* link between two of them. Group the bars by epic (the issue's nearest Epic above
it), by assignee, or not at all.

An issue without both a start date and a due date is **listed underneath, not dropped** — a
timeline that quietly leaves out half the work is worse than none.

Each bar is grey with its status on the left edge — amber once started, green when done — and
a red end when it is past its due date and still open. An arrow turns red when an issue starts
before the one it depends on ends. Click a bar to open the issue over the chart; **Days** and
**Weeks** change the scale.

### Timesheet

People as rows, days as columns, totals both ways — this week for you unless you choose other
people or dates, up to 62 days. Non-working days are marked. Open a cell to see the time entries
behind it — or a person's total, for the whole period. **People** adds colleagues or shows
*Everyone*. You see time logged on any issue you can open, whoever logged it.

## Colours

Each chart uses up to eight colours, given to the eight largest groups in the field's own order,
so a person or a priority keeps its colour however the numbers move. Anything smaller is added
up as *Other*. A chart by status uses the statuses' own colours.

## Exporting

Every report exports to CSV with the same numbers as the chart: durations read `1w 1d 1h 1m`
with your organisation's working day and week, and totals close the file. Anyone who can see a
report can export it.

## Asking an agent

`run_report` takes the report's name and the same choices by name — never an internal number:

- *"How are ACME's open bugs spread over people?"* — `issues-per-assignee` with the query
  `project: ACME type: Bug #Unresolved`.
- *"Show the September 2026 burndown in story points."* — `burndown` with `project: ACME`,
  `sprint: September 2026`.
- *"How much of last week went on testing?"* — `time` with `period: Last week`,
  `group_by: work_type`.
- *"What did Casey log on Tuesday?"* — `timesheet` with `user: Casey Kim` and that day.

The agent reads the same table and series the chart is drawn from, and when a report is empty it
is told which filter to drop.
