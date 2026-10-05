# Search Query Language

The most leveraged feature in the product. One grammar serves:

- the UI search bar
- saved view definitions
- board and backlog filters
- report scoping
- the MCP `search_issues` tool

There is exactly one parser, producing exactly one AST, compiled to SQL in
exactly one place. UI and MCP cannot drift because there is no second path.

Its syntax follows the `attribute: value` style that established issue trackers
share. That is deliberate: an LLM has already seen this style in its training
data, so it can write correct queries without few-shot examples. Inventing a
novel syntax would forfeit that.

## Grammar

### Basic form

```
attribute: value
```

Space between clauses means **AND**:

```
type: Bug status: Open assignee: me
```

Comma within a clause means **OR**:

```
status: Rejected, Duplicate
type: Bug, Feature
```

### Values with spaces

Braces:

```
status: {In Progress}
status: Open, {In Progress}, {Ready for QA}
tag: {area:billing}, {Partner Portal}
```

Braces are **required** for every multi-word value, including attribute
names used as values (`has: -{due date}`, `sort by: {due date} desc`).
Only a comma extends a value list: a second value with no comma in front of
it — `tag: {area:billing} {Partner Portal}`, `type: Bug Task` — is free text
ANDed with the clause.

### Negation

Prefix the value with `-`:

```
status: -Open                      -- not Open
status: -Resolved                  -- not in a resolved category
tag: -ui                          -- omit issues tagged ui
assignee: -me
type: -Epic, -Task
```

Negation applies per value, so `status: -Open, -Reopened` excludes both.
A braced value is negated the same way: `status: -{In Progress}`. A leading
`-` is **always** negation, even on numbers — `story points: -5` means "not
5", since no counted attribute can be negative.

### Bare-value shorthand

`#` followed by a value searches across every enum-like attribute — priority,
status, type, tag, sprint:

```
#Critical                         -- priority
#{Code Review}                    -- status
#{area:checkout}            -- tag
#{August 2026}                    -- sprint
#Unresolved                       -- category shortcut
#Resolved
#Star                             -- issues the caller has starred
```

`#Unresolved` and `#Resolved` are category shortcuts, resolving against
`workflow_statuses.category` rather than a status name — so they keep working
in projects that renamed their statuses. The same two words work as `status:`
values: `status: -Resolved` excludes the whole resolved category. `#Star` is
the third keyword shortcut, matching the caller's starred issues.

### Saved searches inline

```
#{Commented by me}
#{My open bugs} priority: Critical
```

A saved view referenced by name is expanded into its AST and composed with
the rest of the query.

### The `me` keyword

```
assignee: me
created by: me
commenter: me
work author: me
```

### Dates

Absolute, relative, and ranges:

```
created: 2026-09-19
created: 2026-01-01 .. 2026-09-19
created: Today
created: Yesterday
created: {This week}
created: {Last week}
created: {minus 7d} .. Today
due date: Today .. {plus 14d}
resolved date: {Last month}
updated: {minus 24h} .. Now
```

Relative units: `m` minutes, `h` hours, `d` days, `w` weeks, `M` months,
`y` years.

The complete date vocabulary (case-insensitive; braces wherever there is a
space):

| Form | Examples | Resolves to |
|---|---|---|
| ISO date | `2026-09-19` | that day |
| ISO month | `2026-09` | the whole month |
| Day keywords | `Today`, `Yesterday`, `Tomorrow` | one day |
| Weekday | `Monday` … `Sunday` | that day of the **current** week, per the organisation's *week starts on* |
| Periods | `{This week}`, `{Last week}`, `{Next week}`, `{This month}`, `{Last month}`, `{Next month}`, `{This year}`, `{Last year}`, `{Next year}` | the whole period |
| Offsets | `{minus 7d}`, `{plus 14d}`, `{minus 24h}` | one day (`d w M y`) or one instant (`m h`) from now |
| `Now` | `Now` | the current instant |

A range is `from .. to`; either side may be omitted or written as `*`
(`{minus 7d} .. *`, `* .. Today`). The `..` may be glued to its operands
(`2026-01-01..2026-09-19`). `{No due date}`, `{No start date}` and
`Unresolved` (for `resolved date`) name the empty value.

Date attributes evaluate against the **user's timezone** for instants, and
literally for calendar dates (`due date`, `start date`, `work date`).

### Existence

```
has: attachments
has: -description
has: -assignee
has: comments
has: -estimation
has: -{due date}
```

`has:` takes the name of any value-bearing attribute, plus `description`,
which is only ever tested for presence.

### Numeric and duration comparison

```
story points: 5
story points: 3 .. 8
spent time: {1d} ..
estimation: .. {4h}
votes: 1 ..
```

An open-ended range omits one side or writes it as `*`. Durations use the
`1w 1d 1h 1m` form from `packages/format`; braces are optional for a single
unit (`{4h}` and `4h` are the same). `{No estimation}`, `{No spent time}`
and `{No story points}` name the empty value.

### Link traversal

Match issues by a property of their linked issues:

```
aggregate Subtask of: {status: Open}
aggregate Parent for: {status: -Resolved}
aggregate Duplicates: {project: PMS}
aggregate Is duplicated by: {#Critical}
```

Reads as: "issues whose subtask-of parent matches this subquery". The
subquery is a full query in the same grammar, braces nesting as needed
(`aggregate Subtask of: {status: {In Progress}}`).

A link name used directly as an attribute takes issue keys:

```
subtask of: PMS-88                -- the children of PMS-88
relates to: PMS-1, PMS-2
depends on: -PMS-3
```

Link names come from `issue_links` in data-model.md: `relates to`,
`depends on`, `is required for`, `duplicates`, `is duplicated by`,
`subtask of`, `parent for`. `key: PMS-1, PMS-2` matches issues by their own
key.

### Sorting

```
sort by: updated desc
sort by: priority asc, updated desc
```

Sortable: `created`, `updated`, `resolved date`, `due date`, `start date`,
`priority`, `status`, `type`, `story points`, `estimation`, `spent time`,
`votes`, `key`, and any orderable custom field. A key without a direction
sorts **ascending**; multi-word keys take braces (`sort by: {due date} desc`).

### Free text

Anything not matching an attribute clause becomes a full-text term against
title and description:

```
login redirect loop
login redirect status: Open
```

Quote to search a phrase: `"login redirect loop"`. A braced token outside a
clause is also a phrase (`{login}`).

A word glued to a colon is always read as an attribute, so an unknown one
(`foo: bar`, or a bare URL) is a **parse error** naming the valid
attributes, never silent free text. Quote it to search for it literally.

## Attributes

| Attribute | Matches |
|---|---|
| `project` | Project key or name |
| `status` | Status name, or `#Resolved` / `#Unresolved` by category |
| `type` | Issue type |
| `priority` | Priority |
| `assignee` | Any assignee; `Unassigned` for none |
| `created by` | Issue creator |
| `updated by` | Last editor |
| `commenter` | Anyone who commented |
| `commented` | Date of a comment |
| `comments` | Substring match over comment bodies — **not** full-text indexed |
| `created`, `updated`, `resolved date` | Instants |
| `due date`, `start date` | Calendar dates |
| `sprint` | Sprint name |
| `tag` | Tag name or slug |
| `attachments` | Attachment filename (filenames only; contents are not indexed) |
| `work author` | Who logged time |
| `work type` | Development, Testing, … |
| `spent time`, `estimation` | Durations |
| `story points`, `votes` | Numbers |
| `key` | Issue key (`PMS-118`) |
| `has` | Existence checks |
| `sort by` | Ordering |
| `<link name>` | Issues linked to the given keys (`subtask of: PMS-88`) |
| `aggregate <link name>` | Link traversal by subquery |
| *any custom field slug* | By its declared type |

Attribute names are case-insensitive and tolerate the spaces shown
(`created by:`, `work author:`, `sort by:`). **Values are case-insensitive
too**: `type: bug`, `type: Bug`, `Type: BUG`, `#ui` and
`#UI` are the same search. The parser keeps the value as typed and the
compiler matches names, tags, keys and usernames without regard to case
(`lower(name) = lower($1)`, or the existing case-insensitive unique index). The empty value is `Unassigned`
for `assignee`, `Unresolved` for `resolved date` and `{No <attribute>}`
elsewhere (`{No sprint}`, `{No due date}`).

## Autocomplete

`GET /v1/search/suggest?q=<query>&caret=<offset>` returns completions for the
token under the caret. Server-side, so the MCP server exposes the same
capability to an agent that the UI gives a human.

The dropdown shows, in order:

1. **Attribute completions** with their description — `commenter:` → *by
   commenter*, `created by:` → *by reporter*, `work author:` → *by work
   author*.
2. **Value completions**, grouped and labelled by source — `#Critical` →
   *Priority*, `#{Code Review}` → *Status*, `#{area:billing}` → *tag*,
   `#{August 2026}` → *Sprints*.
3. **Saved searches** — `#{Commented by me}` → *saved search*.
4. **Recent searches**, from `recent_searches`.

`Tab` completes the first item. The footer reads *"Press ⇥ to complete first
item"*.

## Implementation

```
packages/query/src/
├── tokenizer.ts     string → tokens (lenient mode for half-typed queries)
├── parser.ts        tokens + registry → AST; throws QueryError(code, span, params, validValues)
├── ast.ts           the typed AST; the single IR
├── expand.ts        #{Name} → the saved view's AST, recursively, refusing cycles
├── check.ts         values against the caller's vocabulary → query.invalid_value + valid_values
├── render.ts        AST → canonical string (saved views, the URL bar)
├── dates.ts         date keyword → calendar period, given today and week start
├── suggest.ts       query + caret + value provider → completions
└── registry/        issues.ts, articles.ts — the two vocabularies
packages/query/test/ every example in this document, as a table-driven case

packages/db/src/search/issue-query.ts        AST → SQL: the predicate and the ORDER BY
packages/db/src/repositories/issue-search.repository.ts
                                             list page, group counts, figures, vocabulary,
                                             value suggestions — all over that one predicate
```

**The compiler lives in `packages/db`, not `packages/query`** (decided 24 Sep
2026). Rule 14 puts every query in the repository layer, so the grammar
package stays pure and the one place that writes SQL is a module the issue
search repository owns. The pipeline, in `@services/search.service`:

1. **Scope.** The caller's readable projects in the current organisation
   (every project for an Org Admin or the owner, explicit memberships
   otherwise, narrowed by a personal access token's project list). `project=`
   on a request narrows it to one. The compiler ANDs this, `org_id` and
   `deleted_at IS NULL` in front of everything, so a list, a group count, a
   figure or a CSV row can never include an issue the caller could not open —
   and a link or `aggregate` target outside the scope matches nothing.
2. **Parse**, then **expand** `#{Name}` against the saved views the caller can
   see.
3. **Check** every named value — status, priority, type, tag, work type,
   project, sprint, person, and every `#value` — against the names that exist
   in scope. A miss is `400 query.invalid_value` with `valid_values`, never a
   silent empty list, so an agent can correct itself.
4. **Compile** to one predicate plus the order, and run it for the page, the
   group counts and the total alike — which is why the counts always agree
   with the list.

The AST is the contract. Saved views persist it, the MCP tool accepts the
string form *or* the AST, reports scope by it, and the compiler is the only
thing that writes SQL. The parser is the highest-risk component in the system
and gets exhaustive table-driven tests — every example above is a test case.

The parser is **registry-driven**: `issueRegistry({ customFields })` and
`articleRegistry()` supply the attribute names, their value types, which are
sortable, which take part in `#value`, their empty-value label and the link
names. Custom field slugs are registered per organisation at parse time, so
an unknown attribute is an error with `valid_values`. The registry also
carries the description and group labels as `en.json` keys
(`query.attribute.*`, `query.group.*`), so nothing user-facing is a literal.

Errors are `QueryError` with a catalogue code (`query.unknown_attribute`,
`query.missing_value`, `query.invalid_value`, `query.not_sortable`,
`query.unknown_link`, `query.expected_subquery`, `query.invalid_range`,
`query.unbalanced_braces`, `query.unterminated_quote`,
`query.unexpected_token`), the offending character span and, where it helps,
the list of valid values. The API wraps them in `AppError` (1c).

### Decisions

| Date | Decision |
|---|---|
| 24 Sep 2026 | Braces are required for multi-word values everywhere, including `has:` and `sort by:` names; the earlier `has: -due date` example was wrong. |
| 24 Sep 2026 | Only a comma extends a value list. `tag: {a} {b}` is `tag: {a}` AND free text `b`. |
| 24 Sep 2026 | The relative-date vocabulary is the complete symmetric set: Today/Yesterday/Tomorrow/Now, weekdays, This/Last/Next × week/month/year, `{minus Nu}` / `{plus Nu}`, ISO month, `*` as an open range side. |
| 24 Sep 2026 | Link names are attributes taking issue keys (`subtask of: PMS-88`) alongside `aggregate <link>: {…}`. `key:` is an attribute so it can be sorted on and matched. |
| 24 Sep 2026 | `sort by:` defaults to ascending. `#Star` joins `#Resolved` / `#Unresolved`. `-` is always negation, including on numbers. An unknown `word:` is a parse error, not free text. |
| 24 Sep 2026 | The status attribute is `status:`, not `state:` — the product says Status everywhere (owner decision). Issue and article registries share the name. |
| 24 Sep 2026 | The AST carries no source positions; `parse()` returns clause spans beside it for the suggestion engine and error highlighting. |
| 24 Sep 2026 | The compiler is `packages/db/src/search/issue-query.ts`, not `packages/query/compile.ts` (rule 14). `packages/query` gains `expand.ts` and `check.ts`, both pure. |
| 24 Sep 2026 | A value that names nothing in the caller's scope is an error (`query.invalid_value` with `valid_values`), not an empty result. Query errors carry `span` in the error envelope. |
| 24 Sep 2026 | `#{Name}`: a saved view the caller can see wins; otherwise the name is ORed across priority, status, type and tag (and sprint, once sprints exist); otherwise it is an error. Among views of one name, the caller's own wins, then a project view, then an org view. A view that reaches itself, or nests deeper than 5, is `query.saved_view_cycle`. |
| 24 Sep 2026 | With no `project:`, a search covers every readable project in the current organisation, archived ones included. |
| 24 Sep 2026 | Until sprints exist (agile phase), `sprint: {No sprint}` matches every issue and any sprint name is `query.invalid_value`. Numeric and duration ranges (5.10) compile already. Custom fields are not registered until M4. |
| 26 Sep 2026 | Phase 3: `sprint:` takes a sprint's name or slug and matches that sprint in every readable project; `{No sprint}` is the backlog; `has: sprint` any sprint; `#{Sprint name}` joins the shorthand OR. Unknown names are `query.invalid_value` with the readable projects' sprint names. The list groups by `sprint` (active, planned, completed, then *No sprint*). The backlog and the board list their issues in drag order (`issues.rank`) rather than by `sort by:`. |
| 26 Sep 2026 | Phase 4: custom fields register by slug from the fields of the readable projects (archived ones included, since their values stay searchable), one attribute per slug — the slug means one kind of value across the organisation, enforced when a field is created. Kinds map to the grammar: text / markdown / url → substring; number / integer → number (a negative value is braced, `{-5}`); duration; date → calendar date; datetime → instant; checkbox → a new `boolean` type taking `Yes` / `No` (never empty); select / multi-select → enum, in the `#value` shorthand; user / multi-user → person, with `me`. The empty value is the field's empty label (`{No Severity}`). A value counts only where the field applies to the issue's type. Sortable except text kinds: options by position, people by username, the smallest value of a multi field. `valid_values` for an option lists that slug's options across the scope. `group_by=custom:<slug>` for option, person and checkbox fields. A duration field that is a project's Spent time matches the rollup there; `estimation:` reads a project's Estimation field when it has chosen one. |
| 24 Sep 2026 | Order: the request's `sort=` (a `sort by:` value list), else the query's `sort by:`, else relevance (`ts_rank`) when there is free text, else newest first; the issue id breaks every tie. A saved view's own `sort by:` applies when the outer query has none. Every key sorts nulls last. |
| 24 Sep 2026 | A free-text word that is an issue key (`PMS-12`) also matches that issue. A stop-word-only term (`the`) filters nothing rather than everything. A negated value keeps issues where the field is empty (`due date: -Today` keeps issues with no due date). |
| 24 Sep 2026 | Instants resolve in the caller's `users.timezone`; weeks start on the organisation's `week_starts_on`. A sub-day offset on its own (`updated: {minus 24h}`) means "since then". `comments:` and `attachments:` are case-insensitive substring matches. |
| 24 Sep 2026 | Grouping (`group_by`): project, status, priority, type, assignee, tag, due. Status, priority and type merge across projects by name. A multi-valued field lists an issue once per value. `due` buckets: Overdue, Today, This week, Later, No due date. |
| 27 Sep 2026 | Phase 5: reports run the same pipeline and aggregate over the compiled predicate; their grouping is the list's own (`packages/db/src/search/issue-groups.ts`, moved out of the search repository), plus a `status_category` grouping for reports' *group by category*. Every report group carries the query for its issues, built from the AST and rendered with `render.ts`; a report's `period` is read with the date vocabulary above. |
| 24 Sep 2026 | Recent searches: recorded for session callers only, newest 20 per user and organisation. |

## HTTP surface

| Route | What |
|---|---|
| `GET /v1/issues?q=&project=&group_by=&sort=&limit=&offset=` | The list. `meta.groups` when grouped |
| `GET /v1/issues/export.csv?q=&project=&sort=&columns=` | The same query, streamed, 10,000 rows at most |
| `GET /v1/issues/figures?q=&project=&per=project` | Counts over the same query, for the dashboard and project pages |
| `GET /v1/search/suggest?q=&caret=` | Autocomplete |
| `DELETE /v1/search/recent` | Forget the caller's recent searches |
| `/v1/saved-views`, `/v1/saved-views/{name}` | Saved views, addressed by name |

Full shapes in `docs/openapi.yaml`.

## A second attribute registry: articles

The knowledge base reuses this **tokenizer and parser** with a different,
much smaller attribute registry — `tag`, `status`, `created by`,
`updated by`, `created`, `updated`, `parent`, `has`, `sort by`, plus free text.

One grammar engine, two vocabularies. Articles stay out of the issue
attribute set, where `status:`, `assignee:` and `sprint:` are meaningless for
a document, without paying for a second parser.

```
packages/query/
├── registry/issues.ts      the attribute set documented above
└── registry/articles.ts    the reduced set
```

As built in 3.5 (26 Sep 2026): the compiler is `packages/db/src/search/article-query.ts`,
beside the issue compiler, and scopes every query before any filter — live articles in
readable projects that are published, the caller's own drafts, or drafts in projects they
administer. `status:` takes Draft and Published (and `#draft`); `parent:` takes an article's
title or slug and matches **everything beneath it**, `{No parent}` the top level; `sort by:`
takes `created` and `updated`; free text is ranked by `ts_rank`, else newest update first. A
miss is `query.invalid_value` with `valid_values` (the two statuses, the organisation's tags,
readable article titles, members); an issue attribute is `query.unknown_attribute`.
`GET /v1/search` reads one query with both registries and answers two groups; a group whose
registry refuses the query carries the error instead of rows, and the request fails only when
both refuse it. Autocomplete takes `kind=articles`.

## Counts

Every surface that shows a filtered list also shows counts computed **from the
same AST**, so they always agree with what is displayed:

- issue list: count per group header
- board: count per column, plus the status-distribution strip
  (*"58 cards in status Open"*)
- reports: series totals

One aggregate query per view, derived from the same AST as the list query.
