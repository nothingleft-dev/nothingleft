# Backend Guide

How `apps/api` and `packages/*` fit together, and the exact steps for adding
an endpoint. **This is the only backend guide.** There are no per-folder
READMEs; `apps/api/README.md` is a three-line quickstart that points here.
Other docs own the decisions this one implements — it links, it does not
restate.

## Runtime and tooling

| Concern | Tool | Command |
|---|---|---|
| Runtime + package manager | **Bun** | `bun install`, `bun add <pkg>@latest` |
| Task graph | Turborepo | `bun run dev` / `test` / `lint` / `typecheck` at the root |
| Tests | `bun test` (Jest-compatible API) | inside any workspace, or via turbo |
| Typecheck | `tsc --noEmit` | `bun run typecheck` |
| Dev server | `bun --watch` | `bun run dev` at the root (API + web, one terminal), or `cd apps/api && bun run dev` |
| Migrations | drizzle-kit | `cd packages/db && bun run db:generate` / `db:migrate` (`db:migrate:test` for the `.env.test` database) |

There is no build step. Bun runs TypeScript source directly, and workspace
packages export their `src/index.ts`.

Local development points at **Neon** and **Upstash** through
`apps/api/.env` (copy `apps/api/.env.example`). Bun loads it automatically
inside `apps/api`; database workspace scripts pass
`--env-file=../../apps/api/.env`. CI can inject environment variables
normally. The web app has its own `apps/web/.env` and example; there is no
root `.env`. `docker-compose.yml` exists for self-hosting and offline work
and is not the default.

## Workspaces

```
apps/api             The one backend process. Fastify. Routes, services, middleware, plugins.
packages/db          Drizzle schema, migrations, repositories, TenantContext.
packages/types       Zod DTOs, constants, Principal, analytics event catalogue. One source.
packages/format      Duration, slug, issue key, project key, working days — parse + format. Pure functions.
packages/markdown    Markdown → sanitised HTML, mention and issue-key extraction, size limits,
                     task toggling. Pure; the only renderer (architecture.md § packages/markdown).
packages/query       Search grammar: tokenizer, parser, AST, render, date resolver, suggestion
                     engine, issue and article registries, value check, saved-view
                     expansion. Pure; the SQL compiler lives in packages/db/src/search/.
packages/i18n        en.json message catalogue + t(). Every user-facing string.
packages/analytics   The only PostHog import. Kill switches, allow-list, exception capture.
packages/mcp         @nothingleft/mcp-server: the MCP tools, a client of the REST API over HTTP only
                     (mcp.md § Built in 2a). Mounted at /mcp by routes/mcp.ts.
packages/mcp-stdio   @nothingleft/mcp: the published `npx` stdio shim. No runtime dependency.
packages/config      tsconfig / eslint / prettier shared by all workspaces, the custom lint
                     rules (tech-stack.md § Custom lint rules) and the CI check scripts in ci/.
```

Import a workspace package as `@nothingleft/<name>`. Add one to a workspace
with `bun add '@nothingleft/<name>@workspace:*'`.

## Import aliases (apps/api)

Never write `../../services/x`. `apps/api/tsconfig.json` defines the aliases
and Bun resolves them at runtime with no bundler:

```
@config/*      src/config/*        env.ts, constants.ts
@lib/*         src/lib/*           logger.ts, errors.ts
@plugins/*     src/plugins/*       Fastify plugins (envelope, error-handler, request-id, analytics)
@middleware/*  src/middleware/*    per-request hooks (auth)
@routes/*      src/routes/*        one file per resource, flat
@services/*    src/services/*      one file per aggregate
```

## The layers

```
HTTP request
  │  onRequest: middleware/auth.ts → request.principal (or null)
  ▼
routes/        apps/api/src/routes/*.ts     HTTP only. Zod DTO in, reply.ok() out.
  │  plain values + principal
  ▼
services/      apps/api/src/services/*.ts   Business rules, permissions, transactions,
  │  RepoContext + args                     activity rows, jobs, AppError.
  ▼
repositories/  packages/db/src/repositories EVERY query. Context required.
  │
  ▼
schema/        packages/db/src/schema       Table + UNIQUE index definitions only.
```

### routes/

One file per resource, **flat**, each declaring its full path including
`/v1`: `routes/issues.ts` serves `/v1/issues/*`. A route:

1. Declares Zod schemas for `params`, `querystring`, `body`, `response`.
   Resource DTOs come from `@nothingleft/types`; request-only shapes
   (a query filter) may be declared in the route file.
2. Calls **one** service method with plain values and `request.principal`.
3. Returns `reply.ok(data, { pagination?, status? })`.

A route never imports `@nothingleft/db` (`health.ts` is the one exception; it
probes connectivity and is not a resource), never branches on business rules,
and never builds an error body. Register new route files in `app.ts`.

**Any change in `routes/` updates `docs/openapi.yaml` in the same commit.**

### services/

A plain factory `xService(deps)` returning methods; the `XService` type is
exported. No Fastify types inside — every service is callable from a test
with no HTTP. The service layer is the **only** one that:

- checks permissions (`can(principal, capability, scope)` from
  `@services/permissions`, built cell-for-cell from `docs/permissions.md`)
- opens transactions. A service that needs two writes to be atomic declares an
  `inTransaction` dependency and `app.ts` supplies it, **rebinding the
  repositories to the transaction**:
  `inTransaction: body => db.transaction(tx => body({ users: usersRepository(tx) }))`.
  A repository bound to the pool cannot join someone else's transaction, so
  handing the already-bound instance to the wrapper would silently make it a
  no-op.
- writes `org_activity` / `issue_activity` rows
- enqueues pg-boss jobs
- throws `AppError` with a catalogue code

It never writes SQL, never reads `request`/`reply`, never builds a
user-facing string.

### repositories/ (packages/db)

Every SQL query in the system. One file per aggregate,
`<aggregate>.repository.ts`, exporting `xRepository(db: Queryable)`.
`Queryable` is the db or a transaction, so a service can run several calls
atomically. `users.repository.ts` is the reference implementation.

1. The first parameter of every method is a context. Not optional, not
   defaulted.
2. Every `WHERE` on a tenant-owned table includes `org_id = ctx.orgId`; joins
   filter on `org_id` on both sides.
3. Repositories return rows. They do not throw domain errors, check
   permissions or write activity — that is the service's job.
4. Every method has a tenant-isolation test: seed two orgs inside a
   transaction, call with org A's context, assert nothing from org B comes
   back, roll back. See `users.repository.test.ts`.

#### Identity tables

`users`, `sessions` and `personal_access_tokens` carry no `org_id` — a login
by email happens before any organisation is known. Methods on those tables
take a **`SystemContext`** instead of a `TenantContext`:

```ts
usersRepo.findByEmail(systemContext('password login'), email);
usersRepo.findMemberByUsername(tenantContext(orgId, userId), '@alex'); // org-scoped
```

The `reason` string is mandatory so every cross-tenant read is greppable
and justified. Anything that answers "within this organisation" takes a
`TenantContext` and joins `org_members`. Decided 21 Sep 2026; supplements
`docs/auth-and-tenancy.md#tenancy-isolation`.

### schema/ (packages/db)

One file per table, re-exported from `index.ts`. Rules from
`docs/data-model.md`: **`bigint GENERATED ALWAYS AS IDENTITY` primary keys**
(the sole exception is `attachments.public_id`, a random uuid v4 used in file
URLs); enums
are `text` + `CHECK`; `NOT NULL` unless the doc says `NULL`; **UNIQUE indexes
only**; `org_id` with `ON DELETE CASCADE` on tenant-owned tables.

Write a key as `bigint({ mode: 'number' })` — never `mode: 'bigint'`, whose
`BigInt` values a row cannot carry into the JSON envelope. The database
assigns them, so an insert never supplies an `id` and there is no
application-side generator. Ids are therefore `number` in TypeScript,
including `TenantContext.orgId` and `userId`.

**Keys are `snake_case` and identical to the column** — `created_at:
timestamp()`, table export `org_members`. Drizzle infers the column name from
the key, so a row's keys equal the API JSON's keys and nothing is remapped.
One name per concept: soft delete is `deleted_at` everywhere (on `users` it
means erased), membership removal `removed_at`, revocation `revoked_at`.

After a change: `bun run db:generate`, review the SQL, commit the migration
with the schema.

## Cross-cutting pieces

| Piece | Where | Guarantee |
|---|---|---|
| Composition root | `apps/api/src/app.ts` | The only file that wires infra → repos → services → routes |
| Env | `@config/env` | Zod-parsed at boot; bad config refuses to start |
| Constants | `@nothingleft/types` (product-wide) · `@config/constants` (API tuning) | No magic numbers in handlers |
| Request IDs | `@plugins/request-id` | UUID v7 per request, inbound `X-Request-Id` honoured, `request_id` in every log line |
| Success envelope | `@plugins/envelope` | `reply.ok()` → `{ data, meta }` (`meta.groups` for a grouped issue list); `reply.okList()` adds `meta.pagination` to a collection that does not page; `reply.csv()` is the one non-envelope success, for `*.csv` downloads — a string, or an async iterable that streams |
| Error envelope | `@plugins/error-handler` | anything thrown → `{ error }`; 5xx also reported to PostHog |
| Unique races | `@plugins/error-handler` | a Postgres unique violation (a slug, key or username taken between the service's check and its insert) answers `409 conflict`, not a 500 |
| Domain errors | `@lib/errors` | `AppError(code, status, params, field?, validValues?, span?)`, message from the catalogue; `AppError.fromQuery(QueryError)` for a search query, carrying its `span` |
| Catalogue | `packages/i18n/en.json` | `error.code` == key minus `error.` |
| Auth middleware | `@middleware/auth` | cookie `sid` or `Bearer nl_pat_…` → `request.principal`; `preHandler: requireAuth` to demand one |
| Origin check | `@middleware/origin` | mutating + session principal → `Origin` must equal `APP_BASE_URL`. PAT callers are exempt: they carry no ambient credential |
| Permissions | `@services/permissions` | `can(principal, capability, scope)`, one cell per row of `docs/permissions.md`, every cell tested; `missingScope()` names the scope when only a token's scopes refused it |
| Access | `@services/access` | principal + slug or project key → `TenantContext`, membership and permission `Scope`; anything unreadable is a `404`, a readable resource the caller may not change is a `403`. `denial(principal, capability, scope, otherwise)` is the one place a failed check becomes an error: `token.scope_missing` when only the scope stood in the way, else `otherwise` |
| Tenant transactions | `@services/transaction` | `inTransaction(repos => …)` hands a service the organisation-shaped repositories rebound to one transaction, so an `org_activity` row commits with the change it records |
| Organisation resolution | `@services/tenancy.service` | session → `current_org_id`; PAT → header, sole membership, or project key ([auth-and-tenancy.md](./auth-and-tenancy.md#current-organisation)) |
| Passwords | `@lib/password` | `Bun.password` argon2id; the breach check is a k-anonymity range query and fails open |
| Tokens | `@lib/crypto` | session, PAT and one-time tokens. Only the SHA-256 goes to the database |
| OAuth | `@lib/oauth`, `@services/oauth.service` | Google and GitHub over plain `fetch`, no SDK; PKCE + state bound to an `oauth_state` cookie; an unset client id answers `auth.oauth_not_configured` |
| Object storage | `@lib/storage`, `@services/object-stores` | one S3 adapter for every bucket; unset `S3_*` answers `storage.not_configured` rather than failing at boot. `storage.private` is the platform's attachments bucket (`S3_PRIVATE_BUCKET`), `storage.connect()` an organisation's own (6c); each is a `PrivateStore` bound to one bucket: presigned `PUT` with length and SHA-256 signed in, `HEAD`, presigned `GET` with type and disposition, delete, and the server-side put / read / stream the checks and the migration use. `classifyStorageError` turns a bucket's refusal into a `BYO_CHECK_REASONS` code. `@services/object-stores` picks the store for a row (a `byo` row only through the verified connection pointing at its storage location, `storage_location_id`, else `410 storage.byo_disconnected` / `409 storage.byo_unavailable`), caches each customer client by its sealed secret, deletes objects (`deleteObjects`: sweep, purge, org deletion) and holds the circuit breaker (`guard`, `trip`). Tests pass an in-memory store with any number of buckets and credentials (`test/memory-storage.ts`) through `buildApp`'s `storage` option ([file-storage.md § Bring your own storage](./file-storage.md#bring-your-own-storage)) |
| Attachments | `@services/attachments.service`, `@services/attachment-writer` | the writer holds what other services share: `claimDrafts` (create issue / comment / work item) and `releaseStorage` (every path that frees platform bytes) ([file-storage.md](./file-storage.md)) |
| Storage management | `@services/storage.service` | the usage screen and its file list, BYO connect / rotate / browser check / verify / disconnect, the queued `storage.migrate` and the nightly `storage.reconcile` |
| Transactional email | `@lib/email` | One of three transports chosen by `EMAIL_PROVIDER`: Resend's and Zoho CPaaS's HTTP APIs through `fetch`, no SDK, or SMTP through `nodemailer`; logged instead when the chosen provider's credentials are unset. Subject and body are catalogue keys. A body is one catalogue key or a list of catalogue lines (a digest), and a message may carry `headers` (`List-Unsubscribe`); the plain text is the source and the HTML is generated from it. A rejected send is logged and throws. Services wrap it: `bestEffort(mailer, report)` for mail that follows a saved change (and for password-reset requests, so no account is disclosed) — the failure goes to `captureException`, never to the caller; only resend-verification and email-change, whose whole point is the email, answer `502 email.send_failed` |
| Jobs | `@lib/jobs` | pg-boss on `DATABASE_URL` (direct), hourly `session.gc` and `tokens.gc`, hourly `attachments.sweep` at :30, nightly `sprint.snapshot` at 00:05 UTC (yesterday's figures for every active sprint; bumps each organisation's report data version), nightly `issues.purge` at 03:00 UTC, hourly `email.digest` at :05 and `notifications.due` at :10, nightly `notifications.purge` at 03:15 UTC, hourly `org.deletion_reminder` at :40 and `org.delete` at :45, nightly `storage.reconcile` at 03:30 UTC. The handlers are also `app.jobHandlers`, so a route test runs a job directly (the notification, organisation and storage ones take a `now`). Queued jobs with data — `notify.fanout`, `avatar.mirror`, `storage.migrate` (per organisation; a run queues its own continuation) — are `app.queuedHandlers` on a `stately` queue keyed per subject; `app.jobQueue` sends them, and in tests it is a `RecordingQueue` whose `pending` a test runs through `runQueued` |
| Notifications | `@services/notify-outbox`, `@plugins/notify`, `@services/notification-fanout`, `@services/notifications.service` | the history writer (`recordFieldChanges`, `recordIssueEvent`), article writes and sprint start / finish note what they touched in the request's outbox; after a successful write `@plugins/notify` queues one `notify.fanout` per subject, 10 minutes after the first touch. The fan-out reads only settled history, checks every recipient (`eligibleRecipients`) and writes rows whose `(user_id, dedupe_key)` is unique; the inbox re-checks readability on every read through `inboxScope` ([notifications.md § As built in 6a](./notifications.md#as-built-in-6a-api-half-27-sep-2026)) |
| Sealed secrets | `@lib/crypto` | `seal` / `unseal`: AES-256-GCM under an HKDF subkey of `ENCRYPTION_MASTER_KEY` per purpose (`totp`, `byo_storage`), a fresh IV per seal, the owning row as additional data, `v1.` prefix. `subkey(master, 'mcp-confirm')` is the HMAC key for the MCP confirmation state, passed to the MCP server as `confirmationKey`. A secret that must be read back — never one that is only compared, which is hashed ([auth-and-tenancy.md § As built in 6b](./auth-and-tenancy.md#as-built-in-6b-api-half-27-sep-2026)) |
| Two-factor and step-up | `@lib/totp`, `@services/two-factor.service` | TOTP via `otplib` and the recovery codes; `stepUp(principal, { current_password, code })` is the one confirmation every destructive account or organisation action calls, and `requireSession` the one PAT refusal (`auth.session_required`) |
| Account and organisation lifecycle | `@services/account-lifecycle.service`, `@services/organization-lifecycle.service`, `@services/avatar-mirror` | deactivation (and the operator's deactivate / reactivate behind `app.accountLifecycle`, run by `bun run --cwd apps/api account …` — never a route), organisation deletion with its reminder and `org.delete`, ownership transfer, the provider-photo copy ([user-lifecycle.md](./user-lifecycle.md#account-deactivation), [data-model.md § organizations](./data-model.md#organizations)) |
| Signed links | `@lib/crypto` | `signLink` / `verifyLink`: HMAC-SHA256 under `EMAIL_LINK_SECRET` for links that must never expire and write no row — the unsubscribe link |
| Idempotency | `@plugins/idempotency` | `Idempotency-Key` on any mutating request, replayed from Redis for 24h per credential and organisation; a replay first re-checks membership of every organisation the original request acted in; Redis down means no replay, never a failure ([api-conventions.md](./api-conventions.md#idempotency)) |
| Hierarchy | `@services/issue-hierarchy` | `checkParent` (same project, no cycle, depth ≤ 3 counting the moving subtree) and `recordParentChange`; `PATCH parent` and subtask links both go through it, so the rules live once. `refreshSpentRollup` is the one writer of `spent_minutes`: work-item writes, parent changes, delete and restore all call it, and it recomputes from `work_items` over the live subtree rather than adding deltas |
| Sprint placement | `@services/sprint-placement` | `placeIssues` is the one writer of `issues.sprint_id` and `issues.rank`: the backlog drag, the issue's `sprint` field, *Finish sprint*'s carry-over, a new sprint taking another's unresolved issues and a planned sprint's delete all go through it. It locks the target container, ranks its unranked tail, writes midpoints, renumbers when the gap is under `1e-6`, and writes `sprint_changed` ([data-model.md § issues](./data-model.md#issues)) |
| Once a day | `@services/daily-once` | `dailyOnce(redis, key)`: true the first time a key is seen in a UTC day, so a polled page (board, backlog) counts one use a day; Redis down counts the call |
| Search | `@services/search.service`, `packages/db/src/search/issue-query.ts` | one pipeline for the list, CSV, figures, saved views and (M2) MCP: parse → expand `#{views}` → check values against the readable projects → compile. The compiler scopes every query to the caller's readable projects before any filter, so a count never includes an issue the caller could not open ([search-query-language.md § Implementation](./search-query-language.md#implementation)) |
| Reports | `@services/reports.service`, `packages/db/src/repositories/reports.repository.ts` | the nine reports over the search pipeline's scoped predicate, grouped by `packages/db/src/search/issue-groups.ts` — the list's own grouping — so a report never counts an issue the caller could not open ([reports.md § As built](./reports.md#as-built-in-phase-5-api-half-27-sep-2026)) |
| Report cache | `@services/report-cache`, `@plugins/report-version` | results in Redis for five minutes, keyed by caller, scope and the organisation's data version; the access layer records each organisation a request resolves and a successful write bumps its version, as does `sprint.snapshot`; Redis down means no cache, never a failure |
| Issue history | `@services/issue-history` | `recordFieldChanges` — the one writer of `field_changed` rows, and where coalescing and its hard stops live; the caller holds the issue row lock |
| Rate limiting | `app.ts` (`@fastify/rate-limit` on Redis) | separate buckets per session / PAT / IP, limits in `X-RateLimit-*` headers, fails open if Redis is down |
| Redis | `app.redis` (`@fastify/redis`) | session cache, rate-limit counters, report caches and their per-organisation data versions |
| Cookies / CORS | `@fastify/cookie`, `@fastify/cors` | CORS origin = `APP_BASE_URL`, credentials on, `CORS_EXPOSED_HEADERS` named so the browser can read them ([api-conventions.md](./api-conventions.md#cors-and-exposed-headers)) |
| Logging | `@lib/logger` | see below |
| Analytics | `@nothingleft/analytics`, `@plugins/analytics` | see below |

## Logging

Pino, one logger per process, configured by env:

```
LOG_LEVEL=debug                 fatal … trace
LOG_TARGETS=pretty,file         any of: pretty (stdout, coloured) · json (stdout) · file
LOG_FILE=logs/api.log           used by the file target; directory is created
```

Development default is `pretty,file`: readable in the terminal **and** a
JSON file an LLM can `tail`/`grep` by `request_id` to debug a failure.
Production uses `json`, collected by the host. `authorization`, `cookie` and
`set-cookie` headers are redacted before any target sees them, and a logged `err`
goes through `redactError` (`@nothingleft/analytics`), which strips a database
error's SQL, parameters and row values. `logs/` is
gitignored. Log lines are not sent to PostHog; errors are (next section).

## Analytics and error reporting (PostHog)

`packages/analytics` is the only place PostHog is imported
(`docs/analytics.md#implementation`). Env:

```
POSTHOG_KEY=phc_…
POSTHOG_HOST=https://us.i.posthog.com     or eu.i.posthog.com
POSTHOG_ANALYTICS_ENABLED=false           product events
POSTHOG_ERRORS_ENABLED=false              exception capture — independent switch
POSTHOG_SAMPLE_RATE=1.0                   applied to product events only
```

- **Events** are declared in `packages/types/src/events.ts`. The Zod schema
  is the property allow-list: the adapter drops anything undeclared, so
  customer content cannot leak. Only internal IDs, counts, enums, durations,
  booleans. `@plugins/analytics` emits `api_request` per response (route
  pattern, never URL).
- **Errors**: the error handler calls `analytics.captureException` for every
  5xx with `request_id`, route, method and user ID. 4xx are not reported.
- Both are no-ops when their switch is off or `POSTHOG_KEY` is empty. Tests
  always get `noopAnalytics`.
- Adding an event = add it to `EventCatalogue`, then call
  `app.analytics.capture('name', props, { userId, orgId })` from a service or
  plugin. A typo does not compile.

## Adding an endpoint, step by step

Worked example: `GET /v1/projects/:key`.

1. **Schema** (only if a table changes): one file in `packages/db/src/schema/`,
   re-export, `bun run db:generate`, commit the migration.
2. **DTO**: `ProjectSchema` in `packages/types/src/`, exported from `index.ts`.
   Every response shape lives here — the web app imports it rather than
   declaring its own.
3. **Repository**: `projects.repository.ts` → `findByKey(ctx: TenantContext, key)`
   filtering on `ctx.orgId`; tenant-isolation test beside it.
4. **Catalogue**: `"error.project.not_found": "No project with key {key}."`
   in `en.json`. The code is `project.not_found`.
5. **Service**: `projects.service.ts` → `getByKey(ctx, principal, key)`:
   permission check, repository call,
   `throw new AppError('project.not_found', 404, { key })` when missing.
   Unit-test with a stub repository.
6. **Route**: `routes/projects.ts`, `app.get('/v1/projects/:key', { schema, preHandler: requireAuth }, …)`,
   `return reply.ok(project)`. Register in `app.ts`.
7. **Route test**: `apps/api/test/projects.test.ts` with `app.inject()`.
8. **Docs**: `docs/openapi.yaml` + the manual page. CI fails otherwise.
9. **MCP** (M2+): a `defineTool` in `packages/mcp/src/tools/`, listed in `tools/index.ts`
   and a section of `src/reference.ts`, calling the REST endpoint through `ctx.api` — never
   a service — and naming it in `endpoints`. An endpoint with no tool gets `x-mcp-exempt`
   in `openapi.yaml` instead (mcp.md § Deliberately UI-only). Test it in
   `test/mcp.tools.test.ts`, then `bun run --cwd packages/mcp docs:tools`. Changing a route
   that a tool calls changes the tool too (CLAUDE.md rule 21).

Definition of done is in `CLAUDE.md`.

## Testing

- `bun test`, imports from `bun:test`. **Tests live in `test/` at the
  workspace root**, never beside source: `apps/api/test/*.test.ts`,
  `packages/db/test/*.test.ts`. Name them after the file under test
  (`users.repository.test.ts`).
- Route tests: `buildApp(testEnv)` + `app.inject()`. No port, but the app
  boots against the real Postgres and Redis from `apps/api/.env` (Redis must answer
  before Fastify is ready). Always run tests through `bun run test` so the
  API environment file is loaded; a missing variable fails fast with a message.
- Repository tests need the migrated database from `DATABASE_URL` and run
  inside a rolled-back transaction, so nothing persists.
- Services: hand-written stub repositories, not database mocks.
- Every route test injects from `127.0.0.1`, so `testApp()` gives each app its
  own rate-limit namespace (`isolatedRateLimit()` in `test/helpers.ts`). A
  test that calls `buildApp` itself passes it too, or a fast run hits `429`.
- `test/error-catalogue.test.ts` is the catalogue check: every error
  code must resolve to string literals with an `error.<code>` key. Pass codes
  as literals or `ErrorCode`-typed values, never a plain `string`.
- CI runs the same suite against Postgres 16 and Redis 7 service containers
  on a fresh database ([infrastructure.md § CI/CD](./infrastructure.md#cicd)).
- **Locally, tests can run against the same containers while `bun run dev`
  stays on Neon.** Copy `apps/api/.env.test.example` to `apps/api/.env.test`
  (gitignored), `docker compose up -d postgres redis`, then once
  `cd packages/db && bun run db:migrate:test`. `bun test` loads `.env.test`
  over `.env` (Bun does this itself under `NODE_ENV=test`; the db workspace
  passes both `--env-file`s), so only the connection strings change. A full
  run drops from minutes against a remote database to about ten seconds. Delete
  `.env.test` to test against Neon again. Rerun `db:migrate:test` after
  pulling a new migration.
- **Object storage**: route tests use the in-memory buckets. `test/attachments.s3.test.ts`
  and `test/storage.s3.test.ts` (which creates a second bucket, `nl-byo-test`, to play a
  customer's own) run against a real S3-compatible store and skip without one:
  `docker compose up -d storage`, the `S3_*` lines from `.env.test.example`, then once
  `cd apps/api && NODE_ENV=test bun run storage:init`. CI runs the same RustFS container.
- Tenant-isolation and permission-matrix suites gate a release.

## Not allowed

| Temptation | Do instead |
|---|---|
| Query from a service | Add a repository method (`nothingleft/no-raw-db` fails otherwise) |
| Inline user-facing string | `en.json` key + `AppError` (`nothingleft/no-user-facing-literals` fails otherwise) |
| `reply.send({...})` | `reply.ok()` or throw |
| Trimmed write responses | Full resource, same shape as `GET` |
| Optional / defaulted context | `ctx` first, required |
| `TenantContext` with a made-up orgId to read identity tables | `systemContext('reason')` |
| Non-UNIQUE index | Wait for `pg_stat_statements` |
| `import { PostHog }` outside `packages/analytics` | `app.analytics` |
| Relative `../../` imports in apps/api | The aliases above |
| A duration, slug or key parser written in `apps/api` | `packages/format` |
| A response shape declared anywhere but `packages/types` | Add it there |
| A new response header no client can read | Add it to `CORS_EXPOSED_HEADERS` |
| A new README next to code | Extend this document |
| `*.test.ts` beside source | `test/` at the workspace root |
| A service reaching the network directly (a breach list, Gravatar) | Declare it as a dependency so a test can stub it |
| `createdAt: timestamp('created_at')` | `created_at: timestamp()` |
| A comment that restates the code or narrates a doc | Delete it; `CLAUDE.md` § Comments |
| A route change without `docs/openapi.yaml` | Both in one change; CI's docs-sync job fails otherwise |
| `eslint-disable` for a lint false positive | Fix the rule in `packages/config/eslint-rules/` and add the case to its test |
