# Sprints, backlog and boards

Plan work in sprints, order it in the backlog, and follow it on a board. Everything here
is also available to an AI agent through the [MCP tools](./mcp.md).

## Sprints

A sprint belongs to one project and has a name, a goal (markdown), and a start and end
date. The dates are optional while you plan: a sprint without them reads _Unscheduled_.

A sprint is **planned**, then **active**, then **completed**. A project has at most one
active sprint at a time.

- **Planning one.** Give it a name, such as _September 2026_; its short name in links
  becomes `september-2026`. You can bring in every unresolved issue of another sprint at
  the same time - handy for picking up where the last one left off.
- **Starting it.** A sprint starts on the day you start it, even if it was planned for
  later; you can pick another day. It keeps its planned end date, and needs one: it drives
  the _N days left_ countdown.
- **Finishing it.** You choose where the unfinished issues go - back to the backlog or
  into a planned sprint. Nothing is ever left behind by default. Resolved issues stay
  with the finished sprint, so it keeps an honest record of what it delivered. Each moved
  issue's history shows _Sprint: September 2026 → October 2026_.
- **Deleting one.** Only a sprint that has not started can be deleted; its issues go back
  to the backlog.

An issue is in **one sprint at a time**, or in none (the backlog). Moving it between
sprints is recorded in its history.

Only a Project Admin (or an organisation admin) plans, starts, finishes and deletes
sprints. Anyone who can edit issues - Contributors and up - can move issues into and out
of sprints and reorder them.

### Progress and burndown

A sprint shows how many of its issues and story points are resolved, how much estimated
work is left, and how its issues spread over the statuses. Every night, and when the
sprint starts and finishes, those figures are recorded, so the burndown chart shows how
the sprint really went even after issues are edited later.

## Story points

Any issue can carry story points, a whole number from 0 to 999. An issue with subtasks
also shows the points of everything beneath it added up. Set them, and the sprint, in the
issue's sidebar or when you create it; an issue without points reads _Not estimated_, one
in no sprint _Unscheduled_. The issue list can show a _Story points_ and a _Sprint_
column and group by sprint. Search them with
`story points: 3 .. 8`, or find the unpointed ones with `story points: {No story points}`.

## The backlog

The backlog is every issue in no sprint. You put issues into a sprint, or take them out,
by dragging, and you drag within a list to set its order. The order is kept separately for
the backlog and for each sprint, and the board shows cards in the same order. A new issue
starts at the bottom of its list.

Search helps here too: `sprint: {No sprint} #Unresolved` is the backlog as a query, and
`sprint: {September 2026}` or `#{September 2026}` everything in a sprint.

### The Backlog page

Open **Backlog** under the project in the sidebar. The running sprint comes first, then
every planned sprint, each as a section you can fold away: its dates (or _Unscheduled_),
the days left on the running one, and how many of its issues and story points are
resolved. The backlog is last.

- **Dragging.** Grab a row by the grip that appears at its left and drop it where it
  should go - higher or lower in the same list, or into another sprint or the backlog. A
  thin line shows where it will land. With the keyboard: focus the grip, press `Space`,
  move with the arrow keys, `Space` again to drop.
- **Filtering the backlog.** The query bar above the backlog narrows only the backlog; it
  starts as `#Unresolved`, so resolved issues stay out of the way. Sprint sections always
  show every issue in the sprint.
- **New sprint** asks for a name, an optional goal and an optional schedule - pick the
  first and the last day on the calendar, or leave it _Unscheduled_. Tick _Add N
  unresolved issues from “…”_ to bring over what is still open in the running sprint (or
  the last planned one).
- **Start sprint** takes today as the first day unless you pick another, and asks for the
  last day if the sprint has none. Only one sprint runs at a time.
- **Finish sprint** lists the backlog and every planned sprint; pick where the unfinished
  issues go. Nothing is chosen for you.
- A sprint's **⋯** menu edits its name, goal and dates (a running sprint keeps its dates)
  or deletes a planned one.

Observers see the page but cannot drag. Contributors drag and reorder. The sprint buttons
and menus appear only for Project Admins.

## Boards

A board shows one sprint - by default the active one - or every open issue in the project,
as columns of cards.

- **Columns** are statuses, priorities or types - you choose which in the board's settings.
  A column can hold several values (_Open_ and _Reopened_, say); a status column whose
  statuses all resolve an issue is marked _resolved_. A value that is on no column has no
  cards on the board, and the board says how many issues it hides. Moving a card to another
  column changes that field of the issue - its status, priority or type. Switching a board to
  priorities or types starts it with one column per value.
- **Counts follow the filter.** Type a query above the board and every column's count, and
  the status strip, count only the cards that match.
- **WIP limits.** A column may have a minimum and a maximum number of cards. They are
  warnings - the column is flagged when it is over or under - and never stop anyone moving
  a card. They count every card in the column, whatever the filter.
- **Swimlanes** split the board into rows:
  - _No swimlanes_.
  - _Values_ - one row per assignee, priority or type (not the field the columns already
    use). A card with several assignees sits in the row of the first one, alphabetically,
    and still shows everyone.
  - _Issues_ - one row per issue of the types you choose, usually _Epic_; each card sits
    in the row of its epic. Cards with no row go in _Uncategorized_, always last.
- **Collapsed columns.** A column can be set to start collapsed.

Every project starts with one board, named after the project, with three columns - _To
do_, _In progress_ and _Done_ - and a row per epic. A Project Admin can change it or add
more boards in the project's settings, under **Boards**.

Cards show the issue's key and title, its priority and type, the people on it, the due
date, up to three tags, story points and subtask progress. The coloured left edge is the
priority.

### Using the board

Open **Board** under the project in the sidebar, or press `g` then `b`. The address names
the board and the sprint - `/projects/PP/board/pp/current` follows whichever sprint is
running, `/projects/PP/board/pp/sprint-17` stays on that one - and `/board/pp/current` is
the short form.

- **The header** has the sprint picker (running, planned and finished sprints), its dates,
  the days left (red under three days, _Ended 4 days ago_ once the end date has passed and
  the sprint is still open), _Start sprint_ or _Finish sprint_ for Project
  Admins, a strip counting the cards by what the columns show - statuses, or priorities or
  types on a board set up that way; hover a segment for _6 cards in status In Progress_ - and
  the story points resolved.
- **The filter** takes any query. Column counts read _3 of 8_ when the filter hides some
  cards; the WIP limits still count all eight.
- **Opening a card.** Double-click it, or focus it and press `↵`, to open the issue over the
  board - everything on the issue page works there, and _Back_ closes it. Click the key to
  open the issue in a new tab.
- **Quick edits.** Click the people on a card to assign someone else or nobody, and the due
  date (or _No due date_) to pick another day.
- **Moving a card** to another column gives it that column's first value - its status, or
  its priority or type on a board whose columns are those. Cards move
  within their own row; dropping into another swimlane is not possible, because that
  would change the assignee, priority or epic instead.
- **New card**: hover a cell and click _New card_, type a title and press `↵`. The issue
  is created in this sprint, with the column's status, and in a swimlane with that
  swimlane's assignee, priority, type or epic as its parent.
- **Folding.** Click the arrow in a column header to fold the column to a narrow strip,
  and the arrow on a swimlane to fold the row.
- A column over its maximum shows its limit in red; under its minimum, in amber. Cards in
  a status on no column are listed above the board with a link to add a column.

When no sprint is running, the board shows the planned sprint whose dates include today
(or the first planned one), marked _Not started_, with _Start sprint_ for Project Admins.
With nothing planned either, it shows _All open issues_. The sprint picker opens any planned
or finished sprint, and _All open issues_ at the top.

**All open issues** is the board for a team that does not run sprints: every unresolved
issue in the project, in a sprint or in the backlog. Resolved issues (_Done_, _Duplicate_,
_Won't fix_ and the rest) leave it, so the resolved columns stay empty; drag a card into one
to resolve it. A card added from the board goes to the backlog. The address ends in `/open`.

### On the dashboard

**Home → My work** lists the running sprints you have issues in, with the days left, the
status strip and how many of your own issues are resolved. On **Projects**, each project
card shows its running sprint the same way, and the project's own page has an _Active
sprint_ section with its goal and points.

### Board settings

**Settings → Boards** (Project Admins) lists the project's boards - add, rename or delete
one; deleting a board leaves issues and sprints untouched. For the selected board:

- **Columns are identified by** _Status_, _Priority_ or _Type_. Switching rebuilds the
  columns, one per value.
- **Columns**, one row each, in order. Drag a row by its grip (or Alt+↑/↓) to reorder,
  click the pencil to rename, set _Min_ and _Max WIP_, tick _Collapsed_ to start it folded,
  and use _Merge with_ to fold another column into this one - a merged column lists its
  values, and the × on one splits it back out. The × at the end of the row deletes the
  column. _Add column_ offers the values that are on no column yet.
- **Swimlanes are identified by** _No swimlanes_, _Values_ of a field (assignee, priority
  or type) or _Issues_ of the types you list (usually _Epic_).
