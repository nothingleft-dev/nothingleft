# Infrastructure

How the system is hosted and configured, and how to run all of it yourself.
The API is a long-running Bun process with PostgreSQL and a Redis-compatible cache;
the web app is a Next.js build; objects live in S3-compatible buckets.

## Domains

| Domain | Serves |
|---|---|
| `nothingleft.dev` | Marketing site and `/docs` (static assets on Cloudflare Workers) |
| `work.nothingleft.dev` | Web application |
| `api.nothingleft.dev` | Fastify API + `/mcp` |
| `mcp.nothingleft.dev` | CNAME → same service as `api` |
| `files.nothingleft.dev` | Attachment serving — **a route on the API**, not a public bucket |
| `static.nothingleft.dev` | The **public** bucket's custom domain — avatars only |

Notes:

- `work.` names the web application: it says what the product is for, and is
  chosen over the conventional `app.`. Register GitHub App and OAuth callback
  URLs against this host.
- `mcp.nothingleft.dev` is purely cosmetic — it costs nothing and gives users a
  cleaner URL to paste into an MCP client config than `api.nothingleft.dev/mcp`.
- `work.` and `api.` share the registrable domain `nothingleft.dev`. This is what
  allows the session cookie to be `SameSite=Lax` instead of the weaker
  `SameSite=None`. Do not move the API to a different registrable domain.
- Serving uploads from `files.nothingleft.dev` rather than an app subdomain keeps
  user-uploaded content off the application origin. **The attachments bucket
  is fully private**; this host authorises each request and redirects to a
  short-lived presigned URL. Avatars alone sit in a separate public bucket
  behind `static.`. See [file-storage.md § Two buckets](./file-storage.md#two-buckets).
- `files.` shares the registrable domain too, which is what lets the session
  cookie reach an `<img>` request. Another reason not to split these hosts
  across domains.

## Hosting requirements

The API must be a long-running process, not serverless — pg-boss holds a
Postgres connection and processes scheduled jobs. Do not deploy it to Vercel
Functions or Cloudflare Workers.

### Health checks

`/health` is the liveness probe: no dependencies, no rate limit. `/health/deep` is
the readiness probe: database, Redis and the private bucket. It is anonymous, so it
is bounded: **10 requests a minute per IP**, and **one probe at a time whose answer
is shared for 5 seconds**, a failing one included. An uptime checker should poll it
no faster than every 10 seconds; a faster one sees the same answer and, past ten a
minute, `429`.

## Avoiding vendor lock-in

This is a hard requirement, not a preference. The entire system must be
runnable on a laptop with `docker compose up`.

| Vendor | What is used | What is avoided |
|---|---|---|
| Neon | Plain PostgreSQL over the standard wire protocol | Branching-dependent workflows, `@neondatabase/serverless` driver, Neon auth, Neon-specific extensions. Standard `pg` driver only. |
| Cloudflare R2 | S3 API via `@aws-sdk/client-s3` | R2 Workers bindings, R2-only APIs. Endpoint, bucket and credentials are env vars. |
| Upstash | Standard Redis commands | Upstash REST-only features, QStash. Any Redis 6+ works. |
| Vercel | Next.js build output | Vercel KV, Blob, Postgres, Edge Config. The geo headers are used but strictly as a fallback. |
| Resend, Zoho CPaaS, or any SMTP server | One send function, three providers chosen by `EMAIL_PROVIDER` | Provider-specific templating, audiences or webhooks |
| PostHog | Standard SDK behind a one-file adapter | — |

A self-hoster substitutes: any Postgres, any S3-compatible store, any Redis.
Mail follows the same rule: `EMAIL_PROVIDER` picks Resend's HTTP API (default), Zoho
CPaaS's HTTP API, or any SMTP server, and without that provider's credentials mail is
logged instead of sent. The `docker-compose.yml` shipped in the repo does exactly
this with Postgres + Redis + an S3-compatible store. That store is **RustFS**
(`rustfs/rustfs`, Apache-2.0) since 25 Sep 2026: MinIO stopped publishing its images,
and RustFS speaks the same S3 API, presigned URLs and SHA-256 checksums included.
`cd apps/api && bun run storage:init` creates both buckets, makes the public one
readable and allows browser `PUT`s from `APP_BASE_URL`; CI runs the same container.

## Environment configuration

Local settings live in `apps/api/.env` and `apps/web/.env`; copy each
app's `.env.example`. Database scripts share `apps/api/.env`. The repository
root has no environment file.

Validated at boot with Zod; the process refuses to start on a bad config.

### Neon: two connection strings, used for different things

Neon issues a pooled and a direct URL. They are not interchangeable:

| Variable | Neon string | Used by |
|---|---|---|
| `DATABASE_URL_POOLED` | pooled (pgBouncer) | The API's normal query traffic |
| `DATABASE_URL` | direct / unpooled | **Migrations and pg-boss** |

pgBouncer in transaction mode breaks session-level features — advisory locks,
`LISTEN`/`NOTIFY`, session-scoped prepared statements. pg-boss uses all
three, and migrations take advisory locks to avoid two instances migrating at
once. Pointing either at the pooled URL produces failures that look random.

```
LOG_LEVEL                     info | debug | …
LOG_TARGETS                   pretty,file — any of pretty · json · file · posthog (see backend-guide.md#logging)
LOG_FILE                      logs/api.log
DATABASE_URL                  postgres://…   direct — migrations, pg-boss
DATABASE_URL_POOLED           postgres://…   pooled — application queries
REDIS_URL                     rediss://…
S3_ENDPOINT                   https://<account>.r2.cloudflarestorage.com
S3_REGION                     auto
S3_PRIVATE_BUCKET             nl-private    attachments (quota-counted, BYO-replaceable); export archives and import files (neither)
BYO_ALLOW_ANY_ENDPOINT        false         development and tests only: a BYO connection may name its own endpoint; production refuses to boot with it
S3_PUBLIC_BUCKET              nl-public     avatars only — public read, never BYO
S3_PUBLIC_BUCKET_BASE_URL     https://static.nothingleft.dev
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
ENCRYPTION_MASTER_KEY         32 bytes, base64 — seals two-factor secrets (6b) and BYO storage secrets (6c, purpose `byo_storage`, the connection's row as additional data), and signs MCP confirmation state (purpose `mcp-confirm`); required in production, never rotated (no rotation in v1)
SESSION_COOKIE_DOMAIN         .nothingleft.dev  required whenever the web app and the API are on different hosts: the web app's proxy reads the session cookie
TRUST_PROXY                   1             proxy hops in front of the API, or their IPs / CIDRs (comma-separated); false trusts none. Unset: 1 in production, false elsewhere
GOOGLE_CLIENT_ID / _SECRET
GITHUB_CLIENT_ID / _SECRET
EMAIL_PROVIDER                resend (default) | zoho | smtp — how mail is sent
RESEND_API_KEY                provider resend: required in production; unset elsewhere, mail is logged instead of sent (with its body only in development)
ZOHO_EMAIL_API_KEY            provider zoho: the Send Mail token, with or without its `Zoho-enczapikey ` prefix; required in production
ZOHO_EMAIL_ENDPOINT           https://cpaas.zoho.com/v1.1/email — change it for another Zoho data centre
SMTP_HOST / SMTP_PORT         provider smtp: host (required in production) and port (587)
SMTP_SECURE                   true|false — implicit TLS; unset: on for port 465, STARTTLS otherwise
SMTP_USER / SMTP_PASSWORD     set together, or both unset for a relay that needs no login
ASSET_BASE_URL                https://static.nothingleft.dev — public static host; email logos load from `email/logo-light.png` and `email/logo-dark.png` under it
EMAIL_FROM                    "Nothing Left <noreply@notifications.nothingleft.dev>"
SUPPORT_EMAIL                 admin@nothingleft.dev in production — Reply-To on every email; unset: no Reply-To
EMAIL_LINK_SECRET             32+ characters — signs unsubscribe links; required in production, never rotated casually
POSTHOG_KEY / POSTHOG_HOST
POSTHOG_ANALYTICS_ENABLED     true|false  — product events
POSTHOG_ERRORS_ENABLED        true|false  — exception capture (independent)
POSTHOG_REPLAY_ENABLED        false       — session replay; privacy liability
POSTHOG_SAMPLE_RATE           1.0
APP_BASE_URL                  https://work.nothingleft.dev
API_BASE_URL                  https://api.nothingleft.dev
MCP_API_BASE_URL              unset          where /mcp's tools reach the REST API; unset = this process over loopback
FILES_BASE_URL                https://files.nothingleft.dev   the files route mounts at its path; unset = API_BASE_URL/files (local)
FREE_SEAT_LIMIT               20             overrides the free plan's seat notice threshold (self-hosters)
FREE_STORAGE_BYTES            5368709120     overrides the free plan's storage cap (self-hosters)
```

Plan presets themselves live in `packages/types` (limits-and-billing.md
§ Plans); the two `FREE_*` variables exist so a self-hoster can loosen the
default plan without touching code.

### Database roles

Two roles, never one. The **owner** (the role in `DATABASE_URL`) creates and
migrates tables and is never used for application traffic. The **application
role** `nothingleft_app` (the role in `DATABASE_URL_POOLED`) runs every query
the API makes. The audit log is immutable only against the application role,
so that role must not be a superuser, must not own any table, and must not be a
member of the owner role or of any role that does.

Create the role before the first migration runs. The initial migration revokes
`UPDATE` and `DELETE` on `org_activity` only if the role already exists, and
creating it afterwards does not re-run that statement. If the role was created
late, or a broad grant was issued after the migration, run the grant script
below again; it is idempotent.

```sql
-- as the owner
CREATE ROLE nothingleft_app LOGIN PASSWORD '<generated>' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO nothingleft_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nothingleft_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nothingleft_app;

REVOKE ALL ON org_activity FROM PUBLIC;
REVOKE ALL ON org_activity FROM nothingleft_app;
GRANT SELECT, INSERT ON org_activity TO nothingleft_app;
```

`REVOKE ALL` also removes `TRUNCATE`, `REFERENCES` and `TRIGGER`, which
`UPDATE, DELETE` alone would leave. The default-privileges line covers tables a
later migration creates; `org_activity` already exists by then, so the explicit
revoke-and-grant above is what protects it.

**Verify after provisioning, and after every migration that touches grants.**
In `psql` as the owner, `\dp org_activity` lists the table's access privileges:
`nothingleft_app=ar/<owner>` (append, read) and nothing else for that role.
Then check the effective privileges, which include anything inherited through
membership:

```sql
SELECT p AS privilege, has_table_privilege('nothingleft_app', 'org_activity', p) AS granted
FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p;
-- expected: SELECT and INSERT true; every other row false

SELECT rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = 'nothingleft_app';
-- expected: f, f, f

SELECT m.roleid::regrole FROM pg_auth_members m WHERE m.member = 'nothingleft_app'::regrole;
-- expected: no rows

SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'org_activity' AND grantee IN ('nothingleft_app', 'PUBLIC')
ORDER BY grantee, privilege_type;
-- expected: nothingleft_app INSERT, nothingleft_app SELECT, nothing for PUBLIC
```

`information_schema.role_table_grants` lists direct grants only and shows rows
only for roles the current user can use, so the `has_table_privilege` query is
the authoritative one.

**What the grants do not protect.** `org_activity.org_id` cascades from
`organizations`, so a hard `DELETE` of an organisation row would remove its log
even though the application role cannot delete log rows directly. The
application never hard-deletes an organisation: a deleted organisation keeps
its row, and therefore its log, for as long as the retention policy keeps the
row (see [data-model.md § Retention](./data-model.md#retention)). The log
outlives an organisation only on that condition, and any change to the
retention policy for organisation rows is a change to the audit contract.

### Proxy trust

`request.ip` feeds the anonymous rate-limit bucket and the address and country a
session records, so the API must know which forwarding headers to believe.
`TRUST_PROXY` says how many proxies sit in front of it, or which addresses they
have. Fly, an AWS ALB or CloudFront, and an OCI load balancer are each **one hop**,
the production default. With `false` (the default outside production) every
`X-Forwarded-For`, edge country and edge timezone header is ignored. With a CIDR list the
same holds for any caller outside the list: its edge headers are ignored too. If the API is also reachable
without going through the proxy, a hop count lets a direct caller claim any address:
set the proxies' CIDR list instead (`TRUST_PROXY=10.0.0.0/8,172.16.0.0/12`). A
hop count of 0 is the same as `false`; any other value refuses to boot.

## Design decisions not to undo

- **MCP merged into the API** — one service to run, not two.
- **pg-boss instead of Redis-based queues** — a job queue would exhaust a
  command-capped Redis quickly, and Postgres is already there.
- **Direct-to-bucket presigned uploads** — file bytes never pass through the API,
  so the backend instance stays small.
- **Notification emails off by default** — transactional mail only; unread
  notification emails are cost with negative user value.
- **Nightly sprint snapshots** — burndowns read one small table instead of
  replaying the activity log on every page view.

## CI/CD

GitHub Actions. `.github/workflows/ci.yml` holds the checks, which run on every
PR and every push to `main`; the nightly schedule runs only the report jobs.

| Job | Runs on | What it does |
|---|---|---|
| Lint and typecheck | PR, push | `bun install --frozen-lockfile`, dependency policy, `format:check`, `lint`, `typecheck` |
| Unit and integration tests | PR, push | Postgres 16 and Redis 7 as GitHub Actions **service containers**, injected as `DATABASE_URL` / `DATABASE_URL_POOLED` / `REDIS_URL` (decided 21 Sep 2026; no Testcontainers library). Migrates, then `bun run test` |
| Migrations apply to a fresh database | PR, push | `db:migrate` from zero on its own empty Postgres, then `db:generate` must leave `packages/db/migrations` untouched — a schema edit without its migration fails here |
| **docs-sync** | PR, push | `packages/config/ci/docs-sync.ts` — fails if `apps/api/src/routes/**` changed without `docs/openapi.yaml`. No override label |
| `typescript@next` typecheck | nightly, manual | `tsc` from `typescript@next` in every workspace. Non-blocking. Only the compiler is swapped; the `typescript@~5` library stays, because the error-catalogue test uses its compiler API, which 7.x does not ship |
| Outdated dependencies | nightly, manual | `bun outdated --recursive`, report only |
| Deploy API | CI green on `main`, or manual | `.github/workflows/deploy-oci.yml`: builds a release on the runner and hands it to the host's deployment controller (`infra/oci/`) |
| Deploy web | CI green on `main`, or manual | `.github/workflows/deploy-vercel.yml` |
| Deploy marketing | CI green on `main`, or manual | `.github/workflows/deploy-marketing.yml`: builds `apps/marketing` on the runner, runs `wrangler deploy` and sets the Worker's secrets through the Cloudflare API |

Every run gets a fresh database, which the tests rely on: they leave rows
behind by design (`users` are never deleted; each run uses unique emails).

**Dependency policy.** `packages/config/ci/dependency-policy.ts`
fails when any `package.json` range is not a caret range (`^x.y.z`, what
`bun add <pkg>@latest` writes) — no exact pins, `~`, `*`, tags or URLs —
and `typescript` is anything but `~5`. With `--frozen-lockfile`, that is the
enforceable half of "install at `@latest`"; the nightly outdated report is
the other half. Failing a PR because upstream shipped a release was
rejected (23 Sep 2026).

**Error catalogue** is a test, `apps/api/test/error-catalogue.test.ts`,
so it runs with the suite: the TypeScript checker resolves every code handed
to `AppError`, `errorKey()` or an `ErrorBody` literal to its string-literal
values, and each needs an `error.<code>` key in `packages/i18n/en.json`. A
code typed as plain `string` fails too.

**OpenAPI lint** is not in CI yet: Redocly still reports the pre-existing
`security-defined` errors (no root `security`). Revisit when that is added;
it would run via `bunx`, never as a `package.json` dependency.

**Turborepo remote cache.** The workflow reads `TURBO_TOKEN` (secret) and
`TURBO_TEAM` (variable) from the repository settings. Unset, Turbo runs
uncached and nothing fails. `lint` hashes the root `eslint.config.mjs` as an
input, and every task hashes `packages/config`, so a rule change re-lints
everything. Database migrations run as a release command before the new API
version takes traffic.

**Running CI's services locally.** `docker compose up -d postgres redis`
gives the same Postgres 16 and Redis 7; the header of `docker-compose.yml`
lists the `apps/api/.env` lines that point the API at them (verified
23 Sep 2026: migrate from zero, boot, `/health/deep` reports `db` and `redis`
ok, full suite green).
