# Nothing Left — working agreement

An MCP-first project management tool. Read `docs/README.md` first; it maps
every other document. Backend work starts at `docs/backend-guide.md`. For anything visual, read `design/DESIGN-SYSTEM.md`. **Do not re-derive decisions that are already written
down there.**

## Non-negotiable rules

1. **Install packages at `@latest`.** `bun add <pkg>@latest`, always.
   The sole exception is `typescript@~5`. Training data carries stale version
   numbers, and an unqualified install reliably pulls something eighteen
   months old. Reproducibility comes from the committed `bun.lock`.
2. **Markdown is the only stored rich-text format.** Never store HTML.
   Sanitise at render, never at store.
3. **The MCP server is a client of the public REST API.** Never let it reach
   the database or the service layer directly. If a capability is not
   reachable through the API, it does not exist.
4. **Docs are part of the change.** A route change that does not update
   `docs/openapi.yaml` and the affected manual page is not done. CI enforces
   it. **No swagger package in `package.json`, at any dependency depth.**
5. **UNIQUE indexes only** at schema time. Every other index waits for
   `pg_stat_statements` evidence after real usage. The one exception is the
   GIN index on `search_tsv`, which is the FTS mechanism rather than an
   optimisation.
6. **Every repository method requires a `TenantContext`.** No raw `db.*`
   outside `packages/db`. Every method has a tenant-isolation test.
7. **No JWT anywhere.** Browser: opaque session cookie. MCP: opaque PAT.
8. **Human-readable identifiers in every public interface.** `PROJ-123`,
   `@username`, `"In Progress"` — never a UUID as required input.
9. **`users` rows are never hard-deleted.** Attribution must survive forever.
10. **No browser-native form controls.** No `<select>`, no
    `<input type="date">`, no `alert`/`confirm`. Use shadcn/ui + Radix.
11. **Never send customer content to analytics.** IDs and counts only — never
    issue text, search queries, filenames, emails or org names.
12. **Permissions come from one module**, built from `docs/permissions.md`.
    Every cell in that matrix has a test.
13. **No UI test suite.** Deliberate. Correctness lives in the API.
14. **All queries live in the repository layer.** Services and routes never
    query. Schema and index definitions live only in the schema files. If a
    table changes, exactly one file changes; if a query changes, exactly one
    layer changes.
15. **No user-facing string literals in the backend.** Every message a user
    can see resolves from `packages/i18n/en.json` — errors, email subjects
    and bodies, notification lines, validation.
16. **One response envelope for every endpoint.** `data` + `meta` on success,
    `error` on failure, never both. See `docs/api-conventions.md`.
17. **One API client file in the web app.** No `fetch` or HTTP library call
    outside `apps/web/lib/api/`.
18. **Every DTO lives in `packages/types`.** No workspace redeclares a
    response shape locally; a missing DTO is a backend task.
19. **Shared domain parsing lives in `packages/format`.** Duration, slug,
    issue key and project key are parsed and rendered in exactly one place.
20. **`docs/data-model.md` is the source of truth for the database.** Any
    table, column, nullability, key, foreign key, CHECK or index change is
    mirrored there in the same change as the schema file and migration.
21. **An API change is an MCP change.** MCP tools call the REST endpoints over
    HTTP, so a route whose path, parameters, body or response changes breaks
    the tool that calls it. Update the tool in `packages/mcp/src/tools/` (and
    its `endpoints` list) in the same change; a new route gets a tool, or an
    `x-mcp-exempt` category in `openapi.yaml`. Then run
    `bun run --cwd packages/mcp docs:tools`. The parity test, the tool tests in
    `apps/api/test/mcp.tools.test.ts` and the typecheck on shared DTOs catch a
    missed one.

## Comments in code

Write few, and only where they earn their place.

**Do not write:**

- Comments restating what the code plainly says
  (`// increment the counter` above `counter++`, `// one file per table`
  above a list of re-exports)
- Comments narrating another file's or doc's current behaviour
  (`// The row is retained so org_activity outlives the org` — that is the
  doc's sentence, not the code's)
- Bare doc pointers with no decision attached (`// see docs/data-model.md`)
- Journal, changelog or "what changed" comments — that is what git is for
- `@param` / `@returns` blocks listing what the signature already shows
- Commented-out code
- Section banners (`// ===== HELPERS =====`)
- Anything in an `index.ts` — everyone knows what a barrel file does

**Do write:**

- **Why**, where the reason is not visible in the code: a workaround, a
  non-obvious ordering constraint, a deliberate deviation, a performance
  trade-off, a spec quirk. One line, with the doc pointer only when the
  doc holds the rest of the reasoning
  (`// Direct URL: migrations take advisory locks, which pgBouncer breaks.`)
- **One line** above a function or class only when the name cannot carry it

**Never name another product.** The repository is public: no code, comment, string,
test, commit message, OpenAPI description or new doc text names another project
management or issue tracking product, even as the source of a decision. State the behaviour and its reason on their own.
The one exception is comparison content on the marketing site (`apps/marketing`): a pricing
calculator, a comparison page or a migration example may name the products it compares, as
page data. Code, comments and commit messages there still never do.
Reference screenshots of other tools stay out of anything committed.

**Before finalising any diff, re-read every comment you added and cut any
that repeats the code or narrates another file's behaviour.** The default
is no comment. A file with zero comments is normal.

Names carry the weight. A well-named function needs a sentence, not a
paragraph. If a comment is needed to explain *what* the code does, rename
things instead.

## Stack

TypeScript 5 · **Bun** (runtime, package manager, `bun test`) · Turborepo ·
Fastify · Drizzle · PostgreSQL · Zod · Next.js · Tailwind · shadcn/ui ·
TanStack Query · Tiptap · Prettier · ESLint

```
apps/web  apps/marketing  apps/api
packages/db  packages/types  packages/format  packages/i18n  packages/markdown
packages/query  packages/mcp  packages/mcp-stdio  packages/analytics  packages/config
```

## Conventions

- Instants in UTC `timestamptz`. **Calendar dates (`due_date`, `start_date`,
  `work_date`) are `date` and never timezone-converted.**
- Durations are integer minutes; parsed and rendered as `1w 1d 1h 1m`.
- Display: `19 Sep 2026` and `8:48pm`. Relative under 7 days, absolute after,
  always with an absolute tooltip. One formatter, in
  `apps/web/lib/datetime`.
- Colours are palette **token names** (`"amber"`), never hex. Values live in
  `design/tokens.css` and are generated by `design/scripts/palette.mjs` —
  edit the script, never the hex, and never restate colour values elsewhere.
- `created_by` / `updated_by`, not `*_id`.
- **Database and Drizzle keys are `snake_case`**, identical to the column:
  `created_at: timestamp()`, never `createdAt: timestamp('created_at')`.
  Table exports match the table name (`org_members`). Rows therefore carry
  the same key names as the API JSON. TypeScript-only values (function
  params, `TenantContext.orgId`) stay `camelCase`.
- **One name per concept across tables.** Soft delete is always `deleted_at`
  (on `users` it means erased); membership removal is `removed_at`;
  revocation is `revoked_at`. Do not introduce a synonym.
- Zod schemas in `packages/types` are the single source for validation, TS
  types, OpenAPI authoring and MCP tool inputs.

## Marketing site SEO

Sitemap and JSON-LD are controlled per page in `apps/marketing/src/data/`. A new route gets an
entry in `schema-config.ts` (title, description, JSON-LD nodes) and, if indexable, in
`sitemap-config.mjs`; bump its `lastmod` there when the page changes, which also updates the
page's JSON-LD `dateModified`. The build fails when the two disagree.

## Layering

```
routes/        HTTP only — Zod validation, status codes, envelope.
services/      Business logic, permission checks, transactions.
               The only layer that writes activity rows.
repositories/  packages/db. EVERY query lives here. TenantContext required.
schema/        packages/db. Table and index definitions. Nothing else.
```

A route never touches a repository directly, a service never writes SQL, and
a table definition never appears outside `schema/`.

## Definition of done

- Tests pass, including the tenant-isolation and permission-matrix suites
- `docs/openapi.yaml` updated if a route changed
- The affected user-manual page updated
- MCP tool added or updated if the capability is user-facing, or if a route
  it calls changed (rule 21); parity test green
- Lint and typecheck clean

## Working style

Follow the docs. Where a decision is not written down, ask rather than
inventing one — then write it down in the document that owns it.

Build a change end to end: schema, API, web, MCP, tests, docs.
