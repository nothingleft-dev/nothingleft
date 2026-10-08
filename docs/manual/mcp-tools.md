# MCP tool reference

<!-- Generated from packages/mcp by `bun run --cwd packages/mcp docs:tools`. Do not edit by hand. -->

Every tool, resource and prompt the Nothing Left MCP server offers. [mcp.md](./mcp.md) explains how to connect an agent. Tools name things the way people do — `PP-12`, `@alex`, `"In Progress"` — and every tool takes an optional `org` (the organisation's slug) for when you belong to more than one.

## Discovery

### `whoami`

You, the token you are using (its scopes, project restriction and expiry), every organisation you belong to with your role and username there, and the projects you can reach. Call it first in a session.

*Reads only.*

No arguments.

### `list_orgs`

Organisations you belong to, with the slug to pass as `org`, your username and role in each, the plan and the seat count.

*Reads only.*

No arguments.

### `get_org`

One organisation: plan, owner, your role and username, seats, storage used, and the working day and week durations are read with.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `list_projects`

Projects you can see, with key, name, lead and your role. Without `org`, every organisation you belong to is listed, grouped by organisation.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `archived` | boolean |  | true for archived projects only, false for active only. Default: both. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

### `get_project`

One project: lead, your role, time tracking, archived state, the active sprint with days left and progress, today's issue figures (open, unassigned, overdue, due today, created and resolved in 7 days, open per assignee) and its description.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `describe_project_schema`

The map of one project, in one call: statuses with their category (and which resolve an issue), priorities, types, work types and work item attributes, the custom fields (slug, type, required, options, which types they apply to), the planned and active sprints, the boards and their columns, link names, who can be assigned, who may log time, and the tags in use. Call it once before writing issues or queries.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Search

### `search`

Issues and knowledge base articles in two groups for one query — the app's search box. One tag reaches both: `tag: payment-outage` finds the outage issues and the RCA written afterwards. Each group reads the query in its own language; one that cannot (e.g. `priority:` for articles) says why and shows nothing.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Words, a tag, or either query language. |
| `project` | string |  | Only this project. Default: every project you can read. |
| `limit` | number |  | Rows per group, 1–50. Default 10. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `search_issues`

Finds issues with the query language the search bar uses, e.g. `project: PP #Unresolved assignee: me priority: Critical, Major sort by: updated desc`. Attributes include project, status, priority, type, assignee, created by, updated by, tag, sprint (`sprint: {September 2026}`, `{No sprint}`), story points (`3 .. 8`), created, updated, resolved date, due date, estimation, spent time, has, links such as `subtask of: PP-12`, any custom field by its slug (`severity: High`, `launch: {This month}`) — whose values then show as extra columns — and free text. `#Unresolved`, `#me` are shortcuts. An unknown attribute or value is an error listing the valid ones; call suggest_query to explore. Returns a table.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The query, e.g. `project: PP #Unresolved assignee: me`. Empty lists everything you can read. |
| `project` | string |  | Limit to one project key, e.g. "PP". |
| `sort` | string |  | Overrides `sort by:` in the query, e.g. "priority, updated desc". |
| `group_by` | string |  | Adds per-group counts over the whole result: project, status, priority, type, assignee, tag, sprint, due, or custom:<slug> for a select, multi-select, user, multi-user or checkbox field. |
| `deleted` | boolean |  | true lists soft-deleted issues still restorable (Project Admins). |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

### `suggest_query`

Autocomplete for the search query language, as the search bar offers it: the attributes, values, operators and saved views valid at the caret. `for: "articles"` completes the knowledge base's language (search_articles) instead. Use it to learn what exists rather than guessing.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The query typed so far. Empty lists the attributes. |
| `caret` | number |  | Character position to complete at. Default: the end. |
| `for` | `issues` · `articles` |  | Which language: issues (default) or articles. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Issues

### `get_issue`

One issue by key: every field, tags, links and subtasks, the knowledge base articles that reference it, the latest comments and the description (cut at 8 KB with a marker; get_issue_description reads on). `include` adds watchers, voters or files.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `comments` | number |  | How many of the latest comments to show, 0–20. Default 5. |
| `include` | list of `watchers` · `voters` · `attachments` |  | Extra sections. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_issue_description`

Pages through an issue description too long for get_issue, from a character offset.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `offset` | number | yes | Character to start from, as the truncation marker says. |
| `length` | number |  | Characters to return. Default 8192. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `create_issue`

Creates an issue with everything in one call: title, markdown description, type, priority, status, assignees, tags (created on first use), estimate, story points, sprint, dates, parent, links and custom fields. Unset fields take the project defaults, and a custom field its default; describe_project_schema lists the valid values and which custom fields are required. Returns the new issue.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `title` | string | yes | One line, what is wrong or wanted. |
| `description` | string |  | The description, in markdown. |
| `type` | string |  | Type by name, e.g. "Bug"; describe_project_schema lists them. |
| `priority` | string |  | Priority by name, e.g. "Major"; describe_project_schema lists them. |
| `status` | string |  | Status by name, e.g. "In Progress"; describe_project_schema lists them. |
| `assignees` | list of string |  | Assignees: "@casey", "me" or a full name. |
| `tags` | list of string |  | Tags, by name or slug. A new name is created. |
| `estimate` | number or string |  | "1w 2d 3h 30m" (the organisation's working day and week) or whole minutes. |
| `story_points` | number |  | Story points, a whole number 0–999. |
| `sprint` | string |  | Sprint by name or slug, e.g. "September 2026"; "backlog" for none. |
| `start_date` | string |  | A calendar date, YYYY-MM-DD. |
| `due_date` | string |  | A calendar date, YYYY-MM-DD. |
| `parent` | string |  | Parent issue key, e.g. "PP-3": the new issue becomes its subtask. |
| `links` | list of object |  | e.g. [{ link: "depends on", issues: ["PP-4"] }]. |
| `custom_fields` | object |  | Custom field values by field name or slug, e.g. {"Severity": "High", "platforms": ["Web", "iOS"], "Reviewer": "@casey", "Launch": "2026-10-01", "Budget": 12.5, "Blocking": true, "Review time": "1h 30m"}. Options by name, people as @username, me or a full name, dates YYYY-MM-DD, datetimes ISO, durations "1h 30m". null clears one. describe_project_schema and list_custom_fields list the fields. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_issue`

Changes one issue: only the arguments you pass change, and null clears a field. Covers fields, custom fields, story points, sprint, parent, tags (add_tags / remove_tags, new names are created), watchers, and your own star, watch and vote — so a triage is one call. Returns the issue as it now is.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `title` | string |  | One line, what is wrong or wanted. |
| `description` | string or null |  | The new description, replacing the old, in markdown. null clears it. |
| `status` | string |  | Status by name, e.g. "In Progress"; describe_project_schema lists them. |
| `priority` | string |  | Priority by name, e.g. "Major"; describe_project_schema lists them. |
| `type` | string |  | Type by name, e.g. "Bug"; describe_project_schema lists them. |
| `assignees` | list of string |  | The whole new assignee list; [] unassigns everyone: "@casey", "me" or a full name. |
| `estimate` | number or string or null |  | "1w 2d 3h 30m" (the organisation's working day and week) or whole minutes. null clears it. |
| `story_points` | number or null |  | Story points, a whole number 0–999. null clears them. |
| `sprint` | string or null |  | Sprint by name or slug, e.g. "September 2026"; "backlog" for none. null moves it to the backlog. |
| `start_date` | string or null |  | A calendar date, YYYY-MM-DD. null clears it. |
| `due_date` | string or null |  | A calendar date, YYYY-MM-DD. null clears it. |
| `parent` | string or null |  | Parent issue key null makes it top-level. |
| `add_tags` | list of string |  | Tags to add, by name or slug. A new name is created. |
| `remove_tags` | list of string |  | Tags to remove, by name or slug. A new name is created. |
| `add_watchers` | list of string |  | Members to add as watchers: "@casey", "me" or a full name. |
| `remove_watchers` | list of string |  | Members to stop watching: "@casey", "me" or a full name. |
| `watch` | boolean |  | true to watch it yourself, false to stop. |
| `star` | boolean |  | true to star it, false to unstar. |
| `vote` | boolean |  | true to vote for it, false to take your vote back. |
| `custom_fields` | object |  | Custom field values by field name or slug, e.g. {"Severity": "High", "platforms": ["Web", "iOS"], "Reviewer": "@casey", "Launch": "2026-10-01", "Budget": 12.5, "Blocking": true, "Review time": "1h 30m"}. Options by name, people as @username, me or a full name, dates YYYY-MM-DD, datetimes ISO, durations "1h 30m". null clears one. describe_project_schema and list_custom_fields list the fields. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `bulk_update_issues`

Applies the same field changes to a list of issue keys, or to every issue a query matches (at most 500). Each issue is checked on its own; the answer lists what changed, what was already so, and each failure with its reason.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issues` | list of string |  | Issue keys. Give this or `query`. |
| `query` | string |  | Every issue it matches, as in search_issues. |
| `changes` | object | yes |  |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_issue`

Soft-deletes an issue: it disappears from every list and can be restored with restore_issue for 14 days, then is purged for good. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `restore_issue`

Brings back a soft-deleted issue within its 14-day window, with its comments, time and links.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_issue_activity`

What happened to an issue, newest first: field changes, comments, links, tags, files and time.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `kinds` | list of `created` · `field_changed` · `commented` · `comment_edited` · `comment_deleted` · `linked` · `unlinked` · `attached` · `detached` · `time_logged` · `tagged` · `untagged` · `sprint_changed` · `parent_changed` · `deleted` · `restored` |  | Only these kinds. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `cursor` | string |  | From the previous page's "Pass cursor" line. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Custom fields

### `list_custom_fields`

A project's custom fields: name, slug (the search attribute), type, whether required, the default, which issue types it applies to and its options. Pass `field` for one field's detail.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `field` | string |  | The field by name or slug, e.g. "Severity" or "severity". |
| `archived` | boolean |  | true lists only archived fields, false only live ones; default both. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `create_custom_field`

Adds a custom field to a project: name, type, options for a select, the issue types it applies to (all by default), required, a default, an empty label, and min / max / decimals for numbers. The slug — the search attribute — comes from the name unless given, and never changes. At most 50 live fields per project. Needs a Project Admin and admin:project.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `name` | string | yes |  |
| `type` | `text` · `markdown` · `number` · `integer` · `date` · `datetime` · `checkbox` · `select` · `multi_select` · `user` · `multi_user` · `url` · `duration` | yes | text (one line), markdown, number, integer, date, datetime, checkbox, select, multi_select, user, multi_user, url or duration. |
| `slug` | string |  | Lower-case letters, digits and hyphens, e.g. "severity". |
| `options` | list of string or object |  | select / multi_select: e.g. ["Low", {"name": "High", "color": "red-3"}]. |
| `applies_to` | list of string |  | Issue type names, e.g. ["Bug"]. Default every type. |
| `required` | boolean |  | New issues must have a value (a checkbox cannot be required). |
| `default` | string or number or boolean or list of string or null |  | Pre-filled on new issues, in the same form as a value. |
| `empty_label` | string |  | Shown when empty; default "No <name>". |
| `min` | number |  | number / integer: the smallest value. |
| `max` | number |  | number / integer: the largest value. |
| `decimals` | number |  | number: decimal places allowed. |
| `position` | number |  | 0 is first. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_custom_field`

Changes a custom field: rename it (the slug stays), required, default, empty label, the issue types it applies to, range, position, archive or unarchive; and its options — add, rename (every issue follows), recolour, reorder, archive, or remove (an option in use needs move_to). Archiving keeps every value; delete_custom_field destroys them. Needs a Project Admin and admin:project. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `field` | string | yes | The field by name or slug, e.g. "Severity" or "severity". |
| `name` | string |  |  |
| `required` | boolean |  |  |
| `default` | string or number or boolean or list of string or null |  | The new default; null removes it. |
| `empty_label` | string or null |  | null returns to "No <name>". |
| `applies_to` | list of string |  | Issue type names; [] applies to every type. |
| `min` | number or null |  |  |
| `max` | number or null |  |  |
| `decimals` | number or null |  |  |
| `position` | number |  |  |
| `archived` | boolean |  | true hides it and freezes its values; false brings it back. |
| `add_options` | list of string or object |  |  |
| `update_options` | list of object |  |  |
| `remove_options` | list of object |  |  |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_custom_field`

Deletes a custom field and every value it holds; history keeps what was recorded. A project using it as its Estimation or Spent time goes back to the built-in. To keep the values, archive it with update_custom_field instead. Asks you to confirm before acting. Needs a Project Admin and admin:project.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `field` | string | yes | The field by name or slug, e.g. "Severity" or "severity". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `set_field_values`

Sets custom field values on one issue or on many at once (the same values on each, each issue checked on its own). Only the fields you name change; null clears one. For other fields in the same call, use update_issue or bulk_update_issues with `custom_fields`.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issues` | string or list of string | yes | One issue key, or a list, e.g. ["PP-12", "PP-14"]. |
| `values` | object | yes | Custom field values by field name or slug, e.g. {"Severity": "High", "platforms": ["Web", "iOS"], "Reviewer": "@casey", "Launch": "2026-10-01", "Budget": 12.5, "Blocking": true, "Review time": "1h 30m"}. Options by name, people as @username, me or a full name, dates YYYY-MM-DD, datetimes ISO, durations "1h 30m". null clears one. describe_project_schema and list_custom_fields list the fields. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Links

### `link_issues`

Links an issue to others: relates to, depends on / is required for, duplicates / is duplicated by, subtask of / parent for. "subtask of" sets the parent. Returns the issue's links.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `link` | `relates to` · `is required for` · `depends on` · `is duplicated by` · `duplicates` · `parent for` · `subtask of` | yes | Read from `issue`: "PP-5 depends on PP-4" is issue PP-5, link "depends on", targets ["PP-4"]. |
| `targets` | list of string | yes |  |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `unlink_issues`

Removes one link between two issues. Returns the issue's remaining links.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `link` | `relates to` · `is required for` · `depends on` · `is duplicated by` · `duplicates` · `parent for` · `subtask of` | yes | Read from `issue`: "PP-5 depends on PP-4" is issue PP-5, link "depends on", targets ["PP-4"]. |
| `target` | string | yes | Issue key, e.g. "PP-12". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Comments

### `list_comments`

An issue's comments — or a knowledge base article's, with project and article — oldest first, each with the number update_comment and delete_comment take.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `cursor` | string |  | From the previous page's "Pass cursor" line. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `add_comment`

Adds a markdown comment to an issue, or to a knowledge base article (project and article). @username mentions notify. Returns the comment.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `body` | string | yes | The comment. @username mentions notify people exactly as in the app, in markdown. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_comment`

Replaces the text of a comment on an issue or an article. Contributors may edit only their own.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `comment` | number | yes | The comment number shown as "Comment 482". |
| `body` | string | yes | The comment. @username mentions notify people exactly as in the app, in markdown. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_comment`

Deletes a comment on an issue or an article, and the files attached to it. Contributors may delete only their own. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `comment` | number | yes | The comment number shown as "Comment 482". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Tags

### `list_tags`

The organisation's tags, shared by every project and by issues and knowledge base articles alike, with how many issues and articles you can see carry each. `for` ranks the ones used on that kind of thing first; `in_use` keeps only those in use (a project's knowledge base tag list: for: "articles", project, in_use: true). You need not list them before tagging: new names are created on first use.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `query` | string |  | Filter by name. |
| `for` | `issues` · `articles` |  | Rank tags used on issues, or on articles, first. |
| `project` | string |  | Count uses in this project only. |
| `in_use` | boolean |  | Only tags with a use (on the `for` kind, when given). |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

## Time tracking

### `log_time`

Logs spent time on an issue: a duration on one date (default today in your timezone), or the same duration on every working day from `from` to `to`. Work type defaults to the project's; the project's other work item attributes are set by name. Project Admins may log for another `author`. Returns the work items and the issue's new spent time.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `duration` | number or string | yes | "1w 2d 3h 30m" (the organisation's working day and week) or whole minutes. |
| `date` | string |  | The day the work was done. Default: today. |
| `from` | string |  | A range instead of `date`: first day. |
| `to` | string |  | Last day of the range, at most 62 days on. |
| `work_type` | string |  | e.g. "Development". |
| `attributes` | object |  | The project's work item attributes by name, e.g. {"Billable": "Yes"}; null clears one. describe_project_schema lists them. |
| `note` | string |  | What was done, in markdown. |
| `author` | string |  | Log on behalf of this member (Project Admins). |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `list_work_items`

The time logged on an issue, newest first; with `subtasks` also on everything below it.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `subtasks` | boolean |  | Include time logged on its subtasks. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `cursor` | string |  | From the previous page's "Pass cursor" line. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_work_item`

Changes one work item: duration, date, work type, work item attributes, note, or (Project Admins) author. Contributors may edit only their own.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `work_item` | number | yes | The work item number shown as "#7" by list_work_items. |
| `duration` | number or string |  | "1w 2d 3h 30m" (the organisation's working day and week) or whole minutes. |
| `date` | string |  | A calendar date, YYYY-MM-DD. |
| `work_type` | string or null |  | null logs it without a work type. |
| `attributes` | object |  | The project's work item attributes by name, e.g. {"Billable": "Yes"}; null clears one. describe_project_schema lists them. |
| `note` | string |  |  |
| `author` | string |  | A member: "@casey", "casey", "me", or their full name when only one member has it. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_work_item`

Deletes one work item; the issue's spent time drops by it. Contributors may delete only their own. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `work_item` | number | yes | The work item number shown as "#7" by list_work_items. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Files

### `list_attachments`

Files on an issue, its comments and its work items — or on a knowledge base article and its comments (project and article) — or only one comment's or work item's. `Inline` means the text shows it as an image.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `comment` | number |  | A comment number on the issue or article: the file belongs to it. |
| `work_item` | number |  | A work item number on the issue. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_attachment_url`

A download link for one file, valid for five minutes, after the same permission check the app makes.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `file` | string | yes | The file name, e.g. "login-bug.png", or the id list_attachments shows when two share a name. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `upload_attachment`

Attaches a file to an issue, a comment or a work item — or to a knowledge base article or a comment on it (project and article). Text you have in hand (a log excerpt, a markdown note) goes in `content` and is attached at once. A file on disk never passes through the conversation: give its `size_bytes` and `sha256` (base64: `openssl dgst -sha256 -binary FILE | base64`), run the curl command the answer gives, then call complete_upload.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `filename` | string | yes |  |
| `content` | string |  | Text to attach as the file, up to 1024 KB. |
| `size_bytes` | number |  | A file on disk: its exact size. |
| `sha256` | string |  | A file on disk: its SHA-256, base64. |
| `mime` | string |  | e.g. "image/png". Default: from the file name. |
| `comment` | number |  | A comment number on the issue or article: the file belongs to it. |
| `work_item` | number |  | A work item number on the issue. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `complete_upload`

Finishes an upload_attachment after the curl PUT: the file is checked and attached.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `upload` | string | yes | The upload id upload_attachment gave. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_attachment`

Deletes a file from an issue or an article for good; an image the text shows stops rendering. Contributors may delete only their own. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string |  | Issue key, e.g. "PP-12". |
| `project` | string |  | With article: its project key, e.g. "PP". |
| `article` | string |  | Instead of issue: a knowledge base article by slug or title, with project. |
| `file` | string | yes | The file name, e.g. "login-bug.png", or the id list_attachments shows when two share a name. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `list_files`

The organisation's files, largest first, with what each is attached to and where it is stored — the storage screen's data. Delete one with delete_attachment. Needs an Org Admin and a token with admin:org.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `project` | string |  | Only files in this project, by key. |
| `stored` | `platform` · `byo` |  | Only files in the platform bucket, or in your own. |
| `sort` | `size` · `created` |  | Largest first (default) or newest first. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

## Saved views

### `list_views`

The saved views you can see — your private ones, your projects' and the organisation's — with their queries.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_view`

A saved view's definition and its current results, as the app's tab shows them.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `view` | string | yes | The saved view's name, e.g. "My open bugs". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

### `create_view`

Saves a query under a name, for you alone or shared with a project or the organisation. Any query can then use it as `#{Name}`.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `query` | string | yes |  |
| `visibility` | `private` · `project` · `org` |  | Default private. |
| `project` | string |  | Required for project visibility. |
| `sort` | string |  | e.g. "priority, updated desc". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_view`

Renames a saved view or changes its query, sort or who it is shared with. Only its owner, or an admin for shared views, may.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `view` | string | yes | The saved view's name, e.g. "My open bugs". |
| `name` | string |  | New name. |
| `query` | string |  |  |
| `sort` | string or null |  | null drops the view's own sort. |
| `visibility` | `private` · `project` · `org` |  | private: only you. project: everyone in `project`. org: every member. |
| `project` | string or null |  |  |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_view`

Deletes a saved view; a shared one disappears for everyone it was shared with. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `view` | string | yes | The saved view's name, e.g. "My open bugs". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Agile

### `list_sprints`

A project's sprints — planned, active and completed — with dates, days left and progress. Without `project`, the sprints of every project you can read (default: the active ones).

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project key, e.g. "PP". |
| `state` | list of `planned` · `active` · `completed` |  | Only these states, e.g. ["planned", "active"]. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_sprint`

One sprint: dates, days left, goal, progress in issues and story points, the status breakdown, the daily burndown series and its issues in board order.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `sprint` | string | yes | Sprint by name or slug, e.g. "September 2026". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `create_sprint`

Plans a sprint in a project. Dates are optional (Unscheduled until set); `add_unresolved_from` brings in another sprint's unresolved issues. Needs Project Admin and admin:project. Put issues in with move_to_sprint.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `name` | string | yes | e.g. "September 2026". |
| `goal` | string |  | What the sprint is for, in markdown. |
| `start_date` | string |  | A calendar date, YYYY-MM-DD. |
| `end_date` | string |  | A calendar date, YYYY-MM-DD. |
| `add_unresolved_from` | string |  | Another sprint whose unresolved issues move into this one. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_sprint`

Renames a sprint or changes its goal or dates; null clears. A running sprint keeps both dates. Needs Project Admin and admin:project.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `sprint` | string | yes | Sprint by name or slug, e.g. "September 2026". |
| `name` | string |  | New name; the slug follows it. |
| `goal` | string or null |  |  |
| `start_date` | string or null |  | Start, YYYY-MM-DD; null clears it. |
| `end_date` | string or null |  | End, YYYY-MM-DD; null clears it. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `start_sprint`

Starts a planned sprint: one active sprint per project. It starts today unless start_date names another day; it keeps its planned end date, or takes end_date. Needs Project Admin and admin:project.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `sprint` | string | yes | Sprint by name or slug, e.g. "September 2026". |
| `start_date` | string |  | A calendar date, YYYY-MM-DD. |
| `end_date` | string |  | A calendar date, YYYY-MM-DD. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `finish_sprint`

Finishes the active sprint. Every unresolved issue moves to `move_unfinished_to` — "backlog" or a planned sprint — and the answer lists them. Resolved issues stay with the finished sprint. Needs Project Admin and admin:project.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `sprint` | string | yes | Sprint by name or slug, e.g. "September 2026". |
| `move_unfinished_to` | string | yes | "backlog", or the name of a planned sprint (create_sprint first if there is none). |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_sprint`

Deletes a planned sprint; its issues go back to the backlog. A sprint that has started cannot be deleted. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `sprint` | string | yes | Sprint by name or slug, e.g. "September 2026". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_backlog`

The planning view: the project's planned and active sprints with their progress, then one list in drag order — the backlog (issues in no sprint) by default, or a sprint's issues with `sprint`. `query` filters the list; the backlog defaults to #Unresolved.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `sprint` | string |  | List this sprint instead of the backlog. |
| `query` | string |  | Filter, as in search_issues. Default #Unresolved for the backlog. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

### `move_to_sprint`

Puts issues into a sprint, or back into the backlog with sprint: "backlog", at the bottom or before / after an issue already there. A completed sprint takes no new issues.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issues` | list of string | yes | Issue keys, in the order they should land. |
| `sprint` | string | yes | Sprint by name or slug, or "backlog". |
| `before` | string |  | Place them just above this issue. |
| `after` | string |  | Place them just below this issue. Give before or after, not both. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `reorder_backlog`

Changes the order of issues within the backlog or their sprint: places them, in the order given, just before or after another issue in the same list (or at the bottom). Their sprint does not change.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issues` | list of string | yes | Issue keys, in the order they should end up. |
| `before` | string |  | Place them just above this issue. |
| `after` | string |  | Place them just below this issue. Give before or after, not both. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_board`

A board on a sprint (default the active one): each column's statuses (or priorities or types, by what the board's columns are), card count (filter-aware when `query` is given) and WIP limits, the status breakdown, then the cards by swimlane and column in drag order. Without `board`, the project's first board.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | Project key, e.g. "PP". |
| `board` | string |  | Board by name or slug, e.g. "pp". |
| `sprint` | string |  | Default "current", the active sprint. |
| `query` | string |  | Filter the cards, as in search_issues. |
| `swimlane_by` | `none` · `values` · `issues` |  | Override the board's swimlanes for this read. |
| `swimlane_field` | `assignee` · `priority` · `type` |  |  |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `create_board`

Creates a board: columns mapped to statuses, priorities or types (a value sits in one column), optional WIP limits, and swimlanes. Without columns: To do · In progress · Done by status category, or one column per priority or type. Needs Project Admin and admin:project.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `name` | string | yes |  |
| `column_field` | `status` · `priority` · `type` |  | What the columns are: status (default), priority or type. Moving a card sets that field. Changed without columns, one column per value is made. |
| `columns` | list of object |  | Every column in order, e.g. [{ name: "Doing", values: ["In Progress"], wip_max: 3 }]. |
| `swimlane_by` | `none` · `values` · `issues` |  | none; values (one lane per swimlane_field value); issues (issues of swimlane_types, e.g. epics, as lanes). |
| `swimlane_field` | `assignee` · `priority` · `type` |  |  |
| `swimlane_types` | list of string |  | Types whose issues are lanes, e.g. ["Epic"]. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_board`

Renames a board, changes what its columns are (status, priority or type), replaces its columns (the whole list, in order: value mapping, WIP limits, collapsed) or changes its swimlanes. Needs Project Admin and admin:project.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `board` | string | yes | Board by name or slug, e.g. "pp". |
| `name` | string |  |  |
| `column_field` | `status` · `priority` · `type` |  | What the columns are: status (default), priority or type. Moving a card sets that field. Changed without columns, one column per value is made. |
| `columns` | list of object |  | Every column in order, e.g. [{ name: "Doing", values: ["In Progress"], wip_max: 3 }]. |
| `swimlane_by` | `none` · `values` · `issues` |  | none; values (one lane per swimlane_field value); issues (issues of swimlane_types, e.g. epics, as lanes). |
| `swimlane_field` | `assignee` · `priority` · `type` |  |  |
| `swimlane_types` | list of string |  | Types whose issues are lanes, e.g. ["Epic"]. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_board`

Deletes a board. Issues and sprints are untouched. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `board` | string | yes | Board by name or slug, e.g. "pp". |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Knowledge base

### `list_articles`

A project's knowledge base as a tree: titles and slugs, drafts marked. An article with sub-articles acts as a category. `deleted: true` lists what you could restore instead.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `deleted` | boolean |  | List the deleted articles you could restore, with their deadlines. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_article`

One knowledge base article as markdown: status, path, tags, the latest comments and the body (cut at 8 KB with a marker; call again with offset to read on). Issue keys in it are references you can open with get_issue.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `article` | string | yes | An article of the project by slug or exact title, e.g. "restoring-a-failed-sync"; list_articles shows them. |
| `offset` | number |  | Character of the body to start from, as the marker says. |
| `length` | number |  | Characters of the body to return. Default 8192. |
| `comments` | number |  | How many of the latest comments to show, 0–20. Default 3. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `search_articles`

Full-text search over knowledge base titles and bodies, with filters: `tag: rca, incident`, `status: draft`, `created by: me`, `updated by: @casey`, `updated: {minus 30d} .. Today`, `parent: {Runbooks}` (everything beneath it; `{No parent}` is the top level), `has: tag`, `sort by: updated desc`, and free words. Tags are shared with issues. Returns a table with an excerpt of each.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The article query, e.g. `tag: rca payment timeout`. Empty lists everything. |
| `project` | string |  | Only this project, e.g. "PP". Default: every project you can read. |
| `sort` | string |  | `created` or `updated`, with asc or desc. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `create_article`

Writes a knowledge base article in one call: title, markdown body, parent (up to three levels deep), place among its siblings, status and tags (new names are created). A draft by default. Mention issues by key (PP-12) and they list it under Referenced by; @username mentions notify. Returns the article.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `title` | string | yes |  |
| `body` | string |  | The article, in markdown. |
| `parent` | string |  | The article to put it under (slug or title). Default: the top level. |
| `status` | `draft` · `published` |  | "draft" (only you and Project Admins see it) or "published" (every project member). |
| `tags` | list of string |  | Tags, by name or slug. A new name is created. |
| `before` | string |  | Place it immediately before this sibling (slug or title). Without before or after it goes last. |
| `after` | string |  | Place it immediately after this sibling (slug or title). Without before or after it goes last. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_article`

Changes one article: only what you pass changes. Title, body (replaced whole), slug, publish or return to draft, move under another parent (null: top level) or before / after a sibling, add or remove tags, and your own star and watch. Renaming keeps the slug. Returns the article.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `article` | string | yes | An article of the project by slug or exact title, e.g. "restoring-a-failed-sync"; list_articles shows them. |
| `title` | string |  |  |
| `body` | string |  | The new body, replacing the old, in markdown. |
| `slug` | string |  | A new address; letters, digits and dashes. |
| `status` | `draft` · `published` |  | "draft" (only you and Project Admins see it) or "published" (every project member). |
| `parent` | string or null |  | Move it under this article (slug or title); null moves it to the top level. |
| `before` | string |  | Place it immediately before this sibling (slug or title). Without before or after it goes last. |
| `after` | string |  | Place it immediately after this sibling (slug or title). Without before or after it goes last. |
| `add_tags` | list of string |  | Tags to add, by name or slug. A new name is created. |
| `remove_tags` | list of string |  | Tags to remove, by name or slug. A new name is created. |
| `star` | boolean |  | true to star it, false to unstar. |
| `watch` | boolean |  | true to watch it, false to stop. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `delete_article`

Deletes an article, restorable for 14 days (restore_article). One with sub-articles needs `children`: "move_up" puts them in its place, "delete" deletes them with it. Contributors may delete only their own. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `article` | string | yes | An article of the project by slug or exact title, e.g. "restoring-a-failed-sync"; list_articles shows them. |
| `children` | `move_up` · `delete` |  | For an article with sub-articles: move them up a level, or delete them too. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `restore_article`

Brings back a deleted article within 14 days, with any sub-articles deleted along with it. A slug taken since gets a number; a parent that is gone puts it at the top level.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `article` | string | yes | The deleted article by slug or title; list_articles with deleted: true shows them. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Reports

### `run_report`

Runs one of the nine reports and returns its table with the series the chart is drawn from — the same numbers as the web chart and its CSV. Every issue report is scoped by `query` (the search language) and/or a saved `view`, within the projects you can read. Issues per field and Matrix group by any groupable field, custom fields by `custom:<slug>`. Burndown reads the sprint’s daily snapshots, with scope added as its own series. Time sums logged time by work type, user, issue, project or a work item attribute, against the estimate. Timesheet is people × days; with `user` it lists that person’s work items. An empty report says which filter produced nothing.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `report` | `issues-per-assignee` · `issues-per-project` · `issues-per-field` · `matrix` · `burndown` · `average-age` · `time` · `gantt` · `timesheet` | yes | issues-per-assignee, issues-per-project, issues-per-field (`field`), matrix (`row_field`, `column_field`), burndown (`project`, `sprint`, `measure`), average-age (`group_by`), time (`group_by`, period), gantt (`project`, `group_by`), timesheet (`users`, period; `user` with a one-day period lists that cell’s work items). |
| `query` | string |  | Scope, in the search query language, e.g. `type: Bug #Unresolved`; `sprint: {Sprint 14}` scopes to a sprint. |
| `view` | string |  | A saved view by name, ANDed with `query`. |
| `projects` | list of string |  | Narrow to these project keys. |
| `project` | string |  | burndown and gantt: the project. |
| `field` | string |  | issues-per-field groups by: project, status, priority, type, assignee, tag, sprint, due, or custom:<slug> for a select, multi-select, user, multi-user or checkbox field. |
| `by_category` | boolean |  | issues-per-field on status: the five status categories instead. |
| `row_field` | string |  | matrix rows: project, status, priority, type, assignee, tag, sprint, due, or custom:<slug> for a select, multi-select, user, multi-user or checkbox field. |
| `column_field` | string |  | matrix columns: project, status, priority, type, assignee, tag, sprint, due, or custom:<slug> for a select, multi-select, user, multi-user or checkbox field. |
| `include_unassigned` | boolean |  | issues-per-assignee: false leaves Unassigned out. |
| `unresolved_only` | boolean |  | average-age: default true; false also measures resolved issues. |
| `group_by` | string |  | average-age: a field as for `field`, or none. time: work_type (default), user, issue, project, or attribute:<Name>. gantt: epic, assignee or none. |
| `sprint` | string |  | burndown: sprint by name or slug; default the active one. |
| `measure` | `story_points` · `issue_count` · `remaining_estimate` |  | burndown: story_points (default), issue_count, remaining_estimate. |
| `period` | string |  | time, timesheet: `Last week`, `This month`, `2026-09`, `2026-09-01 .. 2026-09-14`. Default This week. |
| `from` | string |  | time, timesheet: first day, with `to`, instead of `period`. |
| `to` | string |  | A calendar date, YYYY-MM-DD. |
| `users` | list of string |  | timesheet: whose rows: "@casey", "me" or a full name. |
| `user` | string |  | timesheet: list this person’s work items in the period instead of the grid. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

## Notifications

### `list_notifications`

Your inbox across every organisation you belong to: one row per issue or article (twelve changes to one issue are one entry), newest first, with what happened and how much is unread. Name an issue, or a project and article, to see all of its notifications. Filter by kind, project, organisation or unread. A change arrives ten minutes after it was made, as it settled: a correction inside that window is one notification, and a change undone is none. Reading marks nothing read. Needs issues:read.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `unread_only` | boolean |  | Only entries with something unread. |
| `kind` | list of `assigned` · `unassigned` · `mentioned` · `commented` · `status_changed` · `resolved` · `linked` · `due_soon` · `overdue` · `time_logged` · `sprint_started` · `sprint_finished` · `article_published` · `article_updated` · `reaction` |  | Only these kinds, e.g. ["mentioned", "assigned"]. |
| `project` | string |  | Project key, e.g. "PP". |
| `issue` | string |  | One issue's notifications, e.g. "PP-12". |
| `article` | string |  | One article's notifications; needs project. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `cursor` | string |  | From the previous page's "Pass cursor" line. |

### `mark_notifications_read`

Marks notifications read: every one on the issues or articles named, or with all: true everything matching kind, project and org (the inbox's "Mark all read"). Returns how many changed and what is still unread. Needs a token with issues:write.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `issues` | list of string |  | Issue keys, e.g. ["PP-12"]. |
| `project` | string |  | With article, the article's project; with all, only this project. |
| `article` | string |  | An article of the project by slug or exact title, e.g. "restoring-a-failed-sync"; list_articles shows them. |
| `all` | boolean |  | Everything matching kind, project and org. |
| `kind` | list of `assigned` · `unassigned` · `mentioned` · `commented` · `status_changed` · `resolved` · `linked` · `due_soon` · `overdue` · `time_logged` · `sprint_started` · `sprint_finished` · `article_published` · `article_updated` · `reaction` |  | With all: only these kinds. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_notification_preferences`

Your email choice for every notification kind: off, instant, daily digest (9am your time) or weekly digest (Monday 9am). In-app notifications are always on. Needs a token with issues:read.

*Reads only.*

No arguments.

### `set_notification_preferences`

Chooses how each kind reaches you by email, by listing kinds under the option they get, e.g. instant: ["mentioned"], everything_else: "daily digest". all_off turns every email off first. Kinds not named keep their choice; reaction is in-app only. Needs a token with issues:write.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `instant` | list of `assigned` · `unassigned` · `mentioned` · `commented` · `status_changed` · `resolved` · `linked` · `due_soon` · `overdue` · `time_logged` · `sprint_started` · `sprint_finished` · `article_published` · `article_updated` · `reaction` |  | Kinds to email at once. |
| `daily_digest` | list of `assigned` · `unassigned` · `mentioned` · `commented` · `status_changed` · `resolved` · `linked` · `due_soon` · `overdue` · `time_logged` · `sprint_started` · `sprint_finished` · `article_published` · `article_updated` · `reaction` |  | Kinds for the daily digest, 9am your time. |
| `weekly_digest` | list of `assigned` · `unassigned` · `mentioned` · `commented` · `status_changed` · `resolved` · `linked` · `due_soon` · `overdue` · `time_logged` · `sprint_started` · `sprint_finished` · `article_published` · `article_updated` · `reaction` |  | Kinds for the weekly digest, Monday 9am your time. |
| `off` | list of `assigned` · `unassigned` · `mentioned` · `commented` · `status_changed` · `resolved` · `linked` · `due_soon` · `overdue` · `time_logged` · `sprint_started` · `sprint_finished` · `article_published` · `article_updated` · `reaction` |  | Kinds with no email. |
| `everything_else` | `off` · `instant` · `daily_digest` · `weekly_digest` |  | The option for every kind not named above (reaction stays off). |
| `all_off` | boolean |  | Turn every email off before applying the rest. |

## Projects and organisation

### `create_project`

Creates a project with the default statuses, priorities, types and work types. The key (the PP in PP-12) is derived from the name unless given, and freezes once the first issue exists. Needs an Org Admin.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `key` | string |  | 2–10 letters or digits, e.g. "PP". |
| `description` | string |  | What the project is for, in markdown. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_project`

Changes a project: name, key (only before its first issue), description, lead, time tracking on or off, which duration custom field is its Estimation or its Spent time, archived (read-only) or not. Needs a Project Admin and admin:project.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `name` | string |  |  |
| `key` | string |  | New key; refused once the project has an issue. |
| `description` | string or null |  |  |
| `lead` | string or null |  | The project lead; null for none. |
| `time_tracking` | boolean |  | false hides estimation and spent time and refuses logging; logged time is kept. |
| `estimation_field` | string or null |  | A duration custom field by name or slug that becomes the Estimation; null for the built-in. |
| `spent_time_field` | string or null |  | A duration custom field that shows the logged time as Spent time; null for the built-in. |
| `archived` | boolean |  | true makes the project read-only; false reopens it. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `update_project_schema`

Adds, changes or deletes one status, priority, type or work type in a project — or one of its own work item attributes (select attributes on logged time beside Work type, e.g. Billable) or one of their values (with `attribute`): rename, recolour, reorder, set the default, archive. Deleting a value in use needs `move_to`; deleting an attribute removes it from every work item. Every issue in the project sees the change, so it asks you to confirm before acting, and needs a Project Admin and admin:project.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `list` | `status` · `priority` · `type` · `work type` · `work item attribute` · `work item attribute value` | yes | Which value list. |
| `action` | `add` · `update` · `delete` | yes |  |
| `name` | string | yes | The value to add, or the existing one to change or delete. |
| `attribute` | string |  | work item attribute value: the attribute it belongs to, e.g. "Billable". |
| `new_name` | string |  | update: rename it. |
| `category` | `backlog` · `unstarted` · `started` · `done` · `cancelled` |  | Statuses: backlog, unstarted, started, done or cancelled. done and cancelled resolve an issue. |
| `color` | `gray-1` · `gray-2` · `gray-3` · `gray-4` · `gray-5` · `red-1` · `red-2` · `red-3` · `red-4` · `red-5` · `orange-1` · `orange-2` · `orange-3` · `orange-4` · `orange-5` · `yellow-1` · `yellow-2` · `yellow-3` · `yellow-4` · `yellow-5` · `green-1` · `green-2` · `green-3` · `green-4` · `green-5` · `teal-1` · `teal-2` · `teal-3` · `teal-4` · `teal-5` · `blue-1` · `blue-2` · `blue-3` · `blue-4` · `blue-5` · `pink-1` · `pink-2` · `pink-3` · `pink-4` · `pink-5` |  | Statuses, priorities, types: a label colour such as "blue-2". |
| `short_label` | string |  | The one-letter badge. |
| `position` | number |  | 0 is first. |
| `default` | `true` |  | Make it the default for new issues (or new time). |
| `archived` | boolean |  | Statuses and work types: hide it from pickers without deleting it. |
| `move_to` | string |  | delete: the value issues using it move to, when any do. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `create_org`

Creates an organisation with you as its Owner. The slug is derived from the name unless given.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `slug` | string |  |  |

### `update_org_settings`

Renames the organisation or changes its slug, working day, working week or first day of the week. Needs an Org Admin and a token with admin:org.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `name` | string |  |  |
| `slug` | string |  | The new slug. Links with the old one stop working. |
| `workday` | number or string |  | Length of a working day, e.g. "7h 30m": what "1d" means. |
| `workweek_days` | number |  | Working days in a week: what "1w" means. |
| `week_starts_on` | `Sunday` · `Monday` · `Tuesday` · `Wednesday` · `Thursday` · `Friday` · `Saturday` |  |  |

### `get_org_activity`

The organisation's audit log, newest first: invitations, joins, removals, role changes, projects and settings. Needs an Org Admin and admin:org.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `actor` | string |  | Only what this member did. |
| `kinds` | list of `member_invited` · `member_joined` · `member_removed` · `role_changed` · `invite_created` · `invite_revoked` · `project_created` · `project_archived` · `project_deleted` · `schema_changed` · `custom_field_changed` · `storage_connected` · `storage_disconnected` · `ownership_transferred` · `org_settings_changed` · `export_requested` · `token_created` · `token_revoked` · `project_updated` · `project_unarchived` · `invite_rotated` · `username_changed` · `deletion_scheduled` · `deletion_cancelled` · `storage_updated` |  |  |
| `from` | string |  | A calendar date, YYYY-MM-DD. |
| `to` | string |  | A calendar date, YYYY-MM-DD. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `cursor` | string |  | From the previous page's "Pass cursor" line. |

### `update_profile`

Changes your own name or timezone (an IANA name such as "Europe/London"), which date filters like `created: Today` are read in.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `name` | string |  |  |
| `timezone` | string |  |  |

## People

### `list_members`

Members of an organisation with their org role, or — with `project` — a project's members with their project role.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `project` | string |  | Project key, e.g. "PP". Lists that project's members instead. |
| `query` | string |  | Filter by username or name. |
| `limit` | number |  | Rows per page, 1–50. Default 20. |
| `offset` | number |  | Rows to skip, from the previous page. Default 0. |

### `get_member`

One organisation member: name, email (visible to org admins and to the member), org role, when they joined and who invited them.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `user` | string | yes | A member: "@casey", "casey", "me", or their full name when only one member has it. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `invite_member`

Emails an invitation to join an organisation, or a project within it. Up to 50 addresses per call; someone already invited gets a fresh email.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `emails` | list of string | yes | Email addresses to invite. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `project` | string |  | Project key, e.g. "PP". Invites into that project as well as its organisation. |
| `org_role` | `Member` · `Org Admin` |  | Role in the organisation. Default Member. |
| `project_role` | `Observer` · `Contributor` · `Project Admin` |  | Role in `project`. Default Contributor. Needs `project`. |

### `create_invite_link`

Creates a share link that lets anyone who opens it join the organisation, or a project within it. Optionally limit its uses, its expiry date or the email domain allowed to use it.

*Changes data.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `project` | string |  | Project key, e.g. "PP". Invites into that project as well as its organisation. |
| `org_role` | `Member` · `Org Admin` |  | Role in the organisation. Default Member. |
| `project_role` | `Observer` · `Contributor` · `Project Admin` |  | Role in `project`. Default Contributor. Needs `project`. |
| `max_uses` | number |  | How many people may join with it. Default unlimited. |
| `expires_on` | string |  | Last day the link works, as YYYY-MM-DD (UTC). Default: it never expires. |
| `allowed_email_domain` | string |  | Only accounts with an email at this domain may join, e.g. "acme.com". |

### `manage_roles`

Changes one member's organisation role, or their role in one project — adding them to the project or removing them from it. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `user` | string | yes | A member: "@casey", "casey", "me", or their full name when only one member has it. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |
| `org_role` | `Member` · `Org Admin` |  | New organisation role. Give this, or `project` with `project_role`. |
| `project` | string |  | Project key, e.g. "PP", whose role to change. |
| `project_role` | `Observer` · `Contributor` · `Project Admin` · `None` |  | New role in `project`. "None" removes them from the project; a role for a non-member adds them. |

### `remove_member`

Removes someone from the organisation: their open issues go to `reassign_to` or become unassigned, their saved views go to `transfer_views_to` or are deleted, their sessions and organisation-only tokens end. Their history stays, marked as a former member. Asks you to confirm before acting, with the real counts. Needs an Org Admin and admin:org.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `user` | string | yes | A member: "@casey", "casey", "me", or their full name when only one member has it. |
| `reassign_to` | string |  | Who takes over their open issues. Default: the issues become unassigned. |
| `transfer_views_to` | string |  | Who receives their saved views. Default: the views are deleted. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `list_invitations`

The organisation's invitations — or one project's — with status, the role each grants, and uses for share links.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string |  | For an invitation into a project, its key. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `get_invitation`

One invitation by email or link, with everyone who joined through it.

*Reads only.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `invitation` | string | yes | The invited email address, or the share link (the whole URL or its last part). |
| `project` | string |  | For an invitation into a project, its key. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `revoke_invitation`

Stops an invitation or share link from working. People who already joined stay. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `invitation` | string | yes | The invited email address, or the share link (the whole URL or its last part). |
| `project` | string |  | For an invitation into a project, its key. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

### `rotate_invite_link`

Replaces a share link with a new URL carrying the same role and limits; the old URL stops working. Asks you to confirm before acting.

*Changes data; asks you to confirm in your MCP client first.*

| Argument | Type | Required | Description |
|---|---|---|---|
| `link` | string | yes | The share link to replace. |
| `project` | string |  | For an invitation into a project, its key. |
| `org` | string |  | Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs. |

## Resources

A client can attach these as context. Any of them may end in `?org=acme`.

| URI | Description |
|---|---|
| `issue://{key}` | An issue as markdown: every field, links, the articles that reference it, the whole description and the latest comments. issue://PP-12, or issue://PP-12?org=acme when two of your organisations have PP. |
| `project://{key}` | A project's overview, figures, active sprint and its value lists: statuses, priorities, types, work types, custom fields, sprints, boards, people and tags. project://PP |
| `view://{name}` | A saved view's query and its first 50 results. view://My%20open%20bugs |
| `sprint://{project}/{sprint}` | A sprint: dates, days left, goal, progress in issues and points, the daily burndown and its issues in board order. sprint://PP/september-2026 |
| `board://{project}/{board}` | A board on its active sprint: columns with counts and WIP limits, then the cards by swimlane and column. board://PP/pp |
| `article://{project}/{slug}` | A knowledge base article as markdown: status, path, tags, the whole body and the latest comments. article://PP/restoring-a-failed-sync (the slug list_articles shows). |

## Prompts

### `triage-issue`

Reads an issue and its project, then proposes type, priority, tags and assignee with a reason for each.

| Argument | Type | Required | Description |
|---|---|---|---|
| `issue` | string | yes | Issue key, e.g. "PP-12". |
| `org` | string |  | Organisation slug, when you belong to more than one. |

### `find-duplicates`

Searches for issues like one you are about to file, before you file it.

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `title` | string | yes | The title you would give the new issue. |
| `description` | string |  | What it is about. |
| `org` | string |  | Organisation slug, when you belong to more than one. |

### `standup-summary`

What a person (default you) or a project changed since a date: done, in progress, blocked, and time logged — and, for you, what is waiting on you.

| Argument | Type | Required | Description |
|---|---|---|---|
| `user` | string |  | "me", "@casey" or a full name. Default me. |
| `since` | string |  | A date or a period the query language takes, e.g. "Yesterday" or "2026-09-21". Default Yesterday. |
| `project` | string |  | Project key, e.g. "PP". |
| `org` | string |  | Organisation slug, when you belong to more than one. |

### `write-release-notes`

Turns the issues resolved in a project over a date range (or matching a query) into user-facing release notes.

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `since` | string |  | First day, YYYY-MM-DD or a period such as "Last month". |
| `until` | string |  | Last day, YYYY-MM-DD. Default Today. |
| `query` | string |  | Instead of dates: a query selecting the issues, e.g. `tag: release-2.4`. |
| `org` | string |  | Organisation slug, when you belong to more than one. |

### `estimate-backlog`

Suggests an Estimation and story points for unestimated issues from the time and points similar resolved issues actually took.

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `query` | string |  | Which issues to estimate. Default: unresolved ones with no estimation. |
| `org` | string |  | Organisation slug, when you belong to more than one. |

### `sprint-report`

A narrative of a sprint's progress and risks: goal, days left, committed against done, scope added after the start, the burndown trend and the issues at risk.

| Argument | Type | Required | Description |
|---|---|---|---|
| `project` | string | yes | Project key, e.g. "PP". |
| `sprint` | string |  | Sprint name or slug. Default the active sprint. |
| `org` | string |  | Organisation slug, when you belong to more than one. |

### `document-this`

Turns a resolved issue, or a cluster of them, into a draft knowledge base article: a runbook, a root-cause write-up or a how-to.

| Argument | Type | Required | Description |
|---|---|---|---|
| `issues` | string | yes | One or more issue keys, comma-separated, e.g. "PP-12, PP-15". |
| `project` | string |  | Project key for the article. Default: the first issue’s project. |
| `parent` | string |  | An article to put it under, by slug or title. |
| `org` | string |  | Organisation slug, when you belong to more than one. |
