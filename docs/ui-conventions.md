# UI Conventions

Standards that apply across every screen. These are product decisions, not
suggestions — consistency is a large part of "simple and easy to use".

## Date and time

**There are no user preferences for date or time format.** One standard,
everywhere.

| Case | Format | Example |
|---|---|---|
| Date | `D MMM YYYY` | `19 Sep 2026` |
| Time | `h:mma` lowercase, no space | `8:48pm` |
| Date + time | | `19 Sep 2026, 8:48pm` |
| Tooltip | date + time + timezone | `19 Sep 2026, 8:48pm IST` |

### Relative vs absolute

Under 7 days old → relative. 7 days or older → absolute.

```
just now
12 minutes ago
5 hours ago
3 days ago
19 Sep 2026          ← 7 days and older
```

**Every relative timestamp carries a tooltip with the full absolute value.**
"2 months ago" is useless when you need the date; the hover always answers it.

### Storage and conversion

- Instants stored as `timestamptz` in UTC, rendered in the viewer's timezone.
- Timezone comes from the user profile, seeded at first login from
  `Intl.DateTimeFormat().resolvedOptions().timeZone` and overridable.
- **Calendar dates — `due_date`, `start_date`, `work_date` — are never
  timezone-converted.** A due date of 19 Sep reads as 19 Sep for every user
  on earth. Stored as `date`, rendered as-is.

### Durations

Input and output use the `1w 1d 1h 1m` format, resolved against the organisation's
workday and workweek settings:

```
1w 1d 1h 1m      3d      1h 30m      45m
```

Stored as integer minutes. Never shown as a decimal. `parseDuration` and
`formatDuration` in `packages/format` are the one implementation, shared by
the API, the MCP server, the query parser and the web app.

## Colour

Two fixed palettes, both token names, never free hex:

- **Label colours** — 40 swatches, 8 families (`gray red orange yellow green teal blue
  pink`) × 5 shades from pale (`1`) to deep (`5`), named `green-1` … `pink-5`. Used by
  statuses, priorities, issue types and tags (tags decided 24 Sep 2026, 1d). The picker is the 8 × 5 grid of
  `a` swatches; a person picks a background and the text colour comes with it
  (decided 24 Sep 2026).
- **The 14-hue palette** — project avatars, feedback (danger, warning, success) and
  chart series.

Reasons: free hex produces unreadable combinations in dark mode, makes charts
look arbitrary, and lets two tags end up indistinguishable. A fixed palette
keeps the whole product one visual system and guarantees contrast in both
themes.

**Values live in `design/tokens.css`**, generated and validated by
`design/scripts/palette.mjs`. See `design/DESIGN-SYSTEM.md` for the system and
[frontend.md](./frontend.md) for how it binds to the code. Never restate
colour values elsewhere.

### Compact badges

Priorities, types and statuses each carry a `short_label` of one character
rendered as a square in the value's label colour — `M` on yellow for Major, `B` on
red for Bug. Used in dense contexts: issue lists, board cards, link lists. Work types
have a letter but no colour.

Seeded priority colours are the owner's: Show-stopper `red-3`, Critical `pink-3`,
Major `yellow-2`, Normal `green-1`, Minor `gray-4`.

## Empty values

Every nullable field displays a specific label rather than a blank — its empty
value. The same string is used by the UI and the
MCP, so a human and an agent describe the field identically.

| Field | Empty label |
|---|---|
| Assignee | `Unassigned` |
| Due Date | `No due date` |
| Start Date | `No start date` |
| Estimation | `?` |
| Spent time | `?` (owner, 25 Sep 2026: the same as Estimation) |
| Story points | `Not estimated` |
| Sprint | `Unscheduled` |
| Custom field | per-field `empty_label`, defaulting to `No <field name>` |

These are the labels of the issue page sidebar, where the field name sits above the
value. In the create dialog's chip row, where it does not, an unset estimate reads
`Estimation` instead of `?` (decided 24 Sep 2026). **In the issue list, every
empty cell renders `--`** — a column of labels is noise where a column of
values is expected (decided 24 Sep 2026). The API returns `null` for every
empty value and never a label; display is the client's concern.

## Issue page

Layout follows the reference screenshots.

**Header:** breadcrumb `Projects / <Project> / Issues / PROJ-123` with a
copy-key button. Below it, provenance: *"Created by X about 2 months ago ·
Updated by Y 12 days ago"*. Right side: star (favourite, implies watch) and
vote with count.

**Title row:** title, then inline actions — edit, tag, link, and an overflow
menu (move, clone, delete, copy link, watch). For someone who may edit it, the title wears the
sidebar's standing cue — a dotted rule under the text, darker on hover, with *Click to
rename* in a tooltip — and the description editor spans the whole main column with a
320 px minimum text area (owner, 25 Sep 2026).

**Parent:** a *Subtask of* line above the title — type badge, key (struck through when
resolved) and title — with change and remove on hover. The overflow menu offers *Set
parent* (or *Change parent*) and *Create subtask*; the picker lists only issues in the
same project. *Create subtask* opens the create dialog with the parent filled in, shown
as a removable *Subtask of PROJ-12* chip (decided 24 Sep 2026, 1d).

**Tags:** rendered as chips directly beneath the title, each with an inline
`×` to remove and a trailing `+` to add. Not buried in the sidebar — tags are
scanned, so they belong where the eye already is. The `+` (and the tag icon in the
title row) opens a searchable picker of the organisation's tags; selecting one toggles
it. A name that matches no tag offers *Create*, which asks for its colour from the same
8 × 5 label grid statuses and types use before creating it (owner, 24 Sep 2026; the 40
label colours replaced the 14 hues for tags the same day). The chip's `×` appears on hover or
focus, only for people who may remove it.

**Body:** rendered markdown description, inline-editable.

**Links section:** tabbed by link type with counts — `Relates to 1`,
`Parent for 3` — and an `Add links` action. Each linked issue shows its star,
a coloured type badge, its key, and its title. **Keys of resolved issues
render struck through**, so a list of subtasks communicates progress at a
glance. Beside `Add links` sits `Create subtask`. The star toggles in place; a
row's `×` (hover, editors only) removes that link without asking, since it is
one click to add back. `Add links` is a dialog: the link name as a choice with a
one-line meaning under it, then any number of issues found by key or title; a
refusal (a `depends on` cycle, a second parent) is shown inside the dialog and
nothing is linked. With no links, the section says so and offers `Add links`; a
reader who cannot edit sees no section at all.

**Attachments section:** count, plus a *Hidden files N* note for attachments
already shown inline in the description or comments, with a toggle to reveal
them. `Attach files` action. As built in 1f (owner decisions, 25 Sep 2026):

- **The header** reads `Attachments N · Hidden files M  Show`: N counts the files
  listed, M the ones hidden because the description or a live comment already shows
  them (the API's `inline`); *Show* / *Hide* toggles them into the list. There is
  no overflow menu — nothing needs it yet.
- **No files, no section**, for everyone. *Attach files* is then the paperclip among the
  title-row actions (edit, tag, link), which is always there for someone who may upload.
  The section appears as soon as an upload starts, so its progress has somewhere to show.
- **Tiles.** Images (PNG, JPEG, GIF, WebP, AVIF) as 192 px thumbnails with name and size
  under them; every other file, SVG included, as a download tile — a neutral type square
  (`PDF`, `CSV`), the name and the size. A PDF opens in a new tab; the rest download. The
  tooltip says who attached it, where (*on a comment*, *on spent time*) and when.
- **Clicking an image** — a thumbnail or an image in rendered markdown — opens a
  full-screen lightbox on the dark panel surface, the same in both themes (owner, 25 Sep
  2026): name, size, dimensions and *N of M* top left; zoom
  `−` / fit % / `+` top centre (`+`, `−`, `0` on the keyboard; fit never enlarges a small
  image); close top right (`Esc`); `‹` `›` and `←` `→` through every image on the issue;
  a thumbnail strip along the bottom; *Copy link* and *Open in new tab* bottom left;
  delete bottom right for whoever may, confirmed as below. The image is a plain `<img>`
  and the thumbnail a real link, so right-click → *Open in new tab* and ⌘-click still
  work.
- **Delete** is a `×` on the tile's corner, on hover or focus, only where `me.can_delete`
  says so (own files for a Contributor, anyone's from Project Admin; never an Observer).
  It always asks first, naming the file — a deleted file cannot be restored, and one shown
  inline stops loading where it is shown.
- **Files can be dropped onto the section** as well as onto an editor; files attached
  there go on the issue without being placed in any text.
- **Storage banners** (limits-and-billing.md § Storage) show here, above the tiles, from
  80%: amber at `warning` and `critical`, red at `full`, which names both ways out (delete
  files; connect your own R2 or S3 bucket) and links organisation settings. They show in
  organisation settings too, and nowhere else — not above every editor. An upload refused
  at 100% says so in the upload's own row.
- **Observers** see the tiles, open and download, and nothing else: no *Attach files*, no
  drop target, no `×`.

**Activity:** tabs for All / Comments / Spent time / History, all reading
`issue_activity` filtered by `kind` — except Spent time, which lists the work items
themselves (`GET …/work-items?include=subtasks`), as Comments lists the comments. The
Spent time tab carries its total in the tab (`Spent time 1d 15m`) and above the rows
(`Total 1d 15m of 2d estimated · 5 records`), then one row per record in date order:
author, date, the subtask's key when the record is on a subtask, *logged by* when
someone else recorded it, the note, the work type's letter and the duration. Its rows
add up to the total because they include the subtasks' (owner, 25 Sep 2026). Edit and
Delete sit in the row's menu on hover for whoever may use them; Delete asks first, since
a record does not come back. History shows `Spent time: added 2h Development · 21 Sep
2026 · for Casey Kim`, an edit as what moved (`1h 30m → 3h`), a removal struck through. Field changes render as
`Status: Open → In Progress`; links, tags and the parent in the same form —
`Links: added depends on PROJ-3`, `Tags: removed billing`, `Parent: None → PROJ-1`.
Comments carries its count and reads `GET …/comments`; All shows each comment where
it was written, with no separate *edited a comment* line (the comment's own *edited*
marker says it, with the time in its tooltip); History leaves every comment kind out.
A comment's menu (Edit, Delete) appears on hover for those who may use it; Delete asks
first — the comment disappears for everyone and cannot be restored — and the history
then keeps only *deleted a comment*.

Entries are **grouped by `change_group_id`**, so several changes made in one
save read as one entry rather than a stream of one-liners:

```
Alex Lee · Updated 3 months ago
    Estimation:    ? → 4h
    Story points:  Not estimated → 5
    Priority:      Normal → Major
```

A comment saved alongside a field change renders as a single unit, with the
change shown in a bordered block beneath the comment body. A vertical
connector line joins entries from the same actor in the same session.

Entries are also **coalesced**: the same actor changing the same field again
within five minutes updates the existing entry rather than adding one, and a
change that reverts to its original value removes the entry entirely. An
assignee set wrongly and corrected twenty seconds later leaves one clean
line, or none. See [data-model.md](./data-model.md).

**Sidebar:** Project, Priority, Type, Status, Assignee, Sprint, Due Date,
Estimation, Spent time (with a `+` to log time), Story points, Boards, then
any custom fields. As built in 1e (25 Sep 2026): Spent time reads `3h of 4h` with a
4px meter under it; past the estimate the meter turns red and `· 1h over` follows in
the danger colour — the one place the field wears colour. With no estimate it shows the
spent time alone; with nothing logged, `?`, as Estimation does. The value is the rollup, so an
epic's includes its subtasks'. When the project's time tracking is off, Estimation and
Spent time leave the sidebar, the Spent time tab and the composer's *Add spent time*
disappear, and the create form drops its Estimation chip; nothing logged is lost. Every field is inline-editable without opening a dialog.
Assignees show avatars; Priority and Type show their coloured letter badge
alongside the name. Tags are not in the sidebar — they sit under the title.

Empty values render as their configured label in the same muted style as a
real value, never as a blank: `No due date`, `Not estimated`, `?` for an
unset duration.

**Deleting an issue** asks first — *Delete PP-123?*, naming the issue and stating that it
leaves the project for everyone and can be restored for 14 days — and then goes at once,
with a toast offering *Undo*. Revised 24 Sep 2026 at the owner's request: a deletion is
still reversible, but it is the one action on the page that removes something other people
are looking at, so it is confirmed like every other action that affects other people
(design § 9). Project Admins find everything still restorable, with its *restorable until*
time, under project settings → *Deleted issues*. Archiving a project is confirmed the same
way, wherever it is offered.

**Archived projects** show a one-line notice above the provenance; every field is
read-only, while star, vote and watch keep working.

## Create-issue dialog

Opened with `c` or *Create issue* in the top bar (decided 24 Sep 2026):

- Project chip in the header. Preselected: the project the current page is about, else
  the last project the viewer created into, else their first writable project.
- Title, with its quick actions on the right of the same line, then the description in
  the markdown editor (§ Comment editor); the title's underline and the editor share one
  width. The tag action opens the tag picker and the chosen tags sit under the title as
  chips; a new tag is created with the issue, in the colour picked for it.
- On the full page only, a link action beside the tag action opens an *Add links*
  section under the description — a link name and any number of issues, each shown as
  a row until the issue is created. The quick dialog leaves links to the issue page
  (owner, 24 Sep 2026). Tags and links are sent with the create request, so a refused
  link creates nothing.
- One row of compact chips — Type, Priority, Status, Assignees, Estimation, Start date,
  Due date — each showing the project default or the empty label until changed.
- An expand button opens the same draft at `/new-issue`, a full page with the text on
  the left and the issue page's field column on the right.
- `⌘/Ctrl + Enter` creates. A toast names the new key with an *Open* action; *Create
  more* keeps the dialog open for the next one.

## Project value lists

Statuses, priorities, types and work types share one list: drag the grip or press
`Alt + ↑/↓` to reorder, click the name to rename, click the badge for colour and
letter, and the row menu for *Make default*, *Archive* and *Delete*. Deleting a value
issues still use asks where to move them, offering only the values that can receive
them.

## Comment editor

The same editor component is used for issue descriptions, comments, work-item
notes and project descriptions.

**Toolbar:** block type (`Normal text` / H1–H3), bold, italic, strikethrough,
text colour, quote, inline code, link, bullet list, numbered list, task list,
code block, table, image. As built in 1d (owner, 24 Sep 2026): **text colour is left
out** until markdown has a syntax for it;
inside a table the table button becomes a menu to add or delete rows and columns. As built
in 1f (owner, 25 Sep 2026): the image button is a paperclip, *Insert image or file*, and
takes any file — the composer has no other picker. It is disabled, saying why, when the
server has no file storage (`Organization.storage.configured` false, or a presign answered
`storage.not_configured`). In Markdown mode the same buttons edit
the source text (wrap the selection, prefix the lines).

**Mode toggle:** `Visual | Markdown`. Visual is WYSIWYG; Markdown is the raw
source. Both serialise to the same markdown, and **markdown is the only thing
stored**. The last mode chosen is remembered per viewer, in the browser.

**Actions:** `Add comment`, `Cancel`, and `Add spent time` (opens the
spent-time dialog pre-linked to this issue). `⌘/Ctrl + Enter` saves, `Esc` cancels,
`⌘/Ctrl + K` opens the link box. `Add spent time` opens the dialog below for the
issue; it is absent for anyone who cannot log time there and in a project that does not
track it (1e). `Cancel` appears once there is text to throw away.

**Deliberately omitted:** the per-comment visibility dropdown ("Visible to
same as issue") and the AI assistant button. Comment visibility always
follows issue visibility.

**Uploads:** drag-drop and paste upload straight to R2 via presigned PUT. As built in 1f
(owner decisions, 25 Sep 2026):

- **Drop, paste or pick, in Visual and Markdown mode, several files at once.** A drop in
  Visual lands where the file fell; everything else at the caret. A paste that carries
  text as well as a picture (cells copied from a spreadsheet) pastes the text.
- **The text holds a placeholder while the file travels**: an image shows at once, dimmed,
  from the local file; any other file as the link *Uploading report.pdf…*. In Markdown
  mode that is `![Uploading name…](…)`. When the upload finishes the placeholder becomes
  `![name](url)` for an image the browser can show, `[name](url)` for anything else — the
  permanent URL, never a presigned one.
- **Progress and cancel** sit in a tray under the text, one row per file: *Preparing…*
  (hashing), `96 KB of 250 KB · 38%`, *Finishing…*, and a `×` that cancels (the pending
  upload is deleted, its placeholder removed). A refused file stays in the tray with the
  reason and, where trying again can help (storage lost the bytes, the connection dropped),
  *Retry*; its placeholder leaves the text.
- **Too large** (over 100 MB) is refused before anything is sent, in the same words the
  API uses.
- **Saving waits for uploads.** The save button reads *Uploading…* and is disabled until
  every file has finished, so no placeholder is ever stored.
- **Where a file attaches.** The description of an existing issue, a comment being edited
  and a time entry being edited attach at once, to the issue, comment or work item — and
  stay attached (listed in the section) if their link is later deleted from the text. The
  create-issue dialog and page, a new comment and a new time entry upload **drafts**, sent
  in `attachment_ids` on save; a draft whose link was deleted from the text before saving
  is deleted rather than claimed (owner, 25 Sep 2026). Cancelling a new comment deletes its
  drafts. The dialog's expand button carries finished drafts to the full page.
- **Rendered images reserve their box**: `<Markdown>` passes the issue's files'
  `width` / `height` to the renderer, which writes them on the `<img>`, so nothing reflows
  as images arrive. Images are bordered blocks at most the prose width; inside the editor
  they are capped at 20rem tall.

**Mentions:** `@` opens a member picker; `PROJ-123` autocompletes to an issue
link. Both render as links. `@username` is extracted into `mentions` at save
time; issue references are resolved when rendered and never stored.

The pickers read (decided 24 Sep 2026, 1d): `@` from
`GET /v1/projects/{key}/assignees` — the live members who can open the issue,
so former members are never offered — while a typed `@name` of any live member
of the organisation is still stored as a mention; `#` from
`GET /v1/issues/refs?q=&project=`, inserting the chosen key. Rendered
`PROJ-123` references take their title and struck-through state from
`GET /v1/issues/refs?keys=`.

Both pickers work in Visual and Markdown mode (owner, 24 Sep 2026), open when `@` or `#`
follows a space or starts a line, and insert plain text — `@username` or the key — so the
stored markdown holds nothing but what a person could have typed. `↑↓` move, `↵` or `⇥`
insert, `Esc` closes. Hovering a rendered key shows a card with its type, key, status and
title (owner, 24 Sep 2026); a key the reader cannot open renders as plain text. A task
checkbox in rendered text is clickable only for someone who may edit that text.

## Spent-time dialog

Matching the reference screenshot:

- **Author** selector (defaults to the current user; a Project Admin may log
  on someone else's behalf)
- **Single dates** / **Date ranges** toggle
- Date picker + duration field with placeholder `1w 1d 1h 1m`
- `+ Add another record` for several entries at once
- **Type** dropdown — Development, Documentation, Implementation,
  Investigation, Testing
- Markdown note: *"Describe what you did during this time"*

Date-range mode expands to one record per working day.

As built in 1e (owner decisions, 25 Sep 2026):

- **Author** is a picker only for a Project Admin, listing
  `GET /v1/projects/{key}/work-authors` (Contributors and above — never Observers);
  everyone else sees their own name, not a control.
- **Single dates | Date ranges** is the segmented control. Each record is a row: the
  date (or the range, picked first day then last on one month grid, with *N working
  days* beside it) and the time — `Spent time`, or `Per day` in range mode, because a
  range's duration is written on every working day. `×` removes a row once there are
  two; *Add another record* (up to 20) adds one, and below it the dialog counts the
  records it will write and their total (`7 records · 1d 5h in total`).
- **Type** starts at the project's default work type; *No type* is the last choice.
- Validation is ours, on Save and then live: a missing date, a range with no working
  day or over 62 days, and a duration that is not `1w 1d 1h 1m` each put a red border on
  the field and one line under its row. An error from the API lands on the row or field
  it names (`records.1.duration`), else in an alert at the top.
- The dialog is as wide as the create-issue dialog (1f), so the note's editor toolbar —
  now with the paperclip — fits on one line; files in a new record's note are drafts,
  claimed by the first record written.
- `⌘/Ctrl + Enter` saves from anywhere in the dialog. Editing a record opens the same
  dialog titled *Edit spent time*: one row, no range mode, no *Add another record*.

## Board

- Header: sprint selector, date range, `Start sprint` / `Finish sprint`
- **Status distribution strip** with hover detail (*"58 cards in status
  Open"*), recomputed against the active filter
- Days-left countdown
- Column headers with live counts that **respect the current filter**, not the
  raw total
- Collapsible columns, optional WIP limits
- Swimlanes, including an *Uncategorized Cards* lane
- Cards: coloured left edge by priority, key, title, assignee avatars,
  priority and type dots, due date, subtask progress (`1/3`), inline `+` to
  create in that column

Built in Phase 3 (26 Sep 2026). Decisions taken there:

- **Cards** (revised by the owner, 26 Sep 2026) carry every assignee's avatar (name on
  hover), the priority and type as a coloured dot and the value's name — not letter
  badges, which read as noise on a card — the due date or _No due date_, up to three tags
  as neutral chips (as many as fit about 28 characters, the rest as `+N`), story points as
  a neutral mono chip (nothing when unpointed) and subtask progress when there are
  subtasks. Resolved cards strike the key and title through, like list rows.
- **On a card**, the avatars open the assignee picker (_Unassigned_, _Me_, then the
  project's people) and the due date opens the calendar with _Apply changes_ / _Cancel_,
  for Contributors and up. The key opens the issue in a new tab; a double-click, or `↵` on
  a focused card, opens it in a modal over the board (`?issue=PP-123`, so Back closes it).
  `Space` picks a focused card up for a keyboard drag.
- **Copy** on an issue (the breadcrumb, the modal) copies the key and the title:
  `PP-123 Title`.
- **No running sprint**: `…/current` shows the planned sprint whose dates hold today, else
  the first planned one, marked _Not started_ with _Start sprint_ for Project Admins.
- **A drag stays in its lane.** Moving a card sets the target column's first value of the
  board's column field (status, priority or type) and nothing else; changing lanes would silently change the lane's field, so other lanes
  do not accept the drop.
- **Inline creation** is per cell (_New card_ on hover), not per column header: the new
  issue takes the sprint, the column's first status and the lane's value (assignee,
  priority, type) or parent (issue lanes).
- **Column counts** read `count` alone, or `count of total` when a filter hides cards;
  WIP limits show as `min 2 · max 4`, red over the maximum, amber under the minimum.
- **The strip follows the column field** (owner, 26 Sep 2026): by status on a status board,
  by priority or type on those boards, so it summarises what the columns show.
- **Page actions are outlined buttons with an icon** (_Backlog_, _Board settings_, _Board_),
  not bare text, so they read as controls.
- **Days left** turns `--danger-fg` under three days; `0` reads _Ends today_.
- **Backlog**: the filter bar narrows the backlog container only (default `#Unresolved`);
  sprint sections always list every issue. Rows are dragged by a grip, so the title stays
  a link. _New sprint_ leaves _Add N unresolved issues_ unticked: carrying issues out of
  a running sprint is a choice, not a default.

## Knowledge base

Built in 3.5 (27 Sep 2026); these are the decisions taken building it:

- **Layout.** A 272 px rail beside every knowledge base page, on the surface with a hairline, sticky and
  scrolling on its own: _Knowledge base_ (home) with `+` for a new article, _Starred_ (the reader's starred
  articles in this project), _Articles_ (the tree), _Tags_ (the tag cloud) and, at the bottom, _Deleted
  articles N_ — shown only when there is something the reader may restore, and opening the list in the main
  column (`?view=deleted`). Below `lg` the rail opens as a sheet.
- **The tree.** 28 px rows indented 14 px per level, a chevron on rows with children, the open article in
  `--bg-active` with the 2px accent bar like the navigation. Drafts read in secondary ink with a dashed
  _Draft_ mark, never a colour. On hover, for someone who may: `+` (a new article under this one, above
  level 3) and a grip. A drag shows the row beside the pointer; the landing line is the accent, a nest is
  the soft accent with an accent ring, and a place that would pass three levels draws in the danger colour
  and is refused under the row. `Alt` + arrows on a focused title move it without a mouse.
- **The article page.** _Last updated by X, 3 days ago_ (and _Written by Y_ when that is someone else) with
  star and the `⋯` menu on the right; the title (click to rename, the address stays), then edit, tag and
  _Publish_ for a draft; tags as chips in their colour under the title; the body at 15 px in the 72ch column;
  comments under a hairline. A draft carries a one-line inset notice naming who can see it. The menu holds
  _New article under this_, _Return to draft_, _Change address_, _Copy link_, _Watch_ and _Delete article_.
- **Table of contents.** From the body's headings, pinned beside the article from 1280 px wide and only with
  two or more headings; the heading last scrolled past is marked with an ink rule.
- **Breadcrumb.** The top bar's crumbs continue into the tree: `Projects / Partner Portal / Knowledge base /
  Payments / Runbooks / Restoring a failed sync`.
- **New article** asks for the title first, because the address is made from it and a rename never moves
  it; then a starter (Runbook, Decision record, Onboarding guide, Blank) and a place. It is always a draft,
  and opens in the editor. The empty knowledge base offers the same four starters; an Observer reads that
  there are no articles yet.
- **Deleting** is a dialog that asks up front, when the article has articles under it, whether to _move them
  up_ (named: under which article, or the top level) or _delete them too_ (_Delete branch_). A refusal shows
  in the dialog in the API's words; the deletion toasts _Undo_.
- **Search** is the issue query bar with the article vocabulary: mono, autocomplete on pause, values
  underlined when wrong with the valid ones one click away. Results are rows with the title, _Draft_, star,
  parent, who and when last updated, a two-line excerpt and neutral tag chips. `/articles` is the same list
  in one section per project.
- **The global search box** in the top bar searches issues and articles at once and shows them in two groups
  with their totals and _See all N_; a group whose vocabulary cannot read the query says so in its place.
- **Referenced by** sits on the issue page under Links: the articles naming the issue, with _Draft_, parent,
  project key and last update; hidden while there are none.

## Reports

Built in Phase 5 (27 Sep 2026); the owner picked from rendered options.
The full list of decisions is reports.md § As built (web half). The conventions that apply to
every chart:

- **Colour comes from the API.** A mark wears its group's `series` slot (`--chart-N`), its
  status's label colour when grouped by status, or the category colours when grouped by
  category; Other is `--border-strong`. Nothing is recoloured by rank. Labels, values and
  legends are text tokens, never the series colour.
- **Every chart has its table**, with the same numbers, and every label, count, bar, slice and
  cell opens the issue list for exactly what it counts.
- **Never an empty axis.** An empty report shows the API's sentence and a button per filter to
  widen it; a period widens to *This month* or *This year*.
- **Blank, not `--`, in a grid** (matrix and timesheet cells with nothing in them). `--` stays
  for a missing value in a table column: a Time report's estimate by person.
- **Matrix cells** are *Shade* (grey steps, ink text at ≥ 4.5:1) or *Length* (a hairline bar
  under the count), the viewer's choice; **Gantt bars** are neutral with the status category on
  their left edge, red at the end when overdue.
- Display choices sit at the right of the picker row as small segmented toggles (*Bar | Pie*,
  *Table | Stacked*, *Shade | Length*, *Days | Weeks*); parameters are `Label Value ▾` pickers.
- On phones reports are read-only views: the picker row wraps, charts take the full width, and
  the matrix, Gantt and timesheet scroll sideways.

## Issue list

- Columns configurable per saved view
- Group by any field, with **filter-aware counts** on each group header
- Inline edit of status, priority, assignee without leaving the list
- Bulk select → bulk edit
- The search bar drives everything; the URL always reflects the current query,
  so any view is shareable by copying the address

## Notification centre

A dedicated inbox, not just a dropdown.

- Unread count in the app header
- Filters by kind: assigned, mentioned, commented, status changed, linked,
  due soon
- Mark read, mark all read, click through to the issue
- Grouped by issue so ten changes to one issue read as one entry
- Spans every organisation the person belongs to; each entry names its organisation, and
  opening one in another organisation switches to it first (decided 27 Sep 2026)
- The header count is entries with anything unread, not notifications
- The API sends each line's summary sentence, so the page composes no copy of its own

As built in 6a (web half, 27 Sep 2026; the owner's choices marked):

- **Where the count shows** (owner): both the top bar — an Inbox icon beside the theme toggle
  with the count on an accent pill, capped at `99+`, so it stays visible with the sidebar
  collapsed or on a phone — and the sidebar's Inbox item. Both read
  `GET /v1/notifications/unread-count`, polled at 30 s like every list, and drop at once when
  something is marked read.
- **One row per entry**, flat and hairline-separated: the unread dot (accent), the key (or an
  article or sprint icon), the title (medium while anything is unread, secondary once read), a
  count chip when the entry holds more than one notification, then the newest summary on a
  second line. Right: the project — prefixed with the organisation only for someone in more
  than one — and the relative time with its absolute tooltip. A chevron expands the entry in
  place to its lines (avatar, or a calendar mark for *Due tomorrow* / *Overdue*, which have no
  actor; the overdue mark is `--danger-fg`); *Show all N* pages the rest through the subject's
  own list. A former member keeps the *Former member* chip after the sentence.
- **Opening marks read** (owner): clicking a line marks that notification read; clicking the
  entry's title marks the whole entry. A hover button (always shown on phones) does the same
  without leaving. An entry from another organisation switches the session there first.
- **Filters** are the report pickers: *Kind* (several; the kinds as people say them, grouped
  by area, with sprints and articles one choice each and reactions left out until something
  produces them), *Project* (grouped by organisation), *Organisation* (only for someone in more
  than one) and *Show* all or unread only. The URL holds them (`?kind=mentioned,sprint&org=
  &project=&unread=1`). With a kind, project or organisation chosen the button reads *Mark all
  matching read* and marks only that.
- **States**: skeleton rows; an empty inbox that says what arrives here and links to Settings →
  Notifications; a filter with no result naming it (*No notifications for mentions in Partner
  Portal.*) with a button per filter to drop it; *Nothing unread* under the unread filter; *You
  are up to date* above a fully read list; an inline error with *Try again*.
- **Dashboard**: My work's rail shows the newest five entries with *Mark all read* (owner).
- **No `g` shortcut for the inbox** (owner, 27 Sep 2026).

### Notification settings

`/settings?tab=notifications`. An *Email* section first: in-app is always on, email is off until
chosen, choices apply in every organisation, digests arrive at 9am in the profile's time zone
(named, with a link to change it) — weekly on Mondays — and only when something unread is
waiting; *Turn everything off* on its right, with *Undo* in the toast. Then Issues, Comments,
Agile and Knowledge base from each preference's `area`, one row per kind: its name, when you hear
it, and a picker of Off / Instant / Daily digest / Weekly digest. *Mentioned* carries a neutral
outlined *Most commonly enabled* chip; *Reactions* reads *In-app only* instead of a picker.
Every change saves at once.

### Unsubscribe page

`/unsubscribe?token=`, in the `(auth)` split. It reads the preview and says what the link turns
off (*email about mentions and comments*, or *your daily digest*), and changes nothing until
*Turn these emails off* is pressed. Done says what went off and that nothing else changed, with
*Open Settings → Notifications*. A missing or bad token says the link does not work and points
at the same settings.

## Keyboard

| Key | Action |
|---|---|
| `/` | Focus search |
| `c` | Create issue |
| `g` then `i` / `b` / `r` | Go to issues / board / reports |
| `g` then `d` / `p` / `m` | Go to dashboard / projects / my issues |
| `Tab` | Complete first search suggestion |
| `e` | Edit description |
| `a` | Assign |
| `s` | Change status |
| `⌘/Ctrl + Enter` | Submit comment |
| `?` | Shortcut reference |
| `[` | Collapse or expand the sidebar |
| `Esc` | Clear the list selection |
| `Alt + ↑/↓/→/←` | Move the focused article in the knowledge base tree (3.5) |

Decided 25 Sep 2026, 1g. `?` opens the reference as a dialog over the current page;
`/shortcuts` renders the same table, from the one list in `apps/web/lib/shortcuts.ts`.
A shortcut appears there only once the thing it drives exists: `g b` arrived with Phase 3
(the current project's board, else the last project visited), `g r` with Phase 5 (the current
project's reports, else `/reports`). After `g`, the second key must follow within a second.
Bare keys are ignored while typing, inside a dialog or menu, and with a modifier.

## Theming

Light and dark, following the system preference with a manual override. Every
palette token is defined for both. Dark mode is a first-class target, not an
inverted afterthought — the reference product is used predominantly in dark
mode.

## Responsive

Full functionality down to tablet width. On phones: issue list, issue detail,
comments and time logging work properly; board and reports are read-only
views. Nothing is hidden behind "please use a desktop".
