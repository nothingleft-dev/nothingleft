# Issues

An issue is one piece of work: a bug, a feature, a task, an epic. Everything
on this page works the same way in the app, over the REST API, and through
the tools an AI agent uses.

## Keys

Every issue has a key made of its project's key and a number: `ACME-1`,
`ACME-2`, `ACME-118`. Numbers count up from 1 in each project and never skip,
so `ACME-42` is always the forty-second issue filed in ACME.

Keys are what you type, paste and say out loud. They are not case-sensitive -
`acme-118` finds `ACME-118` - and they are the whole address: the API reads an
issue at `/v1/issues/ACME-118`.

A project's key can be changed only until its first issue exists. After that
it is fixed, because every key already handed out would stop working.

## Fields

| Field                | What it holds                                 | When it is empty               |
| -------------------- | --------------------------------------------- | ------------------------------ |
| Title                | One line, up to 500 characters                | - (always set)                 |
| Description          | Markdown                                      | nothing is shown               |
| Status               | One of the project's statuses                 | - (always set)                 |
| Priority             | One of the project's priorities               | - (always set)                 |
| Type                 | One of the project's issue types              | - (always set)                 |
| Assignee             | Any number of people                          | `Unassigned`                   |
| Estimation           | A duration                                    | `?`                            |
| Spent time           | The time logged on the issue and its subtasks | `?`                            |
| Story points         | A whole number, 0–999                         | `Not estimated`                |
| Sprint               | The one sprint the issue is planned into      | `Unscheduled`                  |
| Start date, Due date | Calendar dates                                | `No start date`, `No due date` |
| Parent               | The issue this one is a subtask of            | - (none)                       |
| Tags                 | Any number of organisation-wide tags          | nothing is shown               |
| Development          | The badge for its branches and pull requests  | `Nothing linked`               |

In the issue list, an empty cell shows `--`.

**Development** shows only in a project with a linked GitHub or GitLab repository. It is set
by the code work that names the issue, never by hand; its menu copies a branch name for the
issue and its checkout command. See [Development: GitHub and GitLab](./git.md).

**Story points and sprints** are covered in [Sprints, backlog and boards](./agile.md). A
parent issue - an epic - also shows the story points of everything beneath it added up,
and a board card shows how many of its subtasks are done (`1/3`).

**Dates are calendar dates.** A due date of 19 Sep 2026 reads as 19 Sep 2026
for everyone, in every timezone. The start date cannot be after the due date.

**Durations** are written the way you would say them: `4h`, `1d 2h`, `1w`,
`30m`. A day and a week follow your organisation's working calendar - with
the default eight-hour day and five-day week, `1d 2h` is ten hours. The API
also accepts a plain number of minutes.

**Descriptions** can be up to 256 KB. From 64 KB the editor warns you that the
description is getting long; it still saves. Mention a teammate with
`@username` and they are recorded as mentioned. Type another issue's key,
such as `ACME-12`, and it becomes a link; once that issue is resolved, its key
is shown struck through. Task-list checkboxes (`- [ ] write release notes`)
can be ticked straight from the rendered text by anyone who may edit it.

**Who and when.** Every issue shows who created it, who last updated it, and
when. Changes to your own star, vote or watch do not count as updates. A new
comment moves the _updated_ time but not _updated by_, which always names the
last person to change the issue itself.

**People who have left.** When someone is removed from the organisation,
everything they did keeps their real name and picture, with a small _Former
member_ label - never "Deleted user". You can still search for their work
(`created by: @alex`), but they are no longer offered when you assign or
mention someone.

Projects can add their own fields - a severity, a launch date, a reviewer - which appear in the
sidebar below these. See [Custom fields](./custom-fields.md).

## Statuses and resolution

Each status belongs to a category: `backlog`, `unstarted`, `started`, `done`
or `cancelled`. Moving an issue into a `done` or `cancelled` status marks it
**resolved** and records when. Moving it back out clears that. Moving between
two resolved statuses - Fixed to Closed, say - keeps the original resolution
time.

There are no transition rules. Any status can follow any status.

## Creating an issue

You need to be a Contributor or above in the project. Only a title is
required; status, priority and type start at the project's defaults
(`Open`, `Normal` and `Bug` in a new project). Values are matched by name
without regard to case, so `in progress` means `In Progress`. A value the
project does not have is refused, and the error lists the ones it does.

Only people who can open the issue can be assigned: members of the project,
and the organisation's admins.

## Watching, starring and voting

- **Watch** an issue to follow it. You watch automatically when you create
  an issue, when you are newly assigned to one, and when you comment on one.
  Contributors can add or remove other watchers; anyone can stop watching.
  If you stop watching and are later assigned again, you watch again.
- **Star** an issue to keep it close. A star also watches the issue;
  removing the star leaves the watch in place.
- **Vote** for an issue to show it matters to you. Each person has one vote
  per issue; the count is shown on the issue.

Star, watch and vote are personal, so Observers can use them too, even in an
archived project.

## History

Every change is kept in the issue's history - `Status: Open → In Progress` -
with who made it and when.

- Changes saved together appear as **one entry**.
- If you change the same field again **within five minutes** of your first
  change, the entry is updated rather than a second one added. Assign the
  wrong person and fix it twenty seconds later, and the history shows only
  the assignment you meant.
- If you change it back to what it was, the entry disappears: nothing
  changed.
- This never happens across someone else's change to that field, or across a
  comment, so nothing anyone has already read is rewritten.
- Comments, links, tags and parent changes are recorded too. A link appears
  in the history of both issues; a new parent appears on the subtask and on
  both the old and the new parent.
- A link to an issue in a project you cannot open still shows, as *an issue
  in another project*: you see that a link was added or removed and its type,
  never the other issue's key.

## Writing: the editor

Descriptions and comments share one editor. **Visual** shows the text as it will
look; **Markdown** shows the source. Switch between them at any time with the toggle
on the right of the toolbar - both are the same text, and the editor remembers which
one you used last.

- The toolbar sets the block type (normal text or a heading), bold, italic,
  strikethrough, quotes, inline code, links, bullet, numbered and task lists, code
  blocks and tables. Inside a table, the table button adds or removes rows and columns.
  Drop or paste files to attach them (see Attachments).
- Type `@` to mention someone in the project: a list of people opens as you type.
  Type `#` to link an issue: search by key (`ACME-12`) or by words in its title. Use
  `↑` `↓` to move, `↵` or `⇥` to insert, `Esc` to close.
- `⌘ ↵` (`Ctrl ↵` on Windows and Linux) saves, `Esc` cancels, and `⌘ K` adds a link.
- In the saved text, an issue key shows the issue's title when you hover it, and is
  struck through once that issue is resolved.

## Comments

Comments are markdown, up to 256 KB, and you need to be a Contributor or above
to write one. Commenting makes you a watcher. The comment box sits at the end of the
issue's activity.

- `@username` mentions a member of the organisation; `ACME-12` links to that
  issue. Someone who has left the organisation cannot be mentioned.
- You can edit or delete your own comments; Project Admins can edit or delete
  anyone's. Both are in the menu that appears when you point at a comment. An edited
  comment shows _edited_; hover it to see when.
- A deleted comment disappears from the issue entirely - you are asked first, because
  it cannot be brought back. The history keeps one line saying a comment was deleted,
  and by whom.
- The activity has up to five tabs: **All** shows comments and changes together, **Comments**
  only the comments, **Development** the branches, commits and pull requests that name the
  issue (in a project with a linked repository; see [Development](./git.md)), **Spent time**
  the time logged (see [Time tracking](#time-tracking)), and **History** only the changes.
- A comment ends the five-minute window described under
  [History](#history): changes made before it stay exactly as they were.

## Time tracking

Log the time you spend on an issue with **Add spent time** - below the comment box, on
the **+** beside _Spent time_ in the sidebar, or on the issue's **Spent time** tab. You
need to be a Contributor or above in the project.

- Enter the **date** and the **time spent**, written the way you would say it: `2h`,
  `1h 30m`, `1d`. A day and a week follow your organisation's working calendar.
- **Date ranges** logs the same time on every working day of a range. `2h` from Monday
  21 Sep to Friday 25 Sep 2026 writes five separate records of two hours; weekends are
  skipped (your organisation's working week decides which days count). Each record can
  be changed or deleted on its own afterwards.
- **Add another record** puts several dates, or several ranges, into one save - they
  share the type and the note.
- The **type** starts at the project's default work type (Development in a new
  project). Choose another, or _No type_.
- The **note** is markdown, up to 16 KB. `@username` mentions work as in comments.
- **Project Admins** can log time for someone else: pick them as the **Author**. Anyone
  who could log their own time in the project can be chosen - not an Observer. The
  record then shows _logged by_ the admin who wrote it.

**Spent time** in the sidebar shows what has been logged against the estimate - `3h of
4h` with a bar under it. Once it goes past the estimate the bar turns red and says how
far over it is. An issue's spent time includes everything logged on its subtasks, so an
epic shows the whole effort beneath it. Deleting a subtask takes its time off the epic;
restoring it brings the time back. Moving a subtask to a new parent moves its time too.

The **Spent time** tab lists every record, the subtasks' included (each marked with its
subtask's key), with the total at the top. You can edit or delete your own records;
Project Admins can edit or delete anyone's, and change whose time a record is. Deleting
asks first, because a deleted record cannot be brought back. Every addition, change and
removal is kept in the issue's history.

**Turning time tracking off.** A Project Admin can switch time tracking off for a
project in its settings, under _Time tracking_. Estimation and Spent time then
disappear from the project's issues, and nobody can log, change or delete time there.
Nothing is deleted: turn it back on and every record is where it was.

## Subtasks and links

**Subtasks.** An issue can have one parent in the same project, and the
hierarchy goes at most three levels deep - Epic, Task, Subtask. Moving an
issue moves everything beneath it, so an issue with subtasks of its own
cannot go under a subtask. An issue can never end up beneath itself.

**Links** connect issues in any projects of the organisation you can see. Each
one reads differently from each end:

| Link       | From the other issue |
| ---------- | -------------------- |
| relates to | relates to           |
| depends on | is required for      |
| duplicates | is duplicated by     |
| subtask of | parent for           |

A _subtask of_ or _parent for_ link is the same thing as setting the parent.
A _depends on_ chain can never loop back on itself: if ACME-3 depends on
ACME-2, and ACME-2 on ACME-1, then ACME-1 cannot depend on ACME-3. Linking
the same two issues twice is refused, whichever end you start from.

The issue page groups links by kind with a count - _Parent for 3_,
_Relates to 1_ - and shows each linked issue's key, struck through once it is
resolved. Issues in projects you cannot open are left out. Contributors and
above can add and remove links and set parents.

- **Add links** opens a dialog: pick how the issues relate, then find any number of
  issues by key or title. If one of them cannot be linked - a _depends on_ that would
  loop, say - the dialog says why and nothing is linked.
- To remove a link, point at it and press **×**. Star a linked issue from its row
  without opening it.
- An issue's parent appears above its title as _Subtask of ACME-4_. Change or remove it
  there, or use **Set parent** in the **⋯** menu. **Create subtask** (in the Links
  section or the **⋯** menu) opens a new issue already filed under this one.

## Tags

Tags belong to the whole organisation, so a tag made in one project is ready
in every other. Type a tag and the existing one is used if it matches -
`Needs Review`, `needs review` and `needs-review` are the same tag, shown as
it was first written. Anything else creates a new tag, with a colour from
the same grid statuses and types use - pick one, or one is chosen for you. Colons are kept, so namespaced tags such as `area:billing`
work. Contributors and above can add and remove tags; tags appear under the
issue's title. You can also add tags, and links, while creating an issue.

Press **+** after the tags (or the tag icon beside the title) to pick from the
organisation's tags; pick one again to take it off. To make a new one, type its name,
choose **Create**, then pick its colour from the same grid statuses and types use.
Point at a tag and press **×** to remove it.

You can tag a new issue while creating it, with the tag icon beside its title. On the
full-page form the link icon next to it adds links too; if one of them cannot be made,
the issue is not created and the form says why.

Renaming, recolouring, merging and deleting tags for the whole organisation is
[Tags](./tags.md).

## Attachments

Attach files to an issue, to a comment or to a time entry. Drag files onto the editor,
paste a screenshot straight into it, or pick them with the paperclip in its toolbar:
images appear in the text where you put them, and any other file becomes a link to
download. Each file shows its progress under the text and can be cancelled while it
travels; you can save once every file has finished. The paperclip beside the issue's
title attaches files to the issue without putting them in any text.

You can attach files while you are still writing a new issue, comment or time entry -
they join it when you save. A file you removed from the text before saving is deleted
rather than attached, and if you never save, the files are thrown away after two days.

- A file can be up to **100 MB**, and an issue can hold **50** files, counting those on
  its comments and time entries.
- Images (PNG, JPEG, GIF, WebP, AVIF) and PDFs open in the browser; everything else,
  SVG images included, downloads. Click an image to see it full size; right-click it to
  open it in a new tab.
- The issue's _Attachments_ section lists every file, and appears once the issue has one.
  Files already shown in the description or a comment are hidden from it -
  _Attachments 3 · Hidden files 2_ - with _Show_ to list them too.
- Files are private. A file link works only for someone signed in who can open the
  issue, and stops working for anyone who loses access. Alex Lee can paste a file link
  into a chat, but only members of the ACME project can open it.
- Contributors and above can attach files. You can delete your own; Project Admins can
  delete anyone's - hover the file and press `×`, then confirm, since a deleted file
  cannot be brought back. A file cannot be edited - delete it and attach the new version.
  Attaching and deleting appear in the issue's history.
- Deleting a comment or a time entry deletes its files too. A deleted issue keeps its
  files for the 14 days it can be restored; after that they are removed with it.

**Storage.** Files count toward your organisation's storage: 5 GB on the free plan. From
80% a notice appears in organisation settings and above an issue's attachments; at 95% the
organisation's admins also get one email. At 100% new uploads are refused until there is
room: delete files you no longer need, or have an admin connect your own Cloudflare R2 or
AWS S3 bucket, which lifts the limit. Avatars do not count. See [Storage](./storage.md).

## Deleting and restoring

Project Admins can delete an issue from the menu on its page. You are asked
to confirm; the issue then disappears from the project straight away, but it
can be **restored for 14 days** - from the _Undo_ on the message that
follows, or from the project's list of deleted issues. After 14 days it is removed for good,
together with its comments, time entries, attachments and history.

## Project settings: statuses, priorities, types, work types

Project Admins shape these four lists for their project. A new project
starts with:

| List       | Values (default in bold)                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Statuses   | Submitted, **Open**, In Progress, Reopened, Can't Reproduce, Duplicate, Fixed, Won't fix, Obsolete, Closed |
| Priorities | Show-stopper, Critical, Major, **Normal**, Minor                                                           |
| Types      | **Bug**, Feature, Task, Epic                                                                               |
| Work types | **Development**, Documentation, Implementation, Investigation, Maintenance, Observation, Testing           |

- Names are unique within a list, ignoring case. Each value has a one-letter
  badge, the first letter unless you choose another.
- Statuses, priorities and types each have a colour, picked from a grid of
  eight colour families in five shades (light grey unless you choose one).
- Statuses, priorities and types always have exactly one default, used for
  new issues; work types have one too, used for new time entries. To change
  it, make another value the default.
- A status or work type can be **archived**: issues that have it keep it,
  but it can no longer be chosen.
- To delete a value that issues still use, choose where to move them. For
  example, deleting `Obsolete` and moving its issues to `Won't fix` updates
  each issue and records the change in its history. The default and the
  last remaining value cannot be deleted.

Every change to these lists is recorded in the organisation's audit log.

## Working with lists of issues

Every list of issues - a project's issues, **My issues**, **Starred**, or any
search - works the same way.

- **Group** the list by project, status, priority, type, assignee, tag or due
  date. Each group header shows how many issues it holds across the whole
  list, not just the ones on screen. An issue with two assignees or two tags
  appears under each of them. Grouping by due date sorts issues into
  _Overdue_, _Today_, _This week_, _Later_ and _No due date_. Groups of
  resolved statuses start collapsed; click a header to open or close it.
- **Saved views** sit above the list as tabs, each with its count. Click one
  to run it; type past its query and the tab lets go. _Save view_ keeps the
  current query, sort and columns under a name; the active tab's menu saves a
  changed query back into it, renames or re-shares it, or deletes it - for
  views you may change (see [Searching](./search.md#saved-searches)).
- **Edit in place**: click a status, the priority letter or the assignees to
  change them without opening the issue. Sort by clicking a column header;
  choose which columns show from the _Columns_ menu.
- **Bulk edit**: select up to 500 issues and change their status, priority,
  type, assignees, dates or estimate in one go. Assignees can be replaced,
  added or removed. Each issue is changed on its own: if one cannot be (it is
  in a project where you only observe, say), the others still are, and you see
  which ones failed and why. Every change lands in the issue's history as if
  you had made it by hand.
- **Export to CSV** downloads the list exactly as searched and sorted, up to
  10,000 issues, with the columns you choose.

## Archived projects

An archived project is read-only. Its issues can be read, starred, voted on
and watched, but not created, edited, deleted or restored, and its settings
cannot change. Unarchive the project to work in it again.

## For API and agent users

- Send an `Idempotency-Key` header with any change. If the connection drops
  and you retry with the same key, you get the first response back instead
  of a second issue.
- `PATCH` changes only the fields you send. Send `null` to clear one:
  `{ "due_date": null }` removes the due date; leaving `due_date` out keeps
  it.
- `POST /v1/issues/bulk-update` takes up to 500 keys and one set of changes,
  and answers one result per key: `updated`, `unchanged` or `failed` with
  the same error a single change would have given.
- Link issues with `POST /v1/issues/ACME-1/links` and
  `{ "link": "depends on", "issues": ["ACME-2"] }`, using the link names in
  the table above. Tag with `POST /v1/issues/ACME-1/tags` and
  `{ "tags": ["Needs Review"] }`; a tag is created the first time it is used.
- Log time with `POST /v1/issues/ACME-1/work-items` and
  `{ "records": [{ "work_date": "2026-09-21", "duration": "2h" }] }`; a record of
  `{ "from": "2026-09-21", "to": "2026-09-25", "duration": "1h" }` is a range. Add
  `"author": "alex.lee"` to log for someone else, `"work_type": "Testing"` and
  `"description_md"` for the type and note. The answer is every record written. A token
  needs the `time:write` scope. `GET /v1/issues/ACME-1/work-items?include=subtasks`
  lists them with the subtasks'.
- Attach a file in three steps. `POST /v1/attachments/presign` with
  `{ "issue": "ACME-1", "filename": "trace.log", "mime": "text/plain", "size": 5120,
"sha256": "<base64 SHA-256>" }` answers an `upload_url` and `upload_headers`; `PUT` the
  bytes there with those headers; then `POST /v1/attachments/<id>/complete`. Add
  `"comment_id"` or `"work_item_id"` to hang it on a comment or time entry. For something
  you are about to create, send `"project": "ACME"` instead of `"issue"`, then list the
  ids in `"attachment_ids"` when you create the issue, comment or time entry.
  `GET /v1/issues/ACME-1/attachments` lists the files; `DELETE /v1/attachments/<id>`
  deletes one. A file's `url` answers a redirect to a short-lived download link; with a
  token, read the `Location` header rather than following it. Uploading needs the
  `issues:write` scope.
- `GET /v1/issues/refs?keys=ACME-1,ACME-2` answers the title and resolved
  state of each issue you can open - what the app uses to render issue keys
  in text.
- The full reference is in the API documentation.
