# Searching for issues

One search language works everywhere in Nothing Left: the search bar, saved
views, board and backlog filters, report scoping, and the `search_issues` tool
an AI agent uses. Whatever you can type here, an agent can type too.

The whole grammar fits on this page.

## The basics

Search for a value of an attribute with `attribute: value`:

```
status: Open
type: Bug
assignee: me
project: ACME
```

Put clauses side by side to require all of them (AND):

```
type: Bug status: Open assignee: me
```

Separate values with a comma to accept any of them (OR):

```
status: Open, Reopened
type: Bug, Feature
```

Nothing is case-sensitive. `Status: Open`, `status: open`, `type: bug`,
`Type: Bug`, `#ui` and `#UI` all mean the same thing.

## Values with spaces

Wrap a value that contains spaces in braces:

```
status: {In Progress}
status: Open, {In Progress}, {Ready for QA}
sprint: {Sprint 14}
```

Braces are required whenever a value has a space, including attribute names
used as values (`has: -{due date}`, `sort by: {due date} desc`). Anything
placed after a value without a comma is treated as free text, not as another
value:

```
type: Bug Task          -- issues of type Bug whose text mentions "Task"
type: Bug, Task         -- issues of type Bug or Task
```

## Excluding values

Put `-` in front of a value to exclude it. The minus applies to that one
value:

```
status: -Open                      -- everything except Open
status: -Open, -Reopened           -- neither Open nor Reopened
status: -{In Progress}
tag: -ui
assignee: -me
```

## Free text

Words that are not part of an `attribute: value` clause search the title and
description:

```
login redirect loop
login redirect status: Open
```

Quote a phrase to match the words in that order:

```
"login redirect loop"
```

A word followed by a colon is always read as an attribute. To search for text
that contains a colon, such as a URL, put it in quotes:

```
"https://status.example.com"
```

## Shortcuts with `#`

`#` followed by a value looks it up across priorities, states, types, tags and
sprints, so you do not have to name the attribute:

```
#Critical                         -- priority
#{Code Review}                    -- status
#Bug                              -- type
#{needs-design}                   -- tag
#{Sprint 14}                      -- sprint
```

Three keywords have a fixed meaning:

| Shortcut      | Matches                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| `#Unresolved` | Every issue in an unresolved status, whatever the status is called in that project |
| `#Resolved`   | Every issue in a resolved status                                                   |
| `#Star`       | Issues you have starred                                                            |

`Resolved` and `Unresolved` also work as `status:` values: `status: -Resolved`
excludes every resolved issue.

## Saved searches

Save any search as a **view** and give it a name. Reference it by name with
the same `#{…}` form and combine it with anything else:

```
#{My open bugs}
#{Waiting on design} priority: Critical
```

A saved view is one of three kinds:

| Visible to                                         | Who can create it                                   | Who can change or delete it                    |
| -------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| **Only you**                                       | Anyone                                              | You                                            |
| **A project** - everyone who can open that project | Contributors and Project Admins of the project      | Its creator, or a Project Admin of the project |
| **The organisation** - every member                | Anyone who is a Contributor in at least one project | Its creator, or an Org Admin                   |

A view can use other views: `#{Open work} assignee: me` works even when _Open
work_ is itself built from another view. A view cannot end up referring to
itself.

Names are not case-sensitive, and you cannot give a view a name you can
already see. If two people's views share a name, yours is used first, then
the project's, then the organisation's. When a view is changed, every search
that names it follows the change; when it is deleted, a search that still
names it tells you so.

## People

Use `me` for yourself, or a username with or without the `@`:

```
assignee: me
created by: me
assignee: @jo.kim
commenter: sam
work author: me
assignee: Unassigned
```

People attributes: `assignee`, `created by`, `updated by`, `commenter`,
`work author`. Someone who has left the organisation still matches -
`created by: @alex` finds what Alex Lee filed after they were removed - though
autocomplete no longer offers them.

## Dates

Date attributes: `created`, `updated`, `resolved date`, `commented`,
`due date`, `start date`. A new comment counts as an update, so `updated:`
moves with it.

```
created: 2026-09-19               -- one day
created: 2026-09                  -- a whole month
created: Today
due date: Tomorrow
updated: Yesterday
due date: Friday                  -- a day of the current week
created: {This week}
resolved date: {Last month}
due date: {Next week}
```

Relative offsets count from now. Units are `m` minutes, `h` hours, `d` days,
`w` weeks, `M` months and `y` years:

```
created: {minus 7d}               -- exactly seven days ago
due date: {plus 14d}
updated: {minus 24h}
```

### Ranges

Join two dates with `..`. Either side can be left open, written as `*` or
omitted:

```
created: 2026-01-01 .. 2026-09-19
created: {minus 7d} .. Today
due date: Today .. {plus 14d}
updated: {minus 24h} .. Now
created: {This year} ..           -- from the start of this year onward
due date: .. Today                -- everything due up to today
due date: * .. Today              -- the same
```

The complete list of date words: `Today`, `Yesterday`, `Tomorrow`, `Now`,
`Monday` to `Sunday`, `{This week}`, `{Last week}`, `{Next week}`,
`{This month}`, `{Last month}`, `{Next month}`, `{This year}`,
`{Last year}`, `{Next year}`, `{minus …}`, `{plus …}`.

Weeks start on the day your organisation has chosen in its settings.
Due dates and start dates are plain calendar dates and never shift with your
timezone; created and updated times are shown in yours.

## Empty values

Each attribute has a name for "nothing set":

```
assignee: Unassigned
due date: {No due date}
start date: {No start date}
sprint: {No sprint}
estimation: {No estimation}
story points: {No story points}
resolved date: Unresolved
```

You can also ask whether anything is set at all with `has:`:

```
has: attachments
has: comments
has: -description                 -- issues with an empty description
has: -assignee                    -- unassigned
has: -estimation
has: -{due date}
```

## Numbers and durations

`story points` and `votes` take numbers; `estimation` and `spent time` take
durations written as `1w 1d 1h 1m` (weeks, days, hours, minutes, in any
combination). Ranges work the same way as for dates:

```
story points: 5
story points: 3 .. 8
votes: 1 ..                       -- at least one vote
estimation: .. {4h}               -- estimated at four hours or less
spent time: {1d} ..
estimation: {1d 4h}
```

`spent time` is the issue's own logged time plus everything logged on its subtasks,
so `spent time: {1d} ..` also finds an epic whose subtasks add up to a day. Time on
a deleted subtask does not count.

## Linked issues

Find issues by what they are linked to:

```
subtask of: ACME-88               -- the subtasks of ACME-88
parent for: ACME-88               -- the parent of ACME-88
relates to: ACME-1, ACME-2
depends on: -ACME-3
duplicates: ACME-40
is duplicated by: ACME-41
```

Or by a property of the linked issue, using `aggregate` and a query in
braces:

```
aggregate Subtask of: {status: Open}         -- issues whose parent is Open
aggregate Parent for: {status: -Resolved}    -- issues with an unresolved subtask
aggregate Duplicates: {project: ACME}
aggregate Is duplicated by: {#Critical}
```

To match issues by their own key: `key: ACME-1, ACME-2`.

## Other attributes

| Attribute      | Example                       | Matches                                    |
| -------------- | ----------------------------- | ------------------------------------------ |
| `project`      | `project: ACME`               | Project key or name                        |
| `tag`          | `tag: ui, backend`            | Tag name                                   |
| `sprint`       | `sprint: {Sprint 14}`         | Sprint name or its short name (`sprint-14`), across your projects; `{No sprint}` is the backlog |
| `work type`    | `work type: Testing`          | The type of logged time                    |
| `comments`     | `comments: {redirect loop}`   | Text inside comments (exact substring)     |
| `attachments`  | `attachments: screenshot.png` | Attachment file names (not their contents) |
| _custom field_ | `severity: High`              | Any custom field, by its slug              |

## Custom fields

Every custom field is an attribute, by its slug: `severity: High`, `platforms: iOS`,
`reviewer: me`, `launch: {This month}`, `budget: 10 .. 50`, `blocking: Yes`. Values follow the
field's type, a negative number goes in braces (`budget: {-5}`), and the field's empty label is
its empty value (`severity: {No Severity}`). Select options also answer the `#` shortcut. See
[Custom fields](./custom-fields.md#searching).

## Sorting

Add `sort by:` with one or more attributes. Each may be followed by `asc`
(the default) or `desc`; multi-word names take braces:

```
sort by: updated desc
sort by: priority asc, updated desc
sort by: {due date}
```

Sortable attributes: `created`, `updated`, `resolved date`, `due date`,
`start date`, `priority`, `status`, `type`, `story points`, `estimation`,
`spent time`, `votes`, `key`, and any custom field except free text.

## Autocomplete

As you type, the dropdown offers:

1. **Attributes** matching what you have typed, with a short description -
   `created by:` _by reporter_, `commenter:` _by commenter_.
2. **Values** as `#` shortcuts, grouped by where they come from -
   `#Critical` _Priority_, `#{Code Review}` _Status_, `#{Sprint 14}` _Sprints_.
3. **Saved searches** - `#{My open bugs}`.
4. **Recent searches**, filtered by what you have typed.

After an attribute and its colon, the list switches to that attribute's
values: `-` to exclude, the empty value, `..` for a range, and for dates the
day and period words with the actual dates they resolve to.

Press **Tab** to accept the first suggestion, or move through the list with the
arrow keys and press Enter. Suggested values come only from projects you can open.

The search runs when you press **Enter**, not on every keystroke, and the address
bar then carries the query, so copying the address shares exactly what you see.
Press `/` anywhere in the app to jump to the search bar. When a query is refused,
the part at fault is underlined in the bar and the valid values, where there are
any, appear beneath it as one-click replacements.

## Putting it together

```
#Unresolved type: Bug priority: Critical, Major assignee: me sort by: updated desc
```

Unresolved bugs of critical or major priority that are assigned to you,
newest change first.

```
project: ACME sprint: {Sprint 14} has: -estimation
```

Everything in Sprint 14 of ACME that still needs an estimate.

```
created: {This month} created by: -me commenter: me
```

Issues raised this month by someone else that you have commented on.

```
due date: .. {plus 7d} #Unresolved tag: -blocked
```

Open work due within a week that is not blocked.

## Where search looks

A search covers every project you can open in your current organisation,
archived ones included. Add `project:` to narrow it:

```
project: ACME login
project: ACME, OPS #Unresolved
```

Nothing you cannot open ever appears - not in the list, not in a group
count, not in a dashboard figure and not in an exported file.

## Recent searches

The searches you run in the app are remembered - your last 20 in each
organisation - and offered in the dropdown. Searches an AI agent runs with
your token are not. Repeating a search within five minutes does not move it
in the list. You can clear the list at any time.

## Errors

A query that cannot be understood is refused with a message that names the
problem, marks the part of the query at fault and, where possible, lists the
valid choices:

- an unknown attribute lists every attribute you can use;
- an unsortable attribute in `sort by:` lists the sortable ones;
- a value that does not exist - `status: Donee`, `assignee: @nobody`,
  `#Nonsense` - lists the values that do, in the projects you can see.

Nothing is silently ignored, and a typo never quietly returns an empty list.
