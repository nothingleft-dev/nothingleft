# Analytics

PostHog, for product analytics and error tracking. This document is the
contract for what leaves an instance: which events exist, what they carry, and
what is never sent.

## Kill switches

Two independent flags, because the two uses have different costs and
different risks:

```
POSTHOG_ANALYTICS_ENABLED=true     # product events
POSTHOG_ERRORS_ENABLED=true        # exception capture
POSTHOG_REPLAY_ENABLED=false       # session replay — off by default
POSTHOG_SAMPLE_RATE=1.0            # 0.0–1.0, for high-volume events
POSTHOG_KEY=
POSTHOG_HOST=
```

Both sit behind a one-file adapter. When a flag is false the adapter is a
no-op — nothing is queued, nothing is buffered, nothing is sent. The
application never depends on PostHog being reachable.

Separating them matters: product analytics can be dropped while error
tracking stays on, rather than losing both.

### Logs

```
LOG_TARGETS=json,posthog           adds PostHog Logs to the API's log targets
```

With `posthog` in `LOG_TARGETS` (`docs/backend-guide.md#logging`), the API also ships every
warn, error and fatal line to PostHog Logs over OpenTelemetry's HTTP format, with the same
`POSTHOG_KEY`. Info and below stay on the host. Lines are already redacted before any target
sees them (database errors, cookies, authorisation headers); this target also drops the request
and response objects (client IP, host, full URL), email subjects and the host name, and keeps an
error's type, message, stack and code only. Lines are sent in batches every five seconds; when
PostHog is unreachable a batch is dropped and the host's own log still has it.

### Session replay

**Session replay ships off.** It records customers' confidential issue text,
comments and attachment names. For a tool whose entire content is other
companies' internal work, replay is a privacy liability before it is a
debugging aid. If it is ever enabled, all text inputs and issue bodies must be
masked.

`POSTHOG_SAMPLE_RATE` exists for the handful of high-volume events — page
views, search executions — so those can be sampled to 10% without losing the
low-volume events.

## Privacy rules

Non-negotiable, because this product holds other organisations' internal
data.

**Never sent to PostHog:**

- Issue titles, descriptions, comment bodies, article bodies
- Search query text
- Attachment filenames
- Email addresses, real names, avatar URLs
- Organisation or project names
- Tag names, custom field names or values

**Sent instead:** internal IDs, counts, enum values, durations, booleans.

So `issues_searched` carries `{ via: "web", clause_count: 3, grouped: true,
result_count: 42, custom_attribute_count: 1 }` — never the query. That says
how people search, without the text they typed.

Users are identified by their internal ID, sent as a prefixed string
(`user_1234`, `org_56`) so the two namespaces never collide in PostHog. If
you need to know which organisation a number belongs to, look it up in your
own database.

### The public repository is the enforcement

This is **telemetry, not surveillance**, and because the repository is
public, anyone can read `packages/analytics` and verify exactly what leaves
their instance. The event catalogue and the property allow-list are the
privacy policy, in a form that cannot quietly diverge from it.

That auditability is an asset, not a constraint. A closed-source tracker
asking to collect usage data is asking for trust; an open one is offering
proof.

### Google Analytics on the web app

Off unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set at build time; deploys copy it from the
marketing site's ID, so one GA4 property sees a visit and the sign-up it led to.

**Auth pages only.** It exists to measure sign-up conversion, so the tag loads only on the
routes in `lib/auth-routes.ts` (sign-in, sign-up, reset, verify, the OAuth callback, unsubscribe
and the invite page). Leaving them sets GA's own `ga-disable-<ID>` flag, queued through the
data layer so an event sent just before is still processed, and a page opened anywhere else
never loads the tag. Two events besides page views, GA4's recommended ones: `sign_up` when an
account is created and `login` on sign-in, each with `method` (`email`, `google` or `github`)
and nothing else. Mark `sign_up` as the key event in the property.

When it is on, the tag never
sees a real URL or title: `components/site-scripts.tsx` turns off the automatic page view and
sends its own, built by `lib/analytics/page-context.ts`. The location keeps only the words of
the route scheme, so `/issue/PP-847/fix-login` becomes `/issue/:id/:id` and
`/invite/<token>` becomes `/invite/:id`. The query string and fragment are dropped, which
covers search text, emails and reset tokens. The title is always `Nothing Left`, since page
titles carry issue and article titles. A referrer from inside the app is redacted the same
way; one from elsewhere is cut to its origin. The location is also `set` for every later event,
so enhanced measurement reports it instead of the real URL. A path word the list does not
know is redacted, so a new route leaks nothing until it is added.

In the property's stream settings, turn off *Page changes based on browser history events*;
the app sends its own page views on navigation, and leaving it on counts each one twice.

### Google Analytics on the marketing site

Off unless `PUBLIC_GA_MEASUREMENT_ID` is set when `apps/marketing` is built; with no ID the
pages carry no tag, no notice and no notice script. Production uses the same GA4 property and
stream as the web app. Every page loads the tag
(`src/components/analytics/GoogleAnalytics.astro`), and it sends page views only. As in the
app, the automatic page view is off and the page sends its own: the location is the origin and
path, with the query string and fragment dropped, since docs search text can sit there (so
campaign tags on links are not reported either); a referrer from this site keeps only its path, one from elsewhere is cut to its
origin. The location is `set` for later events too. Page titles are sent as they are: every
page on the site is public. A script that fails to load from Google never removes the `js`
class, so the site's own components keep working when the tag is blocked.

### The cookie notice

Both sites show the same notice wherever the tag loads, and only when an ID is set: on the
marketing site every page, in the web app the auth pages. It tells visitors that analytics
runs and links to the privacy policy; it does not gate the tag, and there is nothing to reject
(owner's decision, 12 Oct 2026). A card at the bottom left (full width with margins on a
phone) with *Accept*, a close button and a 2px bar that runs down over 10 seconds, after which
the notice closes itself. Hovering it, focusing inside it or leaving the tab pauses the count;
under reduced motion the bar is hidden and the count still runs. It never takes focus.

Accepting, closing or the count running out all set `nl_notice_dismissed=1` for a year, with
`Domain=.nothingleft.dev` on those hosts (host-only elsewhere, such as localhost), `Path=/`,
`SameSite=Lax` and `Secure` over HTTPS. Both sites read the same cookie, so closing the notice
on one hides it on the other. Marketing: `src/components/analytics/CookieNotice.astro` and
`src/scripts/cookie-notice.ts`, rendered hidden and shown by script, so a visitor without
JavaScript never sees a notice they could not close. Web app: `components/cookie-notice.tsx`,
rendered from `components/site-scripts.tsx` after hydration, so the server never renders it.

### Self-hosters

`apps/api/.env.example` and `infra/docker/.env.example` (the Docker Compose settings) ship with:

```
POSTHOG_ANALYTICS_ENABLED=false
POSTHOG_ERRORS_ENABLED=false
```

Someone running their own instance should never send telemetry to us by
accident. Defaulting these on would be the kind of thing that ends up on
Hacker News, deservedly.

## Events

The full catalogue, with every property, is `EventCatalogue` in
`packages/types/src/events.ts`. What each area emits:

### Requests and errors

`api_request` on every response (route pattern, method, status, duration, `via`; sampled), and
`api_error` on every failed request (status 400 and above): the route pattern, method, status,
the catalogue error code (`issue.not_found`, `validation_failed`, `internal`) and `via`. A path
that matches no route sends neither. Never the URL.

### Accounts and onboarding

All server-side, where the fact is recorded:

| Event | Emitted by |
|---|---|
| `account_created { method }` | accounts service |
| `organization_created` | organisations service |
| `project_created { key_generated }` | projects service |
| `issue_created { via, … }` | issues service |
| `user_active_day { via, days_since_signup }` | credential resolution (auth service), once per user per UTC day |

`user_active_day` is deduplicated with a Redis `SET NX` that expires with the day; with
Redis down it may fire twice, never zero times. Every issue event carries the
`organization` group. `invitation_accepted` carries the seconds from creation to
acceptance, for the median time to accept — never who was invited.

### Boards and sprints

`sprint_created` (scheduled, carried-over count), `sprint_started` (issues, points),
`sprint_finished` (completed, unfinished, to backlog or a sprint), `backlog_moved` (count,
whether the sprint changed), `board_created` (columns, swimlanes), and `board_viewed` /
`backlog_viewed` — at most once per user per board (or project backlog) per UTC day,
because those pages poll every 30 seconds.

### Custom fields and time tracking

`custom_field_created` (type, required, has a default, scoped to types, option count),
`custom_field_archived` (type), `custom_field_values_set` (how many fields one issue write
changed, and `via`), `work_item_attribute_created` (value count) and `time_fields_changed`
(built-in or custom, for each); `issues_searched` carries `custom_attribute_count`. Never a
field's name, slug, option or value.

### Knowledge base

`article_created` (status, depth, tag count, `via` with `mcp`), `article_published` (each
draft-to-published change), `article_moved` (reparented or only reordered),
`article_deleted` (whether children moved up or went too, and how many), `article_restored`
(how many came back), `article_viewed` (at most once per user per article per UTC day),
`articles_searched` (clause count, free text or not, result count) and `global_searched`
(the two group totals); `tags_applied` carries `entity`. Never a title, slug, body, tag or
query.

### Reports

`report_viewed` (which of the nine reports, `via` with `mcp`, whether it was empty, whether
it came from the cache, how many groups it had and how many projects it covered) at most
once per user per report per UTC day, and `report_exported` (the report and `via`) on every
CSV. Never a query, a group label, a name or a figure.

### Notifications

`notification_preferences_changed` (how many kinds changed, how many now sit on each email
option, whether it was *turn everything off*, `via`), `notifications_read` (how many, and
whether one, a subject's or all), `notification_email_sent` (the kinds and how many
notifications one instant email carried), `digest_sent` (cadence, notification, project and
kind counts) and `email_unsubscribed` (a kind or a digest cadence, the kind when one, and
whether it was the one-click header). Never an issue, a title, a summary line or an address.

### Account security and organisation lifecycle

`two_factor_enabled`, `two_factor_disabled` (whether a recovery code confirmed it),
`recovery_code_used` (how many are left), `recovery_codes_regenerated`,
`account_deactivated` (by the holder or the operator), `account_reactivated`,
`org_deletion_scheduled` (live members), `org_deletion_cancelled` (days left), `org_deleted`
(projects, issues and platform objects removed), `ownership_transfer_started` (whether it
replaced a pending one), `ownership_transferred` (seconds to accept) and `avatar_mirrored`
(the provider); `signed_in` carries `second_factor` (`none`, `totp`, `recovery_code`). Never
an email, a name, a code or a secret.

### Storage

`byo_storage_connected` (the provider, and whether it was a key rotation),
`byo_storage_check_failed` (provider, the step and the reason), `byo_storage_failed` (a
verified bucket that started refusing its key: provider, step, reason),
`byo_storage_migration_started` (provider, files and bytes left on the platform, whether it
is a retry), `byo_storage_migration_finished` (provider, files and bytes moved, files
skipped, seconds), `byo_storage_migration_failed` (provider, files moved so far, step,
reason), `byo_storage_disconnected` (provider, files and bytes left in the bucket, days
connected) and `storage_reconciled` (the drift in bytes, only when there was one). Never a
bucket name, an endpoint, an account ID, an access key, a secret or a filename.

### Import, export and tags

Built in 6d (10 Oct 2026). `csv_import_started` (UI, PAT or MCP; whether it is a dry run; the
row count; how many fields were mapped), `csv_import_finished` (rows, issues created, rows
failed, duration), `org_export_requested` (UI, PAT or MCP), `org_export_finished` (whether it
succeeded; issues, files, files missing, bytes, duration) and `tag_managed` (renamed,
recoloured, merged or deleted; UI, PAT or MCP; how many tags were folded in, issues and
articles affected, saved views rewritten). Adoption is ever-used and weekly-used per event, as
for every feature (20.11). Never a filename, a header, a cell, a mapping, a tag name or an
organisation name.

### Git integration

Built in 7 (25 Oct 2026). `git_connection_created` (the provider and how it connects: app
installation, token or manual), `git_repository_linked` (the provider; whether a backfill was
asked for) and `git_event_failed` (the provider and the failure reason, one of
`GIT_EVENT_FAILURES`). Never a repository, an account login, a branch, a title, a commit message
or a URL; the delivery log that holds those stays in the database.

Automations (third milestone): `automation_created` (the trigger and action keys) and
`automation_run` (the trigger and `applied`, once per change an automation makes). Never a rule's
name, a status name or the cause.

## MCP — the metrics that matter most

One `mcp_tool_called` event per call — `tool`, `ok`, `error_code`, `duration_ms`,
`argument_count`, `api_calls` — which gives calls per tool, error rate per tool and top
error codes. Error *codes*, not messages: a message can quote a caller's value. Arguments
are only counted, never sent.

The MCP server marks every API call it makes with `X-Nothingleft-Client: mcp`, so
`issue_created.via` is `session`, `pat` (a script) or `mcp` — the MCP-vs-UI ratio is `mcp`
over `session`. The event carries the user and no organisation: one token reaches every
organisation its holder belongs to, and one tool call can touch several or none. Organisations
acting through MCP are counted from the events that carry `via: mcp` and the `organization`
group (`issue_created`, `article_created`, `report_viewed` and the rest). **Never-called tools** are the tool names
([manual/mcp-tools.md](./manual/mcp-tools.md)) with no `mcp_tool_called` event in the
period. Nothing about it is exposed through the API or MCP.

## Implementation

- One adapter module, `packages/analytics`. No PostHog import anywhere else.
- Server events from Fastify, carrying request ID, user ID, org ID.
- Client events from the web app for interaction-level things only.
- **A typed event catalogue** — event names and property shapes defined in
  `packages/types`, so a typo cannot silently create a new event stream. This
  is the thing every analytics implementation regrets not doing.
- Every event passes through a property allow-list before sending. The
  privacy rules above are enforced in code, not in review.
- Exceptions pass through `redactError` before they leave the process, and the API
  logger applies the same function to every logged `err`. A database error — Drizzle's
  query error or the driver's own — anywhere in the cause chain becomes
  `Database query failed (<SQLSTATE>)` with its stack frames, so the SQL, the bound
  parameters and a constraint's quoted row values reach neither PostHog nor a log
  line. Every other error is sent as it is.
- `POSTHOG_SAMPLE_RATE` applies only to the events marked high-volume in the
  catalogue (`api_request`, `issues_searched`). Everything else is never sampled.
