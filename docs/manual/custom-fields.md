# Custom fields

Custom fields add your own information to issues — a severity, the customer affected, a
launch date, who reviews the change. Each project has its own fields. They appear on the
issue page, in the issue list, in search and in the CSV export, and an AI agent reads and
sets them through the [MCP tools](./mcp.md).

## Adding a field

A Project Admin (or an organisation admin) adds fields in **Project settings → Fields**.
A field has:

- **A name**, such as _Severity_. You can rename it at any time.
- **A type**, which never changes once the field exists:

  | Type | Holds | Example |
  | --- | --- | --- |
  | Text | One line, up to 1,000 characters | `ACME-order-4471` |
  | Markdown | Formatted text, up to 16 KB | Steps to reproduce |
  | Number | A number, optionally within a range and with a set number of decimal places. Approximate: not for money or exact totals | `12.5` |
  | Integer | A whole number, optionally within a range | `3` |
  | Date | A calendar date, the same for everyone whatever their timezone | 1 Oct 2026 |
  | Date and time | A moment, shown in each reader's timezone | 1 Oct 2026, 9:30am |
  | Checkbox | Yes or no | Blocking |
  | Select | One option from a list | High |
  | Multi-select | Several options from a list | Web, iOS |
  | User | One member of the project | @alex |
  | Multi-user | Several members | @alex, @casey |
  | URL | A web address | `https://example.com/spec` |
  | Duration | Time, in the `1w 1d 1h 1m` form | 1h 30m |

  Number fields are stored as ordinary decimal-fraction approximations, so very long decimals
  can differ in the last place and totals may be off by a tiny amount. Use an Integer field in
  whole units (cents, not dollars) or a Duration for anything that must be exact.

- **A slug** — the name search uses, such as `severity`. It is made from the name unless you
  choose one: lower-case letters, digits and hyphens. **The slug never changes**, even when
  you rename the field, so saved searches and history keep working. It cannot be the name of
  a built-in search attribute such as `status` or `due date`.
- **The issue types it applies to.** A _Severity_ field can apply to Bugs only, so it does
  not clutter an Epic. By default a field applies to every type.
- **Options**, for a select or multi-select, each with a colour. Drag them into the order
  you want; the order is also how they sort.
- **Required**, **a default** and **an empty label** — see below.

A project can have up to **50 active fields**. Archived fields do not count.

The Fields tab lists the fields in the order issues show them, with each one's slug, type,
the types it applies to and how many issues hold a value, and counts the active ones against
the 50; at the limit, _New field_ is disabled until you archive or delete one. Drag a field's
grip, or press **Alt + ↑/↓** on it, to reorder. Click a field's name to change it: the same
dialog as _New field_, with the type and slug shown but fixed, and _Archive_ and _Delete_ at
the bottom. Archived fields are listed apart, under the active ones. Everyone in the project
can see the tab; only a Project Admin can change it.

### The same slug in several projects

Two projects can each have a field with the same slug — say, a _Severity_ select in both —
and a search across projects then finds issues in both: `severity: High`. A slug always
holds the same kind of value across the organisation, though, so a _Severity_ number in a
third project is refused; choose another slug for it.

## Filling in fields

Fields appear in the issue's sidebar under **Fields**, below the standard ones, in your chosen
order, with a picker to match the type: a calendar for a date, a calendar and a time for a
date and time, a searchable list for options and people, a switch for a checkbox, and the
`1w 1d 1h 1m` box for a duration, as for Estimation. A markdown field shows its text, and the
pencil beside its name opens the editor. Multi-select and multi-user fields save when their
picker closes, so choosing three options is one change. Anyone who can edit the issue
(Contributor and up) can set them. People fields offer the members who can open the issue.

If a change is refused — a required field cleared, a number outside its range — the reason
shows under the field and it keeps its value.

When you create an issue, the fields that apply to its type follow the standard ones, with
their defaults already filled in. A required field carries a red `*`, and creating without it
says which fields are missing. Changing the type changes the set.

Every change is recorded in the issue's history, as _Severity: High → Critical_, and
corrections made within a few minutes collapse into one entry, as for any other field.

### Empty values, required fields and defaults

An empty field shows its **empty label** — _No Severity_ unless you set another, such as
_Not triaged_. In the issue list an empty cell shows `--`.

A **default** is filled in on every new issue that does not set the field. A **required**
field must have a value when an issue is created, and cannot be cleared afterwards. If it
has a default, the default counts. Issues that existed before the field became required keep
their empty value until someone clears the field or a type change makes it apply. A checkbox is never
empty — unticked is _No_ — so it cannot be required.

### Changing an issue's type

When an issue changes to a type a field does not apply to, the field disappears from the
issue, but its value is kept. Change the type back and the value returns. A field that is
required for the new type must be filled in (or takes its default) as part of the change.

## Searching

Search by the slug, with values that match the field's type:

```
severity: High, Critical
severity: -Low
platforms: iOS
reviewer: me
launch: 2026-10-01 .. 2026-10-31
deploy-at: {This week}
budget: 100 .. 500
budget: {-5}
review-time: 1h ..
blocking: Yes
summary-line: order-4471
```

- **Options** match by name, and take part in the `#` shortcut: `#High` finds issues whose
  priority, status, type, tag, sprint _or_ a select field is High.
- **Text, markdown and URL** fields match any part of the text.
- **Numbers** compare exactly or in a range. A leading `-` excludes a value, so a negative
  number goes in braces: `budget: {-5}`.
- **Checkboxes** take `Yes` or `No`.
- **Empty** is the field's empty label, in braces when it has spaces:
  `severity: {No Severity}`; `has: severity` and `has: -severity` also work.
- A value that names nothing — `severity: Huge` — is an error that lists the valid options.

Sort by any field except text, markdown and URL fields: `sort by: severity desc, launch`.
Selects sort in their option order, people by username.

The issue list can **group by** a select, multi-select, user, multi-user or checkbox field,
with counts that follow the search. Its **Columns** menu lists the project's fields under
_Custom fields_ (across projects, the fields of the issues on screen); a saved view keeps the
columns chosen with it, and clicking a sortable field's header sorts by it. When there are
more columns than fit, the list scrolls sideways.

## Changing and removing fields

- **Renaming an option** changes it on every issue at once.
- **Archiving an option** keeps it on the issues that have it, but it can no longer be
  chosen.
- **Deleting an option** that some issues use asks where to move them — another option —
  and records the change in each issue's history. To keep those values instead, archive the
  option.
- **Archiving a field** hides it from issues and pickers and stops changes to it, but keeps
  every value, and you can still search by it. Unarchive it to bring it back.
- **Deleting a field** asks for confirmation, naming how many issues hold a value, and
  **permanently removes every value it holds**. The entries it left in issue histories stay.

Adding, changing and deleting fields and options is recorded in the organisation's audit
log.

## Time tracking: Estimation, Spent time and work item attributes

In **Project settings → Time tracking**:

- **Estimation field.** By default the built-in _Estimation_. Choose a duration field instead
  and that field becomes the estimate: setting the estimate fills it, the issue's
  estimate-against-spent comparison and the sprint's remaining work read it, and so does
  `estimation:` in search, and the sidebar's Estimation row takes its name. Switching back
  restores the built-in estimates.
- **Spent time field.** By default the built-in _Spent time_. Choose a duration field and it
  shows the time logged on the issue and its subtasks; it cannot be edited by hand.
- **Work item attributes.** _Work type_ is built in and cannot be removed. Add your own —
  _Billable_ with _Yes_ and _No_, say — each with its values and a one-letter badge. Select an
  attribute in the table to change its values beside it. When someone logs time, they pick a
  value for each beside _Type_, and the Spent time tab shows each value's letter next to the
  work type's. Deleting a value that time entries use asks where to move them; deleting an
  attribute removes it from every entry. Work item attributes are not searched.

A field chosen as the Estimation or Spent time cannot be archived; deleting it returns the
project to the built-in.

## Exporting

The CSV export can include any custom field as a column, alongside the standard ones.
Options and people are written by name, several separated by commas, durations as `1d 4h`
and checkboxes as `true` or `false`.

## For API and agent users

Values are set with `custom_fields` on creating or updating an issue, keyed by slug or
field name: `{"Severity": "High", "Platforms": ["Web", "iOS"], "Reviewer": "@alex"}`; `null`
clears one. An agent uses `list_custom_fields`, `create_custom_field`, `update_custom_field`,
`delete_custom_field` and `set_field_values`, or passes `custom_fields` to `create_issue`,
`update_issue` and `bulk_update_issues`. Every argument is named, never an internal
number — see the [tool reference](./mcp-tools.md).
