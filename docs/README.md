# Documentation Index

> **Nothing Left** — nothingleft.dev

An MCP-first project management tool. Issue tracking, agile boards, time
tracking, custom fields and reporting — built so that an LLM agent can do
everything a human can, through the same API.

## Read in this order

| Doc | What it covers |
|---|---|
| [tech-stack.md](./tech-stack.md) | Every technology chosen, and why |
| [architecture.md](./architecture.md) | Monorepo layout, services, how the pieces talk |
| [backend-guide.md](./backend-guide.md) | **Start here to write backend code.** Layers, where each piece lives, step-by-step for adding an endpoint |
| [infrastructure.md](./infrastructure.md) | Domains, hosting requirements, configuration, database roles, CI, self-hosting |
| [auth-and-tenancy.md](./auth-and-tenancy.md) | Sessions, OAuth, PATs, roles, invites, org isolation |
| [api-conventions.md](./api-conventions.md) | Response envelope, pagination, PATCH semantics, idempotency, message catalogue |
| [data-model.md](./data-model.md) | Every table, column and relationship, plus the index policy |
| [user-lifecycle.md](./user-lifecycle.md) | Removal, deactivation, erasure, per-org usernames, attribution |
| [file-storage.md](./file-storage.md) | Upload, private serving, bring-your-own storage |
| [permissions.md](./permissions.md) | The role × capability matrix — the authority for API, MCP and UI |
| [knowledge-base.md](./knowledge-base.md) | Private per-project documentation |
| [search-query-language.md](./search-query-language.md) | The query grammar shared by UI, saved views, reports and MCP |
| [mcp.md](./mcp.md) | MCP server design, tool surface, resources, prompts |
| [reports.md](./reports.md) | The nine reports and their parameters |
| [notifications.md](./notifications.md) | Event catalogue, recipients, the inbox, fan-out, digests, email policy and unsubscribe; webhooks (v2) |
| [emails.md](./emails.md) | Every email the system sends: catalogue key, subject, tokens and purpose — the list the templates are written from |
| [onboarding.md](./onboarding.md) | The three entry paths and the first empty state |
| [analytics.md](./analytics.md) | Events sent, and the privacy rules for sending them |
| [ui-conventions.md](./ui-conventions.md) | Date/time formats, colour, empty values, editor, page shells |
| [frontend.md](./frontend.md) | Component library, libraries, install policy. Colour defers to `design/`. |
| [frontend-guide.md](./frontend-guide.md) | **Start here to write web code.** Layout, aliases, the API client, styling map, step-by-step for adding a page |
| [limits-and-billing.md](./limits-and-billing.md) | Free tier, seat notices, storage quota, BYO storage |

## User manual

End-user pages, published under the marketing site's `/docs` — there is no
separate docs domain. Generic organisation, project and people
names only — never real ones.

| Page | What it covers |
|---|---|
| [manual/search.md](./manual/search.md) | Every way to search: attributes, values, negation, dates, ranges, links, sorting, shortcuts, autocomplete |
| [manual/issues.md](./manual/issues.md) | Keys, fields, states and resolution, watching/starring/voting, history, attachments and storage, delete and restore, project statuses/priorities/types/work types |
| [manual/mcp.md](./manual/mcp.md) | Connecting an AI agent: creating a token, Claude Code and Claude Desktop over HTTP or the stdio shim, what the tools do, resources, prompts, files |
| [manual/mcp-tools.md](./manual/mcp-tools.md) | **Generated** — every MCP tool with its arguments, the resources and the prompts (`bun run --cwd packages/mcp docs:tools`) |
| [manual/custom-fields.md](./manual/custom-fields.md) | Custom fields: the thirteen types, options, issue-type scoping, required fields and defaults, searching and sorting by slug, archive and delete, the Estimation and Spent time fields, work item attributes |
| [manual/knowledge-base.md](./manual/knowledge-base.md) | The knowledge base: the article tree, addresses, drafts and publishing, deleting with or without the articles beneath, tags shared with issues, searching, *Referenced by*, comments and files |
| [manual/reports.md](./manual/reports.md) | The nine reports: scoping by query, saved view and projects, what each counts, drill-down to the issue list, empty results, colours, CSV export and asking an agent |
| [manual/agile.md](./manual/agile.md) | Sprints (planning, starting, finishing and what happens to unfinished work), the backlog's order, story points, boards with columns, WIP limits and swimlanes |
| [manual/notifications.md](./manual/notifications.md) | The inbox, what each kind tells you and when, the ten-minute wait, email per kind (instant, daily or weekly digest), unsubscribing, asking an agent |
| [manual/account-security.md](./manual/account-security.md) | Two-factor authentication and recovery codes, confirming important changes, deactivating your account, erasure on request, transferring ownership, deleting an organisation |
| [manual/storage.md](./manual/storage.md) | Storage: what counts, the file list by size, bringing your own R2 or S3 bucket (the key's permissions, CORS, the two checks, moving files), a key that stops working, disconnecting, what is ever deleted there |
| [manual/tags.md](./manual/tags.md) | The organisation's tags: the list with counts by issues and articles, renaming (saved views follow), recolouring, merging, deleting, who may, asking an agent |
| [manual/import-export.md](./manual/import-export.md) | Importing issues from CSV (the file, mapping columns, the dry run and per-row errors, the import), exporting the whole organisation, asking an agent |
| [manual/members.md](./manual/members.md) | Members, and removing someone: what the dialog counts, reassigning open issues, moving saved views, what stays |
| [manual/keyboard-shortcuts.md](./manual/keyboard-shortcuts.md) | Every keyboard shortcut and where it works |

## Outside `docs/`

| Path | What |
|---|---|
| `CLAUDE.md` | Working agreement read by every coding session |
| `design/DESIGN-SYSTEM.md` | The visual system |
| `design/tokens.css` | **Single source of truth** for colour, type, space, size |
| `design/scripts/palette.mjs` | Generates and validates the palette — edit this, not the hex |

## Rules that apply to everyone working in this repo

1. **Markdown is the only rich-text storage format.** Never store HTML.
2. **The MCP server is a client of the public API.** If a capability is not
   reachable through the API, it does not exist.
3. **Docs are part of the change.** A route change that does not update
   `openapi.yaml` and the affected manual page is not done. CI enforces this.
4. **Human-readable identifiers in every public interface.** `PROJ-123`,
   `@username`, `"In Progress"` — not internal IDs.
5. **Simplicity is the product.** Every feature request is weighed against
   "does this make the tool harder to use?" The answer is usually no thanks.
6. **UNIQUE indexes only at schema time.** Every other index waits for
   production evidence. See `data-model.md`.
7. **`users` rows are never hard-deleted**, so attribution never degrades.
8. **DTOs live in `@nothingleft/types`.** Never redeclare a response shape.
9. **Never send customer content to a third party.** Analytics carries IDs
   and counts, never issue text, search queries or names.
10. **The permissions matrix is executable.** Every cell in `permissions.md`
    has a test.
