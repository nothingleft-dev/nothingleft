# Architecture

## Monorepo

A single public repository. Monorepo does **not** mean a single deployment —
each app deploys independently to a different host.

```
pms/
├── apps/
│   ├── web/          Next.js + TS + Tailwind + shadcn/ui   → Vercel
│   ├── marketing/    Astro + TS, static; serves /docs from 6e → Cloudflare Workers (static assets)
│   └── api/          Fastify + TS, includes /mcp           → Railway / Fly.io
├── packages/
│   ├── db/           Drizzle schema, migrations, seeds, repositories
│   ├── types/        Zod schemas, shared DTOs, enums, constants
│   ├── format/       duration, slug, issue key, project key — parse + format
│   ├── markdown/     parse, sanitise, render, @mention + PROJ-123 resolution
│   ├── query/        search query language: tokenizer, parser, AST, SQL compiler
│   ├── mcp/          @nothingleft/mcp-server: MCP tool definitions, resources, prompts
│   ├── mcp-stdio/    published npm shim: `npx @nothingleft/mcp`
│   ├── i18n/         en.json message catalogue + t()
│   └── config/       eslint, prettier, tsconfig, design tokens
├── docs/             this documentation, plus openapi.yaml
├── turbo.json
└── package.json      Bun workspaces (apps/*, packages/*)
```

### Why monorepo

Atomic changes across API + shared types + MCP tools + UI. A field added to
an issue touches `packages/db`, `packages/types`, `packages/mcp`, `apps/api`
and `apps/web` in one commit, one PR, one review, one CI run. With separate
repos that is five PRs and a version-bump dance.

### How independent deploys work

| App | Host | Build |
|---|---|---|
| `apps/web` | Vercel | Root Directory = `apps/web`; Vercel resolves workspace deps natively |
| `apps/marketing` | Cloudflare Workers, static assets plus one small Worker | `astro build` to `dist/`; pages are served as assets without running Worker code, and only `/api/*` (the support form and docs reactions) runs `worker/index.ts`; an unknown page path gets the static `404.html` with a 404 status, so the free plan's 10 ms CPU limit only meets that handler, which spends its time awaiting Turso |
| `apps/api` | Railway / Fly.io | Docker image built from `turbo prune --scope=api --docker` output, so the image contains only the API and its workspace dependencies |

Shared packages are workspace dependencies resolved at build time. Nothing is
published to npm except `packages/mcp-stdio`.

### `packages/format` — shared domain parsing

Pure parse and format functions for the domain's value types, needed by more
than one workspace:

| Function | Used by |
|---|---|
| `parseDuration` / `formatDuration` (`1w 1d 1h 1m` ↔ minutes) | API (work items, estimates), MCP (`log_time`), query (`spent time: {1d} ..`), web (input and display) |
| `slugify` (the tag and article slug rule) | API, MCP, web |
| `parseIssueKey` / `formatIssueKey` (`PMS-118`) | API, MCP, query, markdown, web |
| `generateProjectKey` | API, web |
| `workingDaysBetween` / `calendarDaysBetween` (a date range → the working days it logs on) | API (range expansion), web (the spent-time dialog's preview) |

**Charter, so it does not become a dumping ground:** pure functions only. No
I/O, no database, no framework imports, no third-party dependencies. Anything
needing a connection or a request belongs in a service.

The one workspace import is `@nothingleft/types`, for
`DEFAULT_WORKDAY_MINUTES` and `DEFAULT_WORKWEEK_DAYS`. The arrow points that
way and only that way: `types` must never import `format`, or a DTO that
validates a duration string closes the cycle.

Duration functions take the organisation's `workday_minutes` and
`workweek_days` as arguments rather than reading configuration, which keeps
them pure and testable.

The name follows the existing convention — packages are named for what they
contain (`db`, `types`, `markdown`, `query`, `i18n`), not for their layer.
`core` or `shared` would invite everything homeless to land there.

### `packages/markdown` — the one renderer

unified / remark / rehype, `rehype-sanitize` last. Pure: no I/O, no
framework; imports `format` for the key and username rules and `types` for
the size limits.

| Function | Used by |
|---|---|
| `renderMarkdown(md, { mentionHref?, issueHref?, isResolvedIssue?, imageSize? })` → sanitised HTML; `imageSize` writes an attachment's stored width and height on its `<img>` (1f) | web (`components/markdown/`), MCP resources |
| `extractReferences` / `extractMentions` / `extractIssueKeys` | API services at save time: the `mentions` table and issue links |
| `checkMarkdownSize` / `markdownByteLength` | API validation (64KB warning, 256KB hard limit) |
| `toggleTaskItem(md, index, checked)` | web: checkable task lists rewrite the source |
| `parseMarkdown` → mdast | anything else that needs the tree |

Decisions (24 Sep 2026):

- **Raw HTML in markdown is dropped**, tags and all; the text between tags
  survives. Nothing is passed through to be sanitised, so the sanitizer only
  ever sees what remark-rehype generated.
- Every `@username` becomes `<a class="mention" data-mention>` when a
  `mentionHref` is supplied and a `<span class="mention">` otherwise; every
  `PROJ-123` becomes `<a class="issue-key" data-issue-key>` with
  `issueHref` defaulting to `/issue/PROJ-123`. Neither is applied inside
  code, existing links or autolinked emails.
- **Prose extraction is stricter than `parseIssueKey`**: the key must be
  uppercase with at least one letter, so `2026-9`, `10-5` and `sha-256` in
  running text are never taken for issues. The service still drops keys that
  resolve to nothing.
- Fenced code is highlighted by `rehype-highlight` (`hljs-*` classes; colours
  come from palette tokens in `globals.css`). Task-list checkboxes carry
  `data-task="<n>"` in document order so the UI can call `toggleTaskItem`.
- External `http(s)` links get `target="_blank" rel="noopener noreferrer nofollow"`;
  relative links and `mailto:` are left alone.

### `packages/query` — the search grammar

Tokenizer, parser, AST, renderer, date resolver, two attribute registries
and the pure half of the suggestion engine. Owned by
[search-query-language.md](./search-query-language.md#implementation);
the compiler (AST → SQL) is not here but in `packages/db/src/search/`,
because every query lives in the repository layer (decided 24 Sep 2026, 1c).
Imports `format`
(durations, issue keys), `types` and `i18n` (label and error keys — the
package never holds a user-facing literal).

## Services

### `apps/api` — the only backend process

One Fastify server, three mounted surfaces:

```
/v1/*      REST API        — session cookie or PAT
/mcp       MCP server      — PAT (Streamable HTTP transport)
/health    liveness/readiness
```

Merging MCP into the API is a deliberate cost decision: one deployed service,
one bill. The seam is preserved so it can be split later without a rewrite —
`packages/mcp` contains every tool definition and talks to the API over HTTP
(loopback when co-hosted, a public URL when separated). Splitting is a config
change.

### Internal layering

The implementation walkthrough — folder by folder, with the steps for adding
an endpoint — is [backend-guide.md](./backend-guide.md).

```
routes/        Fastify handlers. Zod validation, HTTP concerns only.
services/      Business logic, permission checks, transactions.
               The only layer that writes to the activity log.
repositories/  packages/db. Every method requires a TenantContext.
```

The MCP server enters at the `routes` layer over HTTP, not at `services`.
That is the whole point: **if a capability is not reachable through the public
API, the MCP server cannot reach it either.** Feature parity is structural
rather than aspirational, and API gaps surface as MCP gaps immediately.

## Data flow

### Human writes an issue

```
Browser → api.nothingleft.dev/v1/issues  (session cookie)
  → auth middleware resolves session → Principal
  → permission check against project role
  → service: transaction {
        insert issue (issue_counter bumped with UPDATE … RETURNING)
        insert assignees, tags, field values
        insert issue_activity rows
        enqueue pg-boss jobs: notifications, search index refresh
    }
  → returns issue DTO
Browser: TanStack Query cache updated optimistically, then reconciled
```

### Agent writes an issue

```
Claude → api.nothingleft.dev/mcp  (PAT)
  → MCP tool create_issue
  → resolves "PROJ", "Critical", "@alex" to IDs
  → calls POST /v1/issues  (identical path as above)
  → returns a rendered markdown summary of the created issue
```

The only difference is the authentication method and the response
serialisation. Same validation, same permissions, same activity log.

### File upload

```
Browser → POST /v1/attachments/presign
  → quota check against organizations.storage_used_bytes
  → returns presigned PUT to R2 (org's own bucket if BYO configured)
Browser → PUT directly to R2         (bytes never touch the API)
Browser → POST /v1/attachments/complete
  → verify object exists + size, insert row, increment storage_used_bytes
```

Bytes never transit the API. That keeps the backend host small and free.

### File download

```
Markdown holds a permanent URL: files.nothingleft.dev/<id>/<filename>
  → auth middleware resolves session or PAT
  → may this principal read the owning issue?
  → 302 → presigned storage URL (5 min TTL)
  → browser fetches bytes directly from storage
```

The bucket is private; presigned URLs are never stored in markdown. See
[file-storage.md](./file-storage.md).

## API conventions

Response envelope, pagination, `PATCH` semantics, idempotency, issue-key path
form and the message catalogue are specified in
[api-conventions.md](./api-conventions.md).

## Background work

pg-boss, running in-process in the API (a separate worker process becomes
worthwhile only under load).

| Job | Trigger | Purpose |
|---|---|---|
| `notify.fanout` | Any successful write that changed an issue's history, an article or a sprint's state; one queued job per subject, started 10 minutes after the first write (6a) | Create notification-centre rows from the settled history, send any instant email |
| `email.digest` | Cron, hourly at :05 | The daily (and on Monday the weekly) digest for everyone it is 9am for, per organisation |
| `sprint.snapshot` | Cron, nightly | Write `sprint_snapshots` so burndowns are exact and instant |
| `storage.migrate` | BYO storage connected | Stream existing objects to the org's own bucket, with progress |
| `avatar.mirror` | First OAuth login | Copy the provider avatar into the public bucket |
| `import.csv` | CSV import started | Parse, validate, create issues, report per-row errors; one transaction per row with the job's progress, so a run that stops resumes; a run longer than 5 minutes queues its own continuation (6d) |
| `session.gc` | Cron, hourly | Delete expired sessions |
| `tokens.gc` | Cron, hourly | Delete expired `one_time_tokens` |
| `attachments.sweep` | Cron, hourly | Remove attachment rows whose upload never completed |
| `storage.reconcile` | Cron, nightly | Recompute `storage_used_bytes` from `attachments`, log drift |
| `notifications.due` | Cron, hourly | Produce `due_soon` and `overdue` rows against each recipient's timezone |
| `issues.purge` | Cron, nightly | Hard-delete issues and articles soft-deleted more than 14 days ago, with their dependants and objects. Per organisation, 200 at a time: the objects are deleted with no transaction open, then one short transaction removes the rows still due and releases their bytes. A failing bucket leaves that organisation's rows for the next night; each half (issues, then articles) stops after 5 minutes, so a run lasts up to about ten |
| `notifications.purge` | Cron, nightly | Delete read notifications after 30 days, unread after 90 |
| `webhooks.purge` | Cron, nightly (v2) | Delete `webhook_deliveries` after 30 days |
| `org.delete` | Grace period elapsed | Delete an organisation whose deletion was scheduled |
| `export.org` | Export requested | Produce the JSON + files archive for a full org export: a temporary file, then one checked upload to the platform bucket; may run for hours, so its queue expires jobs after 6 (6d) |
| `transfers.sweep` | Cron, hourly at :50 | Delete export archives past their 7 days and import files whose job ended or was never run within a day (6d) |
| `git.process_events` | A webhook delivery stored (7) | Apply one repository's pending deliveries in the order received, on a stately queue keyed by the repository (a connection's own events by the connection): one runs, one waits, and a delivery stored meanwhile is picked up by the waiting run. A failure stops the run and is retried after 1, 4, 16 and 64 minutes, then marked `failed`, so a poison delivery holds its repository back only that long |
| `git.purge` | Cron, nightly at 03:20 (7) | Delete webhook deliveries older than 7 days; checks of commits that head no pull request after 7 days; superseded commits after 30; commits and pull requests no live link has needed for 90 days, with their link rows |
| `git.backfill` | A repository linked with `backfill` (7) | Read in the repository's open pull requests and those updated in the last 90 days (at most 1,000), each with its commits, and the branches whose names reference an issue; progress on `git_repositories.backfill_state`. History only: never runs automations |
| `git.reconcile` | Cron, nightly at 02:40 (7) | For every linked repository with a delivery in the last 30 days: re-read each pull request still open here, as if its event arrived again, and check the webhook the server registered is still there (`missing` otherwise). Catches deliveries the provider never sent |

There is **no search reindex job.** `issues.search_tsv` and
`articles.search_tsv` are generated columns, so they cannot be stale — see
[data-model.md](./data-model.md#full-text-search).

## Testing strategy

| Layer | Approach |
|---|---|
| `packages/query` | Pure unit tests. The parser is the highest-risk component; it gets exhaustive table-driven cases, including every example in `search-query-language.md`. |
| `packages/markdown` | Unit tests for sanitisation (XSS vectors), mention and issue-ref extraction |
| `packages/db` | Integration tests against a real Postgres — the `apps/api/.env` database locally, a service container in CI. Every repository method is tested for tenant isolation — a query that can return another org's row is a failing test. |
| `apps/api` services | Unit tests with mocked repositories for permission logic |
| `apps/api` routes | `app.inject()` against the built app; a real database where the route needs one |
| MCP tools | Tested through the tool interface, asserting readable output and correct permission propagation |
| `apps/web` | **No tests.** Explicit product decision. |

## Security posture

- Tenant isolation enforced in the repository layer; every repository method
  requires a `TenantContext`. Lint rule prevents bypass. Tested per method.
- CSRF: `SameSite=Lax` cookies plus an `Origin` check on every mutation.
- Rate limiting per session and per PAT, with separate buckets — agents burst
  in ways humans do not.
- Markdown sanitised at render, never at store, so the stored text stays
  faithful and the sanitiser can be improved retroactively.
- Uploaded files served from a separate origin (`files.nothingleft.dev`) with
  `Content-Disposition: attachment` for anything not an image, so a malicious
  upload cannot execute against the app origin.
- BYO storage credentials encrypted at rest with AES-256-GCM and never
  returned by any API, at any access level.
- PATs and session tokens stored only as SHA-256 hashes. Shown once.
