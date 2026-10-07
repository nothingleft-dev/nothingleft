# Technology Stack

Every entry lists the choice, the reason, and the constraint it satisfies.

## Language and tooling

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript | Everywhere: API, web, marketing, MCP, shared packages |
| TS version | **5.x pinned now** | `typescript@next` runs in a CI-only job so the day TS 7 (the Go-native compiler) is clean on Drizzle/Fastify/Next typings is visible immediately. Not a blocker either way. `tsc --noEmit` is typecheck only; Bun executes the source. |
| Runtime | **Bun** | Runs TypeScript source directly — no build step for the API or packages. Node is not installed in CI or production. Decided 21 Sep 2026. |
| Package manager | **Bun** (`bun install`, workspaces, `bun.lock`) | One tool for runtime, install and test. Everything at `@latest`; reproducibility from the committed lockfile |
| Monorepo orchestration | **Turborepo** | Task graph over Bun workspaces, remote caching, `turbo prune` for lean Docker images |
| Formatter | **Prettier** | Single config in `packages/config` |
| Linter | **ESLint** (flat config) | Shared config; includes the custom rules listed below |
| Testing | **`bun test`** (Jest-compatible API) | API, packages. Route tests use Fastify `app.inject()`; a real Postgres in integration tests — `apps/api/.env` locally, a service container in CI |
| UI testing | none | Explicitly out of scope per product decision |

### Custom lint rules

An ESLint plugin in `packages/config` (`eslint-plugin.mjs`, one file per rule
in `eslint-rules/`, RuleTester suites in `packages/config/test/`). The rules
are path-agnostic; the configs decide where each applies, and
`test/scopes.test.ts` lints sample files through the real configs to prove it.

| Rule | Applies to | Flags |
|---|---|---|
| `nothingleft/no-raw-db` | everything but `packages/db` (base config) | `db.` / `tx.` / `trx.` + `select`, `insert`, `update`, `delete`, `execute`, `query`, `with`, `$count`…; value imports of `drizzle-orm`, `pg`, `postgres`. `db.transaction` stays legal: `app.ts` rebinds repositories to a transaction |
| `nothingleft/no-user-facing-literals` | `apps/api/src`, except `src/config/` (operator configuration, decided 23 Sep 2026) | a string or template literal that reads as prose — two or more words that open with a capital or close with `.`/`!`/`?`. Exempt: log calls, `new Error`-family messages (developer-facing), `systemContext()` reasons, import sources, keys, types (17.12k) |
| `nothingleft/no-http-client` | `apps/web` outside `lib/api/` | `fetch`, `XMLHttpRequest`, `EventSource` (bare or via `window`/`globalThis`/`self`); imports of axios, ky, got, undici, ofetch… (17.12l) |
| `nothingleft/no-date-formatting` | `apps/web` outside `lib/datetime/` | `Intl.DateTimeFormat` / `RelativeTimeFormat`, `toLocale*String`, `toDateString`, `toUTCString`…; date-fns formatters; moment, dayjs. `toISOString` is the wire format and stays legal |
| `nothingleft/mcp-api-only` | `packages/mcp`, `packages/mcp-stdio` | imports of `@nothingleft/db`, `@nothingleft/analytics`, the API's aliases (`@services/*`, `@lib/*`, …), anything under `apps/api`, or a database driver — the MCP server is a client of the REST API (rule 3) |
| `nothingleft/no-inner-html` | `apps/web` outside `components/markdown/` | `dangerouslySetInnerHTML`, `innerHTML` / `outerHTML` assignment, `insertAdjacentHTML` |
| `nothingleft/no-native-controls` | `apps/web` outside `components/ui/` (added 25 Sep 2026, 1g) | `<select>`; `<input>` of type checkbox, radio, date, time, month, week, color or range (`file` stays: it hides behind a button); `required`, `minLength`, `maxLength`, `pattern`, `min`, `max` on an input; `alert`, `confirm`, `prompt` (bare or via `window`/`globalThis`/`self`) — rule 10 |

The literal rule is a heuristic, so it errs towards catching sentences: a
lowercase fragment without end punctuation (`'openid email profile'`, a log
line) passes. A genuine false positive gets a fix in the rule and a test
case, not an `eslint-disable`.

## Backend

| Concern | Choice | Why |
|---|---|---|
| HTTP framework | **Fastify** | Fast, schema-first, first-class TypeScript, plugin encapsulation maps cleanly onto modules |
| Validation | **Zod** | One schema per DTO, reused for runtime validation, TS types, OpenAPI authoring and MCP tool input schemas |
| ORM / query layer | **Drizzle ORM** | SQL-shaped, emits plain PostgreSQL migrations (no proprietary migration format), tiny runtime, schema doubles as the shared type source |
| Database | **PostgreSQL** (Neon) | Neon for hosting only. **No Neon-specific features** — no branching-dependent logic, no serverless driver lock-in. The app must run against any Postgres 15+. |
| Background jobs | **pg-boss** | Postgres-backed queue. No second service, no Redis command-quota pressure, survives restarts, transactional with the data it operates on |
| Cache / rate limit | **Upstash Redis** | Session lookup cache, rate-limit counters, short-TTL report caches. **Not** used for the job queue. |
| Object storage | **Cloudflare R2** (S3-compatible) | Zero egress fees. Accessed via `@aws-sdk/client-s3`, so AWS S3 and any S3-compatible store work unchanged — which is exactly what BYO storage requires. |
| Email | **Resend** | Transactional only by default; see [notifications.md](./notifications.md) for the email policy |
| Password hashing | **argon2id** | Current OWASP recommendation |
| Secret encryption | **AES-256-GCM** | For BYO storage credentials and TOTP secrets, under a server master key from env |
| Two-factor | **otplib** | Standard TOTP; works with Google Authenticator, 1Password, Authy |
| Avatars | Upload (public bucket) → provider URL → **Gravatar** → generated initials; organisations always a generated blob | Marks are rendered by the API with `@dicebear/core` and `@dicebear/styles` (MIT, CC0 styles), so no name leaves for a hosted service — `file-storage.md#avatars` |

## Frontend

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js** (App Router) + TypeScript | Vercel-native, server components for the heavy list/report pages |
| Styling | **Tailwind CSS** | Paired with the shared design tokens |
| Components | **shadcn/ui** | Copied into the repo, not a dependency — full control over the primitives |
| Data fetching | **TanStack Query** | Polling, optimistic updates, cache invalidation. The real-time strategy is refetch-on-focus plus interval; no WebSockets. |
| Charts | **Recharts** | Report visualisations, sharing the app colour palette, light and dark |
| Markdown editor | **Tiptap** (markdown-backed) | WYSIWYG with a `Visual` / `Markdown` toggle. Serialises to markdown; markdown is the only thing persisted. |
| Markdown rendering | **unified / remark / rehype** + `rehype-sanitize` | Sanitised at render time, never at store time |
| Tables | **TanStack Table** | Issue list, timesheet, matrix report |
| Drag and drop | **dnd-kit** | Board columns and cards, backlog ordering, field reordering |

## Marketing site

| Concern | Choice |
|---|---|
| Framework | **Astro** + TypeScript, `output: 'static'`; no UI library, no React, one bundled vanilla script module |
| Styling | Tailwind v4 through `@tailwindcss/vite`. Light theme only: the site owns a light-only copy of the design tokens in `apps/marketing/src/styles/tokens.css` (owner, 7 Oct 2026) |
| Fonts | Inter and JetBrains Mono self-hosted through Fontsource, `font-display: swap` |
| Content | Markdown/MDX in-repo |
| Hosting | Cloudflare Workers static assets (`wrangler.jsonc`, no Worker script), `nothingleft.dev` |
| SEO | Canonical, Open Graph, `@astrojs/sitemap`, `robots.txt`, JSON-LD (Organization, WebSite, WebPage, SoftwareApplication, FAQPage) |
| Analytics | `track()` in `src/lib/analytics.ts` is a no-op until `packages/analytics` is wired; `PUBLIC_GA_MEASUREMENT_ID` and `PUBLIC_CLARITY_PROJECT_ID` are declared in `.env.example` and not loaded yet |

## MCP

| Concern | Choice |
|---|---|
| SDK | `@modelcontextprotocol/server` v2 (TypeScript). Not the v1 `@modelcontextprotocol/sdk`, which pulls `jose`, express and hono; the stdio shim uses no SDK at all — [mcp.md § Built in 2a](./mcp.md#packages) |
| Transport | **Streamable HTTP** at `api.nothingleft.dev/mcp`, plus a published stdio shim (`npx @nothingleft/mcp`) for desktop clients |
| Auth | Personal Access Tokens. OAuth 2.1 is a post-v1 addition. |

## Observability

| Concern | Choice | Why |
|---|---|---|
| Errors + product analytics | **PostHog** | Error tracking and funnels behind one adapter, with independent kill switches. **Session replay off by default** — it is the real quota cost and a privacy liability on a tool holding customers' internal text. See [analytics.md](./analytics.md). |
| API logging | **Pino** (Fastify built-in) | `LOG_TARGETS` selects pretty stdout, JSON stdout and/or a JSON file; `request_id` on every line; secrets redacted. See `backend-guide.md#logging` |
| Uptime | Host-provided health checks | `/health` and `/health/deep` (DB + Redis + R2 reachability) |

## API documentation

**No swagger package in `package.json`**, at any dependency level.

- `docs/openapi.yaml` is a **hand-maintained, committed artifact**. Any change
  to a resource updates it in the same commit.
- CI fails a PR that touches `apps/api/src/routes/**` without also touching
  `docs/openapi.yaml`.
- The marketing site (`apps/marketing`, Astro) serves the docs under `/docs` from 6e:
  the committed YAML rendered with **Scalar** loaded from a CDN, zero runtime
  dependencies. There is no separate docs app or domain (owner, 26 Sep 2026).
- The MCP tool reference, `docs/manual/mcp-tools.md`, is generated from the tool
  definitions (`bun run --cwd packages/mcp docs:tools`) and a test fails when it is
  stale; it and the user manual are published beside the API reference.
