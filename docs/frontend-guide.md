# Frontend Guide

How `apps/web` is put together and the exact steps for adding a page, a
resource module or a component. **This is the only frontend guide.** There
are no per-folder READMEs; `apps/web/README.md` is a three-line quickstart
that points here. Other docs own the decisions this one implements —
[frontend.md](./frontend.md) (libraries, the one-client rule),
[ui-conventions.md](./ui-conventions.md) (formats, empty values, keyboard),
[api-conventions.md](./api-conventions.md) (the envelope),
[permissions.md](./permissions.md) (what to show per role) and
`design/DESIGN-SYSTEM.md` (everything visual). This guide links; it does not
restate.

## Runtime and tooling

| Concern         | Tool                                                                                                                                               | Command                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Package manager | **Bun**                                                                                                                                            | `bun add <pkg>@latest` inside `apps/web`                                                            |
| Framework       | Next.js App Router, React 19                                                                                                                       | `bun run dev` at the root (with the API), or `cd apps/web && bun run dev` → `http://localhost:3000` |
| Styling         | Tailwind v4 + shadcn/ui                                                                                                                            | `bunx shadcn@latest add <component>` inside `apps/web`                                              |
| Typecheck       | `next typegen` then `tsc --noEmit`                                                                                                                 | `bun run typecheck`                                                                                 |
| Lint            | ESLint flat config; the `nothingleft/*` rules come from `packages/config` ([tech-stack.md § Custom lint rules](./tech-stack.md#custom-lint-rules)) | `bun run lint`                                                                                      |
| Tests           | **none**                                                                                                                                           | `docs/architecture.md#testing-strategy` — correctness lives in the API                              |

The web app reads `apps/web/.env` using Next's built-in environment loader
(copy `apps/web/.env.example`). Backend settings live separately in
`apps/api/.env`. The one required variable is `NEXT_PUBLIC_API_BASE_URL`,
validated by `lib/env.ts` at import time. `NEXT_PUBLIC_SUPPORT_EMAIL` (optional, the API's
`SUPPORT_EMAIL`) is the address `components/email-us.tsx` shows where the app says *email us*. The API must be running for anything that talks to it; the shell itself
renders without it.

`bun run dev` at the root starts both — the API on `:4000` and the web app on
`:3000` — in one terminal, each log line prefixed with its workspace
(`turbo run dev --ui=stream`). Running either alone still works from its own
folder. The API's CORS origin is `APP_BASE_URL`, so the ports must match
what `apps/api/.env` says.

## Layout

```
apps/web/
├── app/                      Routes only. A page file composes components; it holds no logic.
│   ├── layout.tsx            <html>: fonts, Providers (theme, query, tooltip, toasts)
│   ├── globals.css           tokens copy (synced) + the Tailwind / shadcn mapping (see Styling)
│   ├── (app)/                Signed-in shell: session gate → sidebar + top bar; loading.tsx = page skeleton
│   │   ├── page.tsx          /            redirects to /dashboard
│   │   ├── dashboard/        /dashboard   Home — My work | Projects (design §8)
│   │   ├── inbox/            /inbox       notification centre
│   │   ├── my-issues/        /my-issues   issue list with `assignee: me #Unresolved`
│   │   ├── starred/          /starred
│   │   ├── settings/         /settings    account; ?tab=
│   │   ├── shortcuts/        /shortcuts   the `?` reference
│   │   ├── issues/           /issues · /issues/PP
│   │   ├── new-issue/        /new-issue?project=PP — the create form on a full page
│   │   ├── issue/[key]/[[...slug]]/  /issue/PP-123/<title-slug>; the optional catch-all makes the slug optional
│   │   └── projects/[key]/   /projects/PP/… — the full table is in § Routes below
│   │   └── page.tsx          /            the returning-user landing (components/landing)
│   ├── (auth)/               400px column on --bg-app (design §8c): /sign-in, /sign-up, /verify-email,
│   │                         /reset-password
│   ├── welcome/              Onboarding path C, outside the shell: the four step pages
│   ├── invite/[token]/       Onboarding paths A and B
│   ├── transfer/[token]/     The ownership transfer offer (6b), in the § 8d frame
│   ├── not-found.tsx         404 — denied and missing render identically
│   └── error.tsx
├── components/
│   ├── ui/                   shadcn output. Do not hand-edit; re-add to upgrade.
│   ├── shell/                app-shell (session gate), sidebar, project-nav, saved-view-nav, org-switcher,
│   │                         topbar (the `/` shortcut), global-search (issues and articles in two groups), breadcrumb,
│   │                         nav-item (+NavCount), theme-toggle, inbox-button (the top bar's unread count), brand,
│   │                         deletion-banner (the grace period, on every page of the organisation)
│   ├── auth/                 auth-split (the two-column frame) · auth-panel + art/ (the inline-SVG product
│   │                         panels) · the forms · Field, FormAlert, PasswordStrength, use-auth-form ·
│   │                         two-factor-step (the sign-in code step) · code-input (six cells over one input) ·
│   │                         provider-buttons (and ReauthButtons, the step-up's provider sign-in)
│   ├── onboarding/           flow-shell (rail + panel frame) · step-rail · step-panel · verify-gate ·
│   │                         one file per path-C step · welcome-flow (the step router)
│   ├── invite/               invite-flow (the path A/B state machine) · invitation-card · invite-sign-up ·
│   │                         accept-card · invite-profile-step · invite-intent (sessionStorage)
│   ├── organization/         one file per ?tab= panel (danger-tab: transfer and deletion; storage/ for the storage tab, 6c;
│   │                         tags/ for the tag manager and its dialogs, exports-tab, 6d), plus activity-labels · remove-member-dialog (the removal
│   │                         preview and its two choices) · member-picker (a person, by name, in a Popover) ·
│   │                         organization-mark (the DiceBear blobs mark; switcher, landing)
│   ├── shortcuts/            shortcuts-table (the `?` list, from lib/shortcuts) · shell-shortcuts (`?` dialog, `g` sequences)
│   ├── projects/             project-list · project-card · project-mark (the DiceBear initials mark; cards, sidebar) · project-dashboard (figures, strip, team load) ·
│   │                         first-project-empty-state · project-dialog · project-settings · project-people ·
│   │                         schema-values (the four ?tab= value lists) · deleted-issues ·
│   │                         time-tracking-switch · time-fields (Estimation / Spent time field) ·
│   │                         work-item-attributes (the table and the chosen one's values) ·
│   │                         custom-fields-settings (?tab=fields) · custom-field-dialog (new / edit, options)
│   ├── custom-fields/        field-types (labels, icons, groups, fieldsForType) · field-value (a value by type,
│   │                         sidebar or cell) · field-editors (the popover body per type, inputOf / entryWith) ·
│   │                         sidebar-fields (the issue sidebar's Fields rows)
│   ├── dashboard/            dashboard (tabs by role) · my-work · projects-overview · stat-row · meter ·
│   │                         status-strip · section · compact-issue-row
│   ├── landing/              landing-page: routes on GET /v1/me/landing; renders the switcher and no-org states
│   ├── editor/               markdown-editor (the one editor: Visual | Markdown) · editor-toolbar · extensions
│   │                         (Tiptap setup, the @/# suggestion bridge, ⌘↵) · reference-picker · source-format
│   │                         (Markdown-mode text edits) · caret (textarea caret position)
│   ├── markdown/             markdown (the only innerHTML: refs, task ticks, client-side links, image lightbox) ·
│   │                         issue-ref-card · markdown-attachments (the issue's files by URL, for image sizes)
│   ├── attachments/          attachments-section · upload-tray (progress, cancel, retry) · lightbox · storage-banner ·
│   │                         byo-failing-banner (the bucket refused its key) · unavailable-file (the placeholder for a
│   │                         file whose bucket cannot serve it) · file-badge (the neutral type square)
│   ├── issues/               issue-page · issue-title · issue-description · issue-sidebar · sidebar-field ·
│   │                         pickers (the Command bodies every field editor shares) · issue-activity ·
│   │                         issue-comments (header, body, menu, composer) · issue-links · add-links-dialog ·
│   │                         issue-parent · issue-tags · issue-spent-time (the Spent time tab) ·
│   │                         spent-time-dialog (log and edit, single dates and ranges) ·
│   │                         value-marks (StatusDot, PriorityBadge, TypeBadge) · member-avatar ·
│   │                         markdown-size-note · create-issue-provider (`c`) · create-issue-dialog ·
│   │                         create-issue-page · use-issue-draft (the form state both share) · draft-fields
│   │                         (chips for the dialog, the sidebar column for the page) · status-pill ·
│   │                         assignee-stack · due-date (the cells lists and dashboards share) · issue-modal
│   │                         (IssuePage variant="modal" in a Dialog) · copy-issue (copies `KEY Title`)
│   │   └── list/             issue-list (the composition) · list-state (URL ⇄ state) · query-bar ·
│   │                         view-tabs · list-toolbar · issue-table (grouping, virtualisation) · issue-row
│   │                         (inline editors) · group-header · bulk-bar · save-view-dialog
│   ├── articles/             knowledge-base (the rail and its context, mounted by the articles layout) · article-tree
│   │                         (dnd-kit tree, collapse, Alt+arrows) · tag-cloud · kb-home (search, recent, starters) ·
│   │                         article-results (the query bar and rows, per project or grouped) · article-row ·
│   │                         article-page (title, tags, body, editor, menu) · article-toc · article-comments ·
│   │                         article-dialogs (delete with the children choice, change address) · new-article-dialog ·
│   │                         deleted-articles · all-articles (/articles) · draft-mark
│   ├── agile/                backlog-page (sections, rows, dnd-kit sortable) · board-page (header, sprint picker,
│   │                         columns, lanes, drag between cells) · board-card (the card, NewCard, SubtaskProgress) ·
│   │                         board-redirect (/board first-board and short-slug routes) · board-settings* (the
│   │                         ?tab=boards panel) · sprint-dialogs (new / edit, start, finish, delete) · sprint-dates
│   │                         (dates, DaysLeft) · sprint-field (sidebar Sprint and Story points) · active-sprint
│   │                         (dashboard rows and project cards) · story-points
│   ├── reports/              report-frame (header, CSV, scope row, the four states) · report-state (URL ⇄ parameters,
│   │                         the default project) · report-view (name → report) · one file per report: distribution,
│   │                         matrix, burndown, age, time, gantt, timesheet · report-picker (single and multi Command
│   │                         pickers) · scope-pickers · field-picker · period-picker · report-states (empty with
│   │                         widening, 400 alert, failure, skeletons) · report-bits · report-index · chart/chart-parts
│   │                         (hatch, swatch, tooltip body, legend, category tick, duration ticks)
│   ├── notifications/        inbox-page (URL filters, the states, mark all) · inbox-entry (the row, its lines,
│   │                         Show all, skeletons) · inbox-preview (the dashboard rail) · unsubscribe (the page)
│   ├── imports/              import-page (/projects/PROJ/import) · csv-import-flow (file → columns → dry run → import) ·
│   │                         column-mapping · import-results (figures, unknown values, the failed-rows table, progress) ·
│   │                         recent-imports (rows that open in place)
│   ├── invitations/          email-chips · invite-emails-form · share-links · seat-notice
│   ├── settings/             one file per ?tab= panel, plus SettingsSection and the timezone picker; security-tab
│   │                         composes two-factor-section (setup, QR), recovery-codes and deactivate-section
│   ├── transfer/             transfer-flow (the /transfer/<token> states)
│   ├── choice-select.tsx     a Command in a Popover: the one replacement for <select>
│   ├── date-picker.tsx       month grid in a Popover; emits YYYY-MM-DD, never an instant. MonthGrid is the bare grid
│   ├── palette-swatches.tsx  the 14 palette tokens as buttons; the only colour input
│   ├── former-member-chip.tsx  FormerMemberChip, InactiveChip, deactivatedInk, personTitle, and PersonName,
│   │                           which every person's name goes through
│   ├── step-up-dialog.tsx    the password + code confirmation for destructive account and organisation actions
│   ├── confirm-dialog.tsx    irreversible or other-people-affecting actions only
│   ├── job-status.tsx        a background job's state as a dot and a word (imports, exports)
│   ├── avatar-picker.tsx     the upload / remove pair, shared by settings and onboarding
│   ├── site-scripts.tsx      third-party tags for every page, env-gated (see Page metadata)
│   ├── page-header.tsx       title + date/meta + right-hand actions; segmented.tsx = the tab pills
│   ├── full-page-loader.tsx  boot only (see Loading)
│   ├── skeletons.tsx         PageSkeleton, RowsSkeleton, TextSkeleton
│   └── *.tsx                 design-system components: kbd, letter-badge, issue-key, empty-state,
│                             relative-time, page-title, duration (every duration, in mono). One file per component.
├── hooks/                    TanStack Query hooks (use-session, use-me, use-sessions, use-tokens, use-sign-out,
│                             use-account-theme, use-health, use-organizations, use-members, use-projects,
│                             use-invitations, use-activity, use-issues, use-project-schema, use-issue-search,
│                             use-saved-views, use-landing, use-comments, use-issue-links, use-tags,
│                             use-work-items, use-attachments — the list, delete, useStorage and useUploader),
│                             use-custom-fields, use-work-item-attributes, use-custom-columns (the list's custom
│                             columns: the project's fields, or the rows' own across projects),
│                             use-project-roles (what the viewer may edit where),
│                             use-project-visit (records `last_project_key`), use-recently-viewed and
│                             use-visible-columns (localStorage), use-media-query, use-work-calendar
│                             (the org's `1d`/`1w` for formatDuration; useWorkWeek, the days a range logs on), use-shortcut (bare single-key shortcuts),
│                             use-api-error (API `error.field` → the input that
│                             failed), use-shell-data (the org, its siblings and the project list for the sidebar),
│                             use-debounced, use-sidebar-collapsed, use-articles (tree, article, moves, delete and
│                             restore, tags, search, Referenced by, global search, the remembered collapse),
│                             use-reports (a report, the timesheet drill-down, CSV), use-report-scope (projects in
│                             scope and their groupable fields and work item attributes), use-notifications (the
│                             inbox, unread count, facets, mark read drawn early, preferences, unsubscribe),
│                             use-open-notification (switches organisation before opening another one's entry),
│                             use-account-security (two-factor, deactivate), use-organization-lifecycle (deletion,
│                             the pending transfer, the /transfer page's preview, accept and decline),
│                         use-organization-storage (the storage overview and file list, delete, connect, the
│                         browser check, the migration, disconnect), use-imports (the list, one import, upload,
│                         dry run, start), use-exports (the list, request); use-tags also holds the tag manager's
│                         list, rename / recolour, merge and delete
├── lib/
│   ├── api/                  client.ts (the only fetch) · errors.ts · server.ts · storage.ts (presigned PUT;
│   │                         putUpload is XMLHttpRequest, for upload progress) · attachments.ts ·
│   │                         csv.ts (the envelope-less download) · security.ts (two-factor, deactivate) ·
│   │                         ownership-transfers.ts (deletion and transfer) · organization-storage.ts (the storage
│   │                         tab and bring-your-own bucket) · imports.ts · exports.ts (exportDownloadHref) ·
│   │                         one file per resource
│   ├── reports/              registry (the nine: title, description, section) · url (parameters, defaults, the
│   │                         burndown's PROJ/<sprint>) · colors (markPaint: series, label, category, Other)
│   ├── articles/             tree (subtree, canDrop, dropBody, applyDrop, visibleRows) · starters (the four templates)
│   ├── notifications/        kinds (kind names and phrases, the inbox's kind filters, area labels, email options)
│   ├── storage/              aws-regions (the region picker's list) · connection (the credentials draft, the body it
│   │                         sends, the saved failure's field and sentence)
│   ├── issue-list/           columns (the optional columns and their CSV names) · url-state (?q= ?view= ?group=
│   │                         ?sort=) · highlight (attribute/value colouring) · links (dashboard figure → list URL)
│   ├── query/                provider.tsx (QueryClient defaults, focus) · keys.ts (query-key factory) · poll.ts
│   │                         (the intervals) · optimistic.ts (optimisticList, the onMutate/onError pair) ·
│   │                         agile.ts (invalidateAgile: sprints, backlog and board views together)
│   ├── shortcuts.ts          the one list of keyboard shortcuts
│   ├── datetime/             the one date formatter: format · relative. Durations are @nothingleft/format.
│   ├── env.ts
│   ├── files.ts              SHA-256 (base64) and image dimensions before presign; the markdown a file is stored as;
│   │                         saveDownload, the one way a blob is handed to the browser (CSV, recovery codes)
│   ├── issue-path.ts         issuePath(issue) → /issue/KEY/<slug>: the one place an issue URL is built
│   ├── numbers.ts            formatCount: `10,000`, grouped the same in every locale
│   └── utils.ts              cn()
├── scripts/sync-tokens.ts    `bun run tokens:sync` — recopies design/tokens.css into globals.css
├── AGENTS.md, CLAUDE.md      written by `next dev`: point at node_modules/next/dist/docs. Read them; Next 16 differs from older training data.
├── components.json           shadcn config — aliases point at the folders above
├── eslint.config.mjs         shared config + Next + the three bans below
└── next.config.ts
```

## Routes

Decided 22 Sep 2026; this section owns the URL scheme. One rule applies:
**no internal id ever appears in a route.** Issues by key, projects by key,
organisations, articles, boards and sprints by slug, users by username.
`PROJ` below is a project key (`PP`, `PMS`).

| Route                                                                                   | Page                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                     | The returning-user landing: asks `GET /v1/me/landing`, then goes to the project's issues, the project list, or renders the organisation chooser / no-organisation state ([onboarding.md](./onboarding.md#returning-user-landing)) |
| `/dashboard`                                                                            | Home: _My work_ / _Projects_ by role (design § 8)                                                                                                                                                                                 |
| `/inbox?kind=&project=&org=&unread=1`                                                   | Notification centre across every organisation; the URL holds the filters (6a)                                                                                                                                                     |
| `/my-issues`, `/starred`                                                                | Fixed issue lists                                                                                                                                                                                                                 |
| `/issues?q=`                                                                            | Cross-project issue list; the query bar drives it and the URL mirrors it                                                                                                                                                          |
| `/issues/PROJ?q=`                                                                       | Alias of `/projects/PROJ/issues` (a `rewrites` entry in `next.config.ts`, not a redirect)                                                                                                                                         |
| `/issue/PROJ-847/<title-slug>`                                                          | Issue page. The slug is derived from the title, **optional and ignored for lookup**; the client replaces the URL with the current slug on load so stale links still resolve                                                       |
| `/new-issue?project=PROJ`                                                               | Create an issue on a full page; the dialog's expand button carries its draft here (decided 24 Sep 2026)                                                                                                                           |
| `/projects`                                                                             | Project list                                                                                                                                                                                                                      |
| `/projects/PROJ`                                                                        | Project dashboard                                                                                                                                                                                                                 |
| `/projects/PROJ/issues?q=`                                                              | Project issue list                                                                                                                                                                                                                |
| `/projects/PROJ/backlog`                                                                | Backlog                                                                                                                                                                                                                           |
| `/projects/PROJ/board/<board-slug>/current`                                             | Board on the active sprint                                                                                                                                                                                                        |
| `/projects/PROJ/board/<board-slug>/<sprint-slug>`                                       | Board on a given sprint                                                                                                                                                                                                           |
| `/board/<board-slug>/current`, `/board/<board-slug>/<sprint-slug>`                      | Short form of the two above; board slugs are unique per organisation so no project segment is needed                                                                                                                              |
| `/projects/PROJ/articles?q=`                                                            | Knowledge base home: the article search (the URL mirrors `q`), recently updated articles, or the starters when the project has none. `?view=deleted` lists what the reader may restore (3.5)                                    |
| `/projects/PROJ/articles/<article-slug>`                                                | An article. `?edit=1` opens it in the editor and is dropped from the address; a new article arrives with it (3.5)                                                                                                                 |
| `/articles?q=`                                                                          | Every article the user can read, grouped by project, with the same search                                                                                                                                                         |
| `/projects/PROJ/reports`                                                                | Report index for a project                                                                                                                                                                                                        |
| `/reports`, `/reports/<report>?…`                                                       | Report index; one report with its parameters in the query string, e.g. `/reports/burndown?sprint=PROJ/september-2026`                                                                                                             |
| `/timesheets`                                                                           | The timesheet report, defaulting to the current user and week                                                                                                                                                                     |
| `/projects/PROJ/import`                                                                 | CSV import into the project: the flow and *Recent imports*, whose rows open in place (an import has no address of its own). Project Admin and up; others get a sentence saying who can (6d, 10 Oct 2026) |
| `/projects/PROJ/settings?tab=`                                                          | `general` · `statuses` · `priorities` · `types` · `fields` · `time-tracking` · `boards` · `people` · `invites` · `deleted` (Project Admin only: deleted issues within the 14-day restore window; decided 24 Sep 2026)             |
| `/organization?tab=`                                                                    | `general` · `members` · `invites` · `tags` · `audit` · `storage` · `exports` · `plan` · `danger` (Owner only; `&confirm=transfer&to=<username>` or `&confirm=delete` reopens its dialog after a provider sign-in, 6b). `storage` (Org Admins and the Owner, 6c) keeps the list in `&sort=created`, `&where=platform\|byo`, `&project=PROJ`, `&offset=`; `&setup=provider\|permissions\|cors\|credentials\|check\|connected` is the bring-your-own wizard's step, `&setup=update` the key form, `&confirm=disconnect` reopens that dialog. `tags` (6d) is open to a Project Admin of any project as well; `exports` (6d) to Org Admins and the Owner, and is where the export-ready email links |
| `/settings?tab=`                                                                        | Account: `profile` · `security` · `sessions` · `tokens` · `notifications`. On `security`, `&confirm=disable-two-factor`, `recovery-codes` or `deactivate` reopens that dialog after a provider sign-in (6b)                        |
| `/sign-in`, `/sign-up`, `/verify-email`, `/reset-password`, `/auth/<provider>/callback` | `(auth)` group, 400px column                                                                                                                                                                                                      |
| `/invite/<token>`                                                                       | Invite landing (Path A) and accept card (Path B)                                                                                                                                                                                  |
| `/transfer/<token>`                                                                     | Ownership transfer offer: preview, accept or decline (6b); the token rides in request bodies, never the API path. Outside the shell, in the § 8d frame; signed out it offers `/sign-in?next=` back here rather than bouncing, and wrong account, expired and invalid are its own states |
| `/unsubscribe?token=`                                                                   | One-click unsubscribe from an activity email, in the `(auth)` group: reads `GET /v1/notifications/unsubscribe`, says what it turns off, and turns it off only on the button (a link scanner must not unsubscribe anyone); no sign-in (6a) |
| `/welcome`, `/welcome/organization`, `/welcome/project`, `/welcome/invite`              | Onboarding Path C steps                                                                                                                                                                                                           |

Tabs are `?tab=` query parameters, not path segments, so a settings page is
one route file. Routes not listed are decided by the sub-phase that needs
them and added here in the same commit.

## Import aliases

Never write `../../lib/x`. `tsconfig.json` defines them (no `baseUrl`):

```
@app/*          app/*
@components/*   components/*        @components/ui/button, @components/shell/sidebar
@hooks/*        hooks/*
@lib/*          lib/*               @lib/api/client, @lib/datetime, @lib/utils
```

Workspace packages come in by name: `@nothingleft/types` for every DTO and
`@nothingleft/format` for duration, slug and issue-key parsing.

`bunx shadcn add` currently writes `import { cn } from "cn"` when the utils
alias is not under `@/`, **and installs an npm package named `cn`**. Fix both
after every add:

```
bun remove cn; sed -i '' 's#from "cn"#from "@lib/utils"#' components/ui/*.tsx && bunx prettier --write components/ui
```

## The layers

```
app/           route files          compose components, read params, set metadata. Nothing else.
components/    React                render props; call hooks; never call lib/api directly.
hooks/         TanStack Query       useX() → queryKeys.x() + the resource function.
lib/api/       typed resources      listIssues(), getIssue(key)… every one calls client.ts.
lib/api/client.ts                   the ONLY fetch. Envelope, errors, timeout, 401, idempotency, retry.
```

### `lib/api/client.ts`

`api.get / post / patch / put / delete(path, opts)` return `{ data, meta }`
exactly as the API sends it, so `meta.pagination` and `meta.request_id` are
always in reach. It owns, per [frontend.md](./frontend.md#one-api-client):

| Concern              | Behaviour                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base URL             | `env.apiBaseUrl` + path; `query` values that are `undefined`/`null` are dropped, and an array repeats the parameter (`kind` on the audit log)          |
| Credentials          | `credentials: 'include'` on every call                                                                                                                 |
| Timeout              | 10s via `AbortSignal.timeout`, combined with any caller signal                                                                                         |
| Envelope type        | `SuccessEnvelope<T>` from `@nothingleft/types`. The client does not declare its own.                                                                   |
| Error envelope       | parsed with `ErrorEnvelopeSchema` from `@nothingleft/types` → `ApiError { status, code, message, requestId, field, validValues }`                      |
| Readable headers     | only what the API's CORS `exposedHeaders` names ([api-conventions.md](./api-conventions.md#cors-and-exposed-headers)); anything else reads back `null` |
| Non-envelope answers | `ApiNetworkError('malformed' \| 'timeout' \| 'offline')`                                                                                               |
| `401`                | only `unauthorized` (the session is gone) calls the unauthorized handler: the query provider clears its cache, then a full navigation to `/sign-in?next=<here>`. A wrong password or code typed while signed in is also a 401 (`auth.invalid_credentials`, `two_factor.invalid_code`) and stays on the form (6b) |
| `Idempotency-Key`    | UUID on every `POST` unless `idempotencyKey: false`; pass your own to retry the same create                                                            |
| Retry                | `GET` only: twice, on network failure or `502/503/504`. Never a write.                                                                                 |
| Server components    | pass `headers: await serverHeaders()` from `lib/api/server.ts` to forward the session cookie                                                           |

`lib/api/storage.ts` is the one exception to "client.ts is the only fetch": a
presigned PUT goes straight to the storage origin, which has no envelope and
no session ([file-storage.md](./file-storage.md#principles)). The storage wizard's browser check
(`putCheckObject`, `getCheckObject`, 6c) lives there too, for the same reason. `lib/api/csv.ts`
is the second: a CSV is the one success without an envelope
([api-conventions.md](./api-conventions.md#rules)), so `downloadCsv` reads the body
as a blob and takes its filename from `Content-Disposition`; the audit log and the
issue export both call it, then `saveDownload` from `lib/files.ts`. Its _errors_ are still envelopes and are parsed as such.
Both live under `lib/api/` so the lint rule still holds.

A **resource module** is one file per API resource, exporting plain
functions with typed results:

```ts
// lib/api/projects.ts
import type { Project } from '@nothingleft/types';
import { api } from '@lib/api/client';

export const listProjects = () => api.get<Project[]>('/v1/projects');
export const getProject = (key: string) => api.get<Project>(`/v1/projects/${key}`);
export const createProject = (body: CreateProject) => api.post<Project>('/v1/projects', { body });
```

**Response types come from `packages/types`, always.** A local
`type Me = {...}` is a second source of truth that drifts from the API the
moment a field changes — silently, at runtime, because the client casts
rather than validates. When a DTO is missing, add it to `packages/types`;
that is a backend task, not a licence to declare it in `lib/api/`. The same
goes for `SuccessEnvelope<T>`, `Meta` and the error shape.

### `lib/query/`

`QueryProvider` sets the defaults: `staleTime` 30s, refetch on window focus,
no query or mutation retries. The HTTP client alone retries eligible GETs
(up to three attempts total), including calls outside TanStack Query.
`queryKeys` is the one place query keys are spelled:

```ts
export const queryKeys = {
  projects: () => ['projects'] as const,
  project: (key: string) => ['projects', key] as const,
};
```

Polling is `refetchInterval` on the hook, not a timer in a component, with the
interval from `POLL` in `lib/query/poll.ts`: 30s for every list and the issue page, 60s
for figures and the admin lists (members, invitations, audit log, sessions, tokens), and 3s
(`waiting`) only while a dialog waits on something the user does elsewhere — the Connect an
LLM dialog until the new token's first call — stopping once it happens. `progress` (5s) is for a
job the user started and is watching: the storage overview while files move to the customer's
bucket, back to `admin` once the move is done or failed. `job` (10s, owner, 10 Oct 2026) is a CSV import
or an organisation export while it is queued or running.
Every mutation is optimistic (`onMutate` → `setQueryData`, roll back in `onError`,
invalidate in `onSettled`); a list mutation spreads `optimisticList(client, key, apply)`,
which draws the change in every cached query under the key and restores them on a
refusal. What only the server can know (a new row's id, a create) is not drawn early.

**Switching organisation resets every organisation-scoped query** (`useSwitchOrganization`).
Most keys carry no slug, because the server resolves them against the session's organisation,
so the switch cancels them in flight and resets them rather than invalidating: an invalidated
query keeps the old organisation's rows on screen until it answers. Account-wide reads (`me`,
`organizations`, the inbox, notification preferences) survive.

**Only a tab someone is looking at polls** (decided 25 Sep 2026, 1g — cheap hosting,
many open tabs). `lib/query/provider.tsx` points TanStack's `focusManager` at
`visibilitychange` plus the window's `focus` and `blur`, so a hidden tab or a window that
lost focus is unfocused. Queries never poll unfocused (`refetchIntervalInBackground`
stays false), and refocusing refetches whatever went stale, so the screen catches up at
once. No timer runs for this; the events are the whole mechanism.

### `lib/datetime/`

Implements [ui-conventions.md](./ui-conventions.md#date-and-time) and is the
only place a date is turned into text:

| Function                                     | Output                                               |
| -------------------------------------------- | ---------------------------------------------------- |
| `formatDate`, `formatTime`, `formatDateTime` | `19 Sep 2026` · `8:48pm` · `19 Sep 2026, 8:48pm`     |
| `formatLongDate`                             | `Sunday, 20 Sep 2026` — page headers                 |
| `formatDateTimeWithZone`                     | `19 Sep 2026, 8:48pm IST` — the tooltip              |
| `formatRelative(value, now?)`                | `just now` … `3 days ago`, absolute date from 7 days |
| `formatCalendarDate('2026-09-19')`           | never timezone-shifted                               |

**Durations are not here.** `parseDuration` / `formatDuration`
(`1w 1d 1h 1m` ⇄ integer minutes, against a `WorkCalendar`) come from
`@nothingleft/format`, because the API, the MCP server and the query parser
need the same two functions — see
[architecture.md](./architecture.md#packagesformat--shared-domain-parsing).
`slugify`, `parseIssueKey` / `formatIssueKey` and `generateProjectKey` live
there too.

Every function takes an optional IANA `timeZone`. Without one it uses the signed-in
profile's zone, which `AppShell` hands to `setProfileTimeZone` on every render (1g: a
dozen call sites passed nothing and rendered in the browser's zone), and the
browser's only before sign-in. The tooltip's zone name comes from the first English
locale that has an abbreviation for it (`IST`, `BST`, `EDT`), else the offset. `<RelativeTime>`
wraps `formatRelative` with the absolute tooltip and re-renders each minute.

## Styling

`app/globals.css` carries a verbatim copy of `design/tokens.css` between the
`tokens:start` / `tokens:end` markers and maps it onto Tailwind with
`@theme inline reference`. **Never edit inside the markers**: change
`design/tokens.css` (or `design/scripts/palette.mjs`), then run
`bun run tokens:sync` in `apps/web`, **then `bunx prettier --write app/globals.css`** —
the sync copies the design file verbatim, so without that second step the whole token
block reformats and a one-line change arrives as a 400-line diff. The copy exists so the app does not
import across the package boundary; the design file stays the source. The `reference` keyword matters: without it,
Tailwind re-emits `--text-xs: var(--text-xs)` and the like, because the
token names collide with Tailwind's own theme namespace.

| You want         | Utility                                                                                                                    | Token                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Surfaces         | `bg-app` `bg-surface` `bg-raised` `bg-inset` `bg-hover` `bg-active` `bg-selected`                                          | `--bg-*`              |
| Text             | `text-text` `text-text-secondary` `text-text-muted` `text-text-disabled`                                                   | `--text*`             |
| Borders          | `border` (default) `border-border-strong` `border-border-subtle`                                                           | `--border*`           |
| Ink buttons      | `bg-ink text-ink-fg hover:bg-ink-hover`                                                                                    | `--ink*`              |
| **Brand accent** | `bg-brand` `bg-brand-soft` `text-brand-text` `text-on-brand`                                                               | `--accent*`           |
| Feedback         | `text-danger-fg` `bg-warning-bg` `text-success-fg`                                                                         |                       |
| Palette          | `bg-amber-bg text-amber-fg` `bg-green-solid`, or `c-amber` + `bg-c-bg text-c-fg`                                           | `--palette-*`         |
| Charts           | `chart-1` … `chart-8`                                                                                                      | `--chart-*`           |
| Type             | `text-2xs` (12) `text-xs` (13) `text-sm` (14) `text-md` (15) `text-lg` (17) `text-xl` (22) `text-2xl` (26) `text-3xl` (34) | line-heights included |
| Sizes            | `h-row` `h-control` `size-icon` `size-avatar` `w-sidebar` `h-topbar` `px-page-x`                                           | `--row`, `--control`… |
| Radius           | `rounded-xs` (3) `rounded-sm` (4) `rounded-md` (6) `rounded-lg` (8)                                                        |                       |
| Mono             | `font-mono tabular` for keys, durations, the query bar                                                                     |                       |

**shadcn's `accent` is not the brand.** In shadcn's vocabulary `accent` is
the hover fill behind menu items, so `bg-accent` maps to `--bg-hover` and the
copied components work untouched. The yellow brand accent is `brand`.

Theme: `next-themes` writes `data-theme="light|dark"` on `<html>`, which is
what `tokens.css` keys on; `dark:` utilities exist but are rarely needed
because every token already switches. The `.c-<hue>` classes come from
`tokens.css`. The routes in `lib/auth-routes.ts` are forced light through
`forcedTheme` in `components/providers.tsx` (DESIGN-SYSTEM.md § Auth pages).

Fonts are Inter and JetBrains Mono through `next/font/google`, which
downloads at build time and self-hosts. Because `next/font` renames the
families, `globals.css` re-points `--font-sans` / `--font-mono` at its
variables — the one place a token is overridden.

`exactOptionalPropertyTypes` is off in `apps/web/tsconfig.json`: shadcn's
generated code and several React libraries are not written for it. Every
other strict flag from the shared config is on.

## Page metadata and site-wide scripts

- **Title per page**: the root layout sets `title.template = '%s · Nothing Left'`;
  each `page.tsx` exports `metadata = { title: 'Inbox' }`, or `generateMetadata`
  when the title depends on params (`PP-123`). Description, Open Graph and
  robots go in the same object.
- **Scripts on every page**: `components/site-scripts.tsx`, rendered once by
  the root layout with `next/script`. Each tag is gated by its own
  `NEXT_PUBLIC_*` variable (`NEXT_PUBLIC_GA_MEASUREMENT_ID` is the worked
  example; its redaction is in [analytics.md](./analytics.md#google-analytics-on-the-web-app))
  and renders nothing when unset. Where the GA tag loads, the cookie notice
  renders beside it ([analytics.md](./analytics.md#the-cookie-notice)). Product analytics remain PostHog
  through `packages/analytics`; whatever is added here obeys CLAUDE.md rule
  11 — no customer content.

## Onboarding and invitations

Decided 23 Sep 2026, in 0c. `/welcome/*` and `/invite/<token>` do **not** use the
`(auth)` split of design § 8c. They use `components/onboarding/flow-shell.tsx`: a full
-width header band, then an inset `--bg-app` rail beside the form on `--bg-surface`.
Every visual rule for it — surfaces, the icon markers, the type scale, and why the rail
prose may not be `--text-muted` — is in `design/DESIGN-SYSTEM.md § 8d`. This section
owns only how the step list is assembled.

The rail is **built per path, not fixed**, because the steps genuinely differ:

| Path                        | Steps                                                       |
| --------------------------- | ----------------------------------------------------------- |
| C — self sign-up            | Your profile · Organisation · First project · Invite people |
| A — invited, no account     | Your account · _Confirm your email_ · Your profile          |
| B — invited, account exists | Review the invitation · You're in                           |

_Confirm your email_ appears only when it applies: a password sign-up from a share
link. An email invitation proves the address, so that account is created verified and
never sees the step (auth-and-tenancy.md § Invitations).

Two details worth knowing before touching this code:

- **Path A accepts without a second click.** The person already pressed "Join
  <organisation>", so asking again would be a dialog about a decision they made.
  `components/invite/invite-intent.ts` parks the token in `sessionStorage` before the
  sign-up leaves the page, and the invite page accepts on the way back. Storage
  blocked, or a different tab, falls back to the explicit Path B card — never wrong,
  just one click more.
- **The step guard waits for `GET /v1/me`.** Creating an organisation switches the
  session into it, so the slug only exists after Me is refetched. `welcome-flow.tsx`
  holds its out-of-order redirect while that request is in flight, or it would bounce
  people back to the form they just submitted.

## Issue page and create dialog

Built in 1b; the visual rules are design § 8b and ui-conventions.md § Issue page. How
the pieces fit:

- **Every sidebar field is a `SidebarField`**: label over value, the whole row a
  Popover trigger whose body is one of the `pickers.tsx` Commands. A field saves when
  its picker closes on a choice; Assignees saves once when the popover closes, so
  toggling three people is one PATCH and one history entry. Read-only (Observer,
  archived project) renders the same row without the trigger.
- **Mutations on an issue go through `useUpdateIssue(key)`**, passing the body and an
  `optimistic` function that returns the issue as it should look now. The server's
  answer replaces it; a failure rolls back and the caller shows the message.
- **Estimates are sent as typed** (`"1d 4h"`). `parseDuration` only previews what will
  be stored; the API does the parsing that counts.
- **Referenced keys** in any rendered markdown are looked up in one
  `GET /v1/issues/refs?keys=` batch by `<Markdown>` itself, which strikes resolved ones
  through, shows the hover card, and renders a key the reader cannot open as plain text
  (revised in 1d; 1b asked `GET /v1/issues/KEY` per key).
- **The create dialog** is mounted by `CreateIssueProvider` in the shell, opened by `c` or
  the top-bar button. Its project is the one the current route names, else the last one
  created into (`localStorage`, a per-viewer convenience), else the first writable one.
  The field row is compact chips (Type, Priority, Status, Assignees, Estimation, Start,
  Due) showing the project defaults until changed. An `Idempotency-Key` is kept per
  request body, so retrying the same body reuses it and editing the form mints a new
  one. After creating: a toast with _Open_, and _Create more_ keeps the dialog open.
  The expand button parks the draft in memory (`parkDraft`) and navigates to
  `/new-issue`, which takes it back; both render from `use-issue-draft.ts`. The draft
  also holds tags (a new one marked `isNew`, sent as `{ name, color }`) and, on the full
  page, links grouped by name into `links: [{ link, issues }]` on the same POST.
- **Deleting** is a `ConfirmDialog` first (owner decision, 24 Sep 2026), then a toast with
  _Undo_ (`POST …/restore`); the settings tab `deleted` lists what is still restorable.
  Archiving a project from the list or its settings is confirmed the same way.
- **Every picker takes `loading`** (`pickers.tsx`): while its list is on its way it shows
  skeleton rows, never _No value matches_. A picker opened before its request has answered
  is the common case on a slow connection, so every call site passes the query's `isPending`.
- **Editable sidebar values** carry a dotted rule and a pencil that appears on hover
  (`sidebar-field.tsx`); read-only rows show neither. `globals.css` also sets the pointer
  cursor on menu and command items with an unlayered rule, because shadcn's `cursor-default`
  utility outranks the `@layer base` rule the shell already has.
- **Schema lists** (`schema-values.tsx`) reorder by dragging the grip (native HTML5
  drag, no library) or Alt+↑/↓ on a focused row; both send `PATCH { position }`.
  Deleting opens one dialog; when the API answers `409 config.in_use`, the same dialog
  asks where to move the issues from `error.valid_values`.

## Editor, comments, links and tags

Built in 1d; the rules are ui-conventions.md § Issue page and § Comment editor. How the
pieces fit:

- **One editor.** `MarkdownEditor` takes and emits a markdown string and nothing else;
  the description, the comment composer, a comment being edited and the create dialog
  all use it. Visual is Tiptap with `@tiptap/markdown` (`getMarkdown()` on every change);
  Markdown is a plain textarea over the same string. A value changed from outside (cleared
  after posting) replaces the document without echoing back as a change.
- **The toolbar is one surface over both modes** (`EditorCommands`): Tiptap commands in
  Visual, the text edits in `source-format.ts` in Markdown, so no button goes dead because
  of the mode.
- **Pickers insert text.** `@` and `#` are `@tiptap/suggestion` plugins in Visual and a
  look-behind on the caret in Markdown; both drive the same `ReferencePicker` (a Command in
  a Popover anchored at the caret, focus left in the text). What they insert is plain
  `@username` or a key, so there is no custom node to serialise. While a search is still
  answering, the picker swallows `↵`, `⇥` and the arrows, so the key cannot fall through
  to the text or move focus to the next button.
- **`⌘↵` is the editor's own shortcut** (`submit-shortcut`, priority 1000), because
  StarterKit binds Mod-Enter to a hard break.
- **Task ticks** come from `<Markdown onToggleTask>`, passed only when the viewer may edit
  that text (`canEdit` for a description, `Comment.me.can_edit` for a comment); otherwise
  the boxes stay disabled. The optimistic update rewrites the cached markdown with
  `toggleTaskItem` from `@nothingleft/markdown`, the function the API uses.
- **A comment lives in two caches**, the Comments tab (`GET …/comments`) and the All tab's
  entries that embed it (`GET …/activity`). `use-comments.ts` patches both on edit, tick and
  delete, and appends a new comment to the last loaded page while it posts.
- **Activity tabs** are separate queries keyed by filter: All (no `kind`), History (every
  kind but the three comment kinds). `comment_edited` rows are never drawn; the comment
  carries its own _edited_ marker.
- **Links, parent and tags.** `use-issue-links.ts` stores the groups the API answers with
  and invalidates both ends of every change, since a link is written on both issues. The
  parent line reads its chip from the refs batch, not the links query, so it appears as
  soon as the parent is set; a PATCH that changes `parent` invalidates the links of the
  issue and of both parents. Tags are applied and removed one at a time (`useIssueTag`);
  only removal is drawn early, because a new tag's name and colour are the server's.
- **Pickers inside dialogs scroll** because `usePopoverScrollInDialogs` (mounted once in
  `providers.tsx`) stops wheel and touch events inside a popper at the window, before a
  dialog's scroll lock can drop them; `overscroll-behavior: contain` keeps the page behind
  still.
- **A menu item that opens a popover** (_Set parent_) waits for the menu's
  `onCloseAutoFocus`: opened any earlier, the menu's dismissal and its focus return close
  the popover again.
- **Former members**: every `MemberRef` and activity actor with `former_member: true` is
  drawn through `PersonName`, which adds the chip.

## Time tracking

Built in 1e; the rules are ui-conventions.md § Spent-time dialog and § Issue page. How the
pieces fit:

- **The issue page owns the switch.** It reads `Project.time_tracking_enabled` and the
  viewer's role, and hands one `TimeTracking` object (`enabled`, `canLog`,
  `canLogForOthers`, `me`, `onLogTime`) to the sidebar and the activity section, so the
  sidebar field, the tab, the composer button and the dialog appear and vanish together.
  While the project is still loading it assumes tracking is on, which is the default.
- **One dialog, three doors.** The sidebar `+`, the composer's _Add spent time_ and the
  tab's button all open the same `SpentTimeDialog`, mounted once by the issue page; the
  tab mounts its own copy with `item` to edit a record. The dialog previews what a range
  writes with `workingDaysBetween` from `@nothingleft/format` — the function the API
  expands ranges with — and sends durations as typed. A retried save keeps its
  `Idempotency-Key` while the body is unchanged.
- **Every write refreshes the chain.** A record changes its issue's and every
  ancestor's `spent_minutes` and shows in each one's subtree list, so `use-work-items.ts`
  invalidates every issue query and every work-item list on settle rather than guessing
  which ancestors moved. Only a delete is drawn early: the row leaves the lists and its
  minutes leave the issue at once.
- **Settings**: `time-tracking-switch.tsx` is a `PATCH /v1/projects/{key}` with
  `time_tracking_enabled`; it sits above the work types list on the `time-tracking` tab.
  The create form drops its Estimation chip for a project with tracking off.

## Attachments

Built in 1f; the rules are ui-conventions.md § Issue page (_Attachments section_) and
§ Comment editor (_Uploads_), the flow file-storage.md § Upload. How the pieces fit:

- **One uploader per surface.** `useUploader(target)` runs presign → PUT → complete for
  any number of files, each with its own progress, cancel and retry. The target is
  `{ issue }` (with `comment_id` or `work_item_id`) where the parent exists, `{ project }`
  for a draft. Every editor that takes files owns one and passes it to `MarkdownEditor`'s
  `uploader`; the Attachments section owns another, for files attached to no text.
- **Before presign**, `lib/files.ts` hashes the file with `crypto.subtle.digest` and reads
  an image's size with `createImageBitmap`; the size check (100 MB) runs first so an
  oversized file never gets read. The PUT sends every `upload_headers` entry and is the
  one `XMLHttpRequest` in the app, because `fetch` reports no upload progress.
- **Placeholders are URLs.** The editor inserts each file under a placeholder URL — the
  local blob URL for an image, `#uploading-<id>` otherwise — and, when the upload ends,
  rewrites whatever carries it: image and link nodes in Visual (one ProseMirror
  transaction), the markdown source in Markdown. Both modes serialise the placeholder, so
  switching mode mid-upload loses nothing. An image is preloaded from its permanent URL
  before the swap, so it never blanks.
- **Drafts** are claimed with `uploader.claimable(text)` — the finished drafts the text
  still links — and `uploader.finish(text)` after a save deletes the rest. The create
  dialog parks finished drafts with the rest of the draft for the full page.
- **`inline` is the server's**, computed against saved text, so every write that changes
  a description or a comment, and every work-item write, invalidates
  `queryKeys.issueAttachments`. An upload's completion also refreshes the organisation,
  whose `storage` drives the banners.
- **Rendered images** read their size from `MarkdownAttachments`, which the issue page
  fills from the attachments list; `renderMarkdown`'s `imageSize` option writes it on the
  `<img>` after sanitising.
- **No storage** (`Organization.storage.configured` false, or one `503
storage.not_configured`, remembered for the session under
  `queryKeys.storageUnavailable`) disables the paperclip with the reason and turns drop,
  paste and _Attach files_ off.

## Storage and bring-your-own bucket

Built in 6c; the product rules are [manual/storage.md](./manual/storage.md), the flow
file-storage.md § Bring your own storage. How the pieces fit:

- **The tab is Org Admins and the Owner only**, like the API. `StorageTab` reads the overview once
  and picks the bucket section from it and `?setup=`: the wizard, a connection that verified once
  (details, _Update key_, _Disconnect_, the migration), a setup left half-way (_Continue setup_,
  _Discard_), or _Connect your own bucket_. Earlier buckets list under it; the file list follows,
  hidden while the wizard is open.
- **The wizard is re-enterable** because its step is the address. `entryStep` opens a saved
  connection where it stopped: `pending` at the browser check, a first check refused on the
  server at the key with the error on the input `last_error` names (`describeCheckError`
  rebuilds the API's sentence from `step.reason`, since the connection carries no message).
  Credentials stay in the page's memory; the secret is never prefilled.
- **The check** is the step-up dialog, then `PUT …/connection` (the server's write, read,
  delete), then `useBrowserCheck`: 8 KB of random bytes PUT with every `upload_headers` entry,
  read back with the signed GET and compared, then `verify`. A network error on either browser
  request is `StorageCheckBlockedError`, drawn as the CORS step failing with the rule to paste
  again and _Try again_; a refusal of the check itself (`storage.*`) closes the dialog and lands
  on the input, while a step-up refusal stays in it. `connect` and `verify` pass `timeoutMs` to
  the client, since the server waits on the customer's bucket.
- **Update key** is the same form with provider, location and bucket fixed; a refusal changes
  nothing and says so. `NEXT_PUBLIC_BYO_ALLOW_ANY_ENDPOINT` (development only, beside the API's
  `BYO_ALLOW_ANY_ENDPOINT`) adds a typed endpoint, for a local RustFS bucket.
- **Deleting from the list** draws the row, the overview's tallies and the Organization's meter
  at once and restores all three on a refusal. While files move, every change in
  `migrated_files` refetches the list, so _Stored in_ follows the move.
- **When the bucket cannot serve** (`available` false), tiles, the list and rendered markdown
  draw a placeholder naming why — `bring_your_own` `failed` is a key being refused, anything
  else a disconnected bucket — and never request the file; the lightbox leaves those images out.
  A failing key turns every upload control off with its reason (`useStorage().blocked`), and
  `ByoFailingBanner` sits above an issue's attachments and on the tab; only admins get _Update
  key_ and the bucket's name. While the organisation's own bucket is verified the quota banners
  stay away and the dashboard meter reads _Your own bucket_.

## Import, export and tags

Built in 6d; the product rules are [manual/import-export.md](./manual/import-export.md) and
[manual/tags.md](./manual/tags.md), the flow file-storage.md § CSV imports. How the pieces fit:

- **Import is a page, its jobs are not.** `/projects/PROJ/import` holds the flow and *Recent
  imports*. A job has only an internal id, which never goes in a route, so a row of the list opens
  in place: progress while it runs, the failed rows once done, *Map the columns* for an upload never
  started (it calls `…/complete` again and the flow picks it up). The entry points are the issue
  list's upload arrow and the first empty state's *Import from CSV*, both for `canAdmin` only.
- **Upload** is the attachment path without an attachment: the size check against
  `CSV_IMPORT_MAX_BYTES` first, `sha256Base64`, `POST …/imports`, `putUpload` with every
  `upload_headers` entry and a Cancel, then `…/complete`, which reads the file (a longer timeout).
  Refusals of the file (`import.not_utf8`, `too_many_rows`, `too_large`) return to the file step with
  the API's sentence.
- **Mapping** keeps the API's direction, field → header, and draws it per header. A field takes one
  column, so choosing it again moves it. Changing any column sets the dry run aside: *Import N
  issues* appears only for a dry run of the mapping on screen. A started import is followed with
  `useImport` at `POLL.job`; finishing invalidates issues, tags and the agile caches once.
- **Exports** list at `POLL.job` while one is queued or running, else `POLL.admin`. *Export
  organisation* puts the answer first in the list by id; when the id was already there (one pending
  per organisation) the tab says so. **Download** is a plain link to `download_url` on the API's
  origin (`exportDownloadHref`), because the API answers with a 302 to a presigned URL and only a
  navigation follows it with the session cookie.
- **Tags** read `GET /v1/tags/manage` (one page of 200, alphabetical; search narrows past that).
  Rename, recolour, merge and delete are drawn early with `optimisticList` under `['tags', 'manage']`
  and settle by invalidating tags, issues, articles and saved views, which all show tag names. The
  dialogs mount per opening, keyed by tag, so their state starts from the tag. `409 tag.slug_taken`
  names the existing tag in `valid_values`; Org Admins get *Merge … into …* from it, which opens the
  merge dialog with both filled in. Merge and delete are hidden below Org Admin.

## Removal and shortcuts

Built in 1g; the rules are user-lifecycle.md § Removing someone and ui-conventions.md
§ Keyboard.

- **The removal dialog** asks `GET …/members/{username}/removal` when it opens (never
  cached: `staleTime` 0) and sends the chosen people as the `DELETE`'s query parameters. _Reassign_ offers
  only `reassign_candidates`; with none it starts on _Leave unassigned_. _Transfer to_
  offers every other member. _Remove member_ stays disabled until each chosen option
  has its person. Settling invalidates the organisation, every issue query, saved views
  and projects, because assignees, views and seats all move.
- **Former members in history**: assignee and work-item snapshots are usernames; each
  activity row carries `people`, the API's resolution of them with former members
  included, and the history reads names from there rather than from assignable people.
- **Shortcuts** are `useShortcut` (one key) and `useSequenceShortcut` (`g` then a key,
  within `SEQUENCE_WINDOW_MS`), both in `hooks/use-shortcut.ts` and both ignoring
  typing, open dialogs and menus, and modifiers. `ShellShortcuts` owns `?` and `g`; the
  issue sidebar owns `a` and `s`. A new shortcut goes into `lib/shortcuts.ts` or it is
  missing from the `?` list.

## Sprints, backlog and boards

Built in Phase 3; the product rules are [manual/agile.md](./manual/agile.md) and
ui-conventions.md § Board. How the pieces fit:

- **Routes.** `/projects/PROJ/board` asks for the project's boards and replaces itself with
  the first one's `…/<slug>/current`; `…/board/<slug>` redirects to `current` on the
  server. The short `/board/<slug>/…` reads `GET /v1/boards/{slug}` for the project and
  renders the same `BoardPage` with `base="/board"`, so its sprint picker stays on the short
  form. `current` is passed to the view as it is; the API resolves it.
- **Who sees what** comes from `useProjectRoles`: `canEdit` (Contributor and up) gets the
  grips, card drags and _New card_; `canAdmin` (Project Admin, or an Org Admin) gets the
  sprint buttons and menus, the settings gear and the Boards tab. Observers get the same
  pages without them.
- **One DndContext per page.** The backlog registers one `SortableContext` per container
  (a sprint's slug or `backlog`) plus a droppable for its empty space. Inside one list the
  rows make room themselves; across lists a line shows the landing spot, placed before or
  after the row under the pointer by comparing the dragged row's centre with it. The drop
  becomes `POST …/backlog/move` with `before` or `after` that row, or neither for the
  bottom of an empty list. The board uses plain draggables and one droppable per lane × column;
  cells of other lanes are disabled while a card is held, and a keyboard drag, which has no
  pointer, falls back to the cell the card overlaps most.
- **Optimistic both ways.** `useBacklogMove` pulls the issue out of every cached container of
  the project and splices it in beside its anchor; `useMoveCard` moves the card between cells
  and adjusts the two columns' counts, WIP flags and the strip. Both restore on a refusal and
  then `invalidateAgile`, which refetches sprints (progress), containers and board views.
  Every issue write from elsewhere (sidebar, list, create) calls it too, so a board or
  backlog on screen never shows a stale status or sprint.
- **The filter** is the list's `QueryBar`, committed to `?q=`: on the board it filters the
  cards; on the backlog only the backlog container, defaulting to `#Unresolved` (an absent
  `q`), while sprint sections always load unfiltered.
- **Containers are paged** at the API's 100 with _Load more_; the board is one read of at
  most 500 cards, with a notice when `truncated`.
- **Polling**: board views, containers and project sprints poll at `POLL.list`; the
  dashboard's `GET /v1/sprints?state=active` at `POLL.figures`; boards at `POLL.admin`.
- **Cards edit in place.** `usePatchCard` PATCHes assignees or the due date and draws it on
  every cached board view. Controls on a card, and their popovers (React portals bubble), stop
  `pointerdown`, `keydown` and `dblclick` so they never start a drag or open the modal. The
  keyboard sensor starts on `Space` only, because `↵` opens the card.
- **The issue modal** is `IssuePage` with `variant="modal"` inside a Dialog, driven by
  `?issue=KEY` on the board URL (pushed, so Back closes it). The modal variant shows the key
  with copy and does not rewrite the URL to the issue's slug.
- **Columns follow `column_field`** (status, priority or type): a drop PATCHes that field with
  the column's first value, and a new card is created with it.
- **The strip** is the API's status `distribution` on a status board; on a priority or type
  board `boardDistribution` counts the view's cards (plus `unmapped`) by that field, so no
  second request is made.
- **No running sprint**: `BoardPage` resolves `current` itself (`currentTarget`) once the
  sprints load: the active sprint, else a planned stand-in, else `open`, so the board is
  never blank. The view waits for that answer rather than flashing an empty board.
- **Board settings** send the whole ordered `columns` list on every change
  (`PATCH …/boards/{board}`), drawn early through `useUpdateBoard`'s `optimistic`.

## Custom fields

Built in Phase 4; the product rules are [manual/custom-fields.md](./manual/custom-fields.md), the
shapes `CustomField` and `IssueCustomFieldValue` in `packages/types`. How the pieces fit:

- **Two forms of a value.** An issue lists each field as `IssueCustomFieldValue` (an option is
  `{ name, color }`, a person a `MemberRef`); a request writes the input form (the option's name,
  the username, minutes or `1h 30m`). `inputOf` turns the first into the second, and `entryWith`
  draws the answer early for the optimistic update — except a duration, which only the server
  parses, so the page waits for it.
- **One editor per type** (`FieldEditor`) serves the sidebar, the create form's chips and the
  field dialog's _Default_. A single value calls `onSave`; a multi type calls `onToggle` with the
  running list and its caller saves when the popover closes, as Assignees does. A checkbox has no
  popover: it is a switch in place.
- **Sidebar.** `SidebarCustomFields` reads the issue's `custom_fields` for the rows and
  `GET …/custom-fields` for each field's options and range. A field that is the project's
  Estimation or Spent time is left out there and names the built-in row instead. A select, user or
  date closes on the pick, so a refusal lands under the row; the typed editors stay open and show
  it inside. A markdown row renders its text beside a pencil, never inside a button, because the
  text can hold links.
- **Create form.** `useIssueDraft` keeps chosen values in `fields.custom` by slug — absent takes
  the default, `null` clears it even so — and sends only the fields `fieldsForType` says apply to
  the chosen (or default) type. Missing required fields are checked before the request and
  named under the text.
- **Settings.** Fields reorder by native drag or Alt+↑/↓ with `PATCH { position }`, positions
  counted across archived fields too. A new field's options are local until it is created; an
  existing field's go one request each, and `409 custom_field.option_in_use` reopens the delete
  dialog with where to move them (`DeleteValueDialog`, shared with the value lists). The delete
  confirmation names `issue_count`.
- **List.** A column id is `custom:<slug>` (`lib/issue-list/columns.ts`), the form saved views and
  the CSV use; `columnDefs` appends the custom ones to the built-ins, and a chosen column the list
  cannot draw is skipped rather than dropped. The title keeps 200px; when the columns need more
  than the page, the table scrolls sideways and its header stops sticking. `?group=custom:<slug>`
  is a group choice like any other.
- **Time tracking.** `TimeFields` PATCHes `estimation_field` / `spent_time_field` with a slug or
  `null`. Work item attributes add a picker each beside _Type_ in the spent-time dialog (the work
  type's own picker, renamed), send only set values on create and changed ones on edit, and show
  as outlined letters beside the work type in the Spent time tab.
- **History** names `custom:<slug>` rows by the field's current name and formats each side by its
  type; a deleted field's rows fall back to the slug and the raw values.

## Knowledge base

Built in 3.5; the product rules are [manual/knowledge-base.md](./manual/knowledge-base.md), the visual ones
ui-conventions.md § Knowledge base. How the pieces fit:

- **One layout, one rail.** `app/(app)/projects/[key]/articles/layout.tsx` mounts `KnowledgeBase`, so the rail
  (tree, starred, tags, deleted) stays mounted while the article beside it changes; the pages read the tree,
  the project's `knowledge_base` capabilities and `openNewArticle` from its context. Below `lg` the rail is a
  sheet behind an _Articles_ button.
- **Capabilities, never roles.** _New article_, the starters, the row `+` and the drag grips come from
  `Project.knowledge_base` (`can_create`, `can_move`); everything on an article from `Article.me`. The web
  never checks a role for the knowledge base.
- **The tree** is the API's depth-first list. `lib/articles/tree.ts` hides folded branches, decides a drop
  (top or bottom quarter of a row lands beside it, the middle nests inside), refuses one past three levels
  before sending it, turns it into `PATCH { parent, before | after }` and draws it early; a refusal rolls the
  tree back and shows under the row. The drop is measured against the live pointer and the row's current
  rect, with `pointerWithin`, because the rects dnd-kit takes at drag start drift in the sticky rail. `Alt`
  + `↑/↓/→/←` on a focused title reorders, nests under the sibling above, or moves up a level.
- **Collapse** is `ui.kb_collapsed[PROJ]` in `user_preferences`, a list of folded slugs, drawn at once in the
  cached `Me` and sent with `PATCH /v1/me/preferences`. The open article's ancestors are always unfolded.
- **Search** is the issue list's `QueryBar` with `kind="articles"`, which asks `GET /v1/search/suggest?kind=articles`
  and reads `GET /v1/articles`; the URL holds `q`. With no `q` the list is `sort=updated desc` under
  _Recently updated_. A tag in the rail is a link to `?q=tag: <name>`; the active one clears on a second click.
- **Creating** asks for the title first (the address is made from it and never follows a rename), a starter
  and a place, then `POST`s a draft and opens it with `?edit=1`.
- **Comments** are the issue comment components with a `CommentScope` — `{ issue }` or
  `{ project, article }` — which picks the endpoints and caches in `use-comments.ts`. Files: the body editor
  uploads straight onto the article (`{ project, article }`), an edited comment onto the comment, a new comment
  as drafts claimed with `attachment_ids`.
- **Headings** get ids in `<Markdown onHeadings>`, which reports them for `ArticleToc`; the TOC pins beside the
  article from 1280px and marks the heading last scrolled past in `[data-scroll-root]`.
- **Deleting** asks up front when `child_count > 0`; `400 article.children_choice_required` (children that
  appeared since) turns the same dialog into the question, and the two `403`s show verbatim. Delete toasts
  _Undo_ (`POST …/restore`); restore refusals show on their row in _Deleted articles_.
- **The global search box** (`components/shell/global-search.tsx`) asks `GET /v1/search` 400 ms after typing
  stops and draws the two groups; a group's `error` is its message in place of rows. `↵` opens the highlighted
  row, else the issue list for the text. `/` focuses the page's own query bar when there is one, else this box.
- **Referenced by** on the issue page is `GET /v1/issues/{key}/articles`, hidden while empty; saving an
  article's body invalidates every issue's list.
- **Breadcrumb**: on an article the top bar's crumbs continue with its `path` and title, read from the article
  query the page already holds.

## Reports

Built in Phase 5; the product rules are [reports.md](./reports.md) § As built (web half), the visual ones
ui-conventions.md § Reports. How the pieces fit:

- **One frame, nine bodies.** Each report component reads `useReportState(name)` and `useReport(name, query)`
  and hands both to `ReportFrame`, with its own pickers, display toggles, skeleton shape, a summary sentence and a
  render function for the loaded figures. The frame owns the header and CSV, the query bar, View and Projects,
  and every state: the query bar's own 400, the alert with `valid_values` chips for any other parameter, the
  failure with *Try again*, the skeleton, and the empty state with its widening buttons. A new report is a body;
  it never re-implements a state.
- **The URL is the request.** `lib/reports/url.ts` lists each report's API parameters and defaults;
  `reportQuery` reads them from the address (sorted, so the cache key is stable) and `nextSearch` writes a change,
  dropping defaults. Keys the table does not name (`chart`, `cells`, `zoom`, `issue`) stay in the address and never
  reach the API. The burndown's `sprint=PROJ/<sprint>` is split into `project` and `sprint` there, and the
  timesheet's absent `users` becomes `me`, `*` everyone.
- **No polling.** `useReport` has no interval and keeps the previous figures (`keepPreviousData`), which the frame
  draws at 60 % while the next ones load. The API's cache is per caller with a data version, so a refocus refetch
  is cheap and never stale by more than five minutes.
- **Chart components.** Recharts `responsive` charts at an explicit height (rows × 32 for bar charts), fed rows
  that carry a `MarkPaint`. `chart/chart-parts.tsx` holds what every chart shares: `HatchDefs` (mount inside the
  SVG; cancelled marks fill `url(#report-hatch)`), `Swatch`, `ChartLegend`, `ChartTooltipBody` (value first, a
  line key per row), `CategoryTick` (one-line truncated axis labels) and `durationTicks` (round `1h` / `1d`
  steps from the org calendar). Marks read CSS variables directly (`fill="var(--chart-3)"`), so both themes
  follow the tokens without JavaScript. The matrix's hover, the Gantt and the timesheet are plain HTML and SVG.
- **Period picker** (`period-picker.tsx`): preset rows in the query language's words, with *This week* written as
  no parameter, and a *Custom range* on `MonthGrid` that applies `from` / `to`. The trigger shows the dates the
  API resolved (`scope.period`), so *Last week* reads *Last week 14–20 Sep 2026*.
- **Pickers** are `ReportPicker` (one value, closes on choice) and `ReportMultiPicker` (ticks apply at once, the
  first row clears), both Commands in Popovers with loading rows; the trigger reads `Label Value ▾` at the size of
  the list toolbar's buttons. Field choices reuse the list's `GROUP_LABELS` (`lib/issue-list/groups.ts`) plus the
  groupable custom fields of the projects in scope, merged by slug; there is no organisation-wide field list, so
  `useScopeGroupFields` asks each project in scope.
- **Drill-down** is `listHref(group.query)` everywhere — table labels and counts, bar and slice clicks, matrix cells.
  The timesheet's cells open `useTimesheetWorkItems` with the report's scope, the row's username and the cell's day
  (or the period, for a person's total).
- **Seeding a burndown for review**: snapshots come only from sprint start, finish and the nightly job, so a
  multi-day burndown in the dev database needs rows written into `sprint_snapshots` directly.

## Notifications

Built in 6a; the product rules are [manual/notifications.md](./manual/notifications.md) and
notifications.md, the visual ones ui-conventions.md § Notification centre. How the pieces fit:

- **Every inbox read hangs off `queryKeys.notifications()`**: the paged inbox per filter
  (`useInfiniteQuery` on `next_cursor`), the dashboard's five, each *Show all* list, the unread
  count and the facets. All poll at `POLL.list` (facets at `POLL.admin`).
- **Marking read is drawn early everywhere** (`useMarkRead` with a `MarkTarget` of `one`,
  `entry` or `all`): lines and counts change in every cached inbox, preview and subject list,
  and the unread count drops when an entry empties (for *all* without a kind or project it goes
  to zero, or loses that organisation). The server's `unread` replaces the count; a refusal
  restores every cache; settling refetches.
- **An entry is marked by its subject, in its organisation**: `{ issues: [key], org }` or
  `{ articles: [{ project, slug }], org }` — the preview's ten ids would miss the rest of a long
  entry. A sprint entry stands alone, so its ids are the whole entry. *Show all* asks
  `GET /v1/issues/{key}/notifications?org=` (or the article's), which resolves across the
  reader's organisations whatever the session's current one is.
- **Opening another organisation's entry** (`useOpenNotification`) calls
  `POST /v1/me/current-organization` and then navigates, because the issue page resolves keys
  in the current organisation; in the current one the link is an ordinary link.
- **The project filter** comes from `GET /v1/notifications/facets` — the reader's organisations
  and the projects that have something in the inbox — because a session can list only its
  current organisation's projects. Choosing a project also sets `org`, since keys repeat across
  organisations.
- **Kind names live in `lib/notifications/kinds.ts`**: the filter's twelve choices mapped onto
  API kinds, each kind's row copy on the settings screen, and the phrase the unsubscribe page
  names it by. The settings screen takes areas, options and the *most commonly enabled* marker
  from the API.
- **Preferences** PATCH one kind per change, drawn early; *Turn everything off* sends
  `{ all: 'off' }` and its toast's *Undo* sends the previous choices back as `email`.
- **The unsubscribe page** reads the preview once (`staleTime: Infinity`, no refocus refetch)
  and POSTs only on the button. `/unsubscribe` is an anonymous route in `lib/auth-routes.ts`, so a 401
  elsewhere on the page can never bounce it to sign-in.

## Account security and lifecycle

Built in 6b; the product rules are [manual/account-security.md](./manual/account-security.md), the API's
auth-and-tenancy.md § As built in 6b and § Step-up confirmation. How the pieces fit:

- **Sign-in is two steps on one route.** `signIn` answers `Me` or the 202 `TwoFactorChallenge`; the form keeps
  the challenge in state and swaps to `TwoFactorStep`. The code is six cells drawn over one real input
  (`code-input.tsx`), so paste, the one-time-code autofill and backspace behave natively, and a full code submits
  itself. `two_factor.challenge_expired` — or the challenge's `expires_at` passing on the clock — returns to the
  password step with the message and the email kept; `auth.account_locked` disables the step.
- **One confirmation, `StepUpDialog`.** Turning off two-factor, new recovery codes, deactivating, scheduling a
  deletion and offering ownership all open it: the password, plus a code while two-factor is on. An account
  without a password sends `{}`; on `auth.recent_sign_in_required` the dialog offers its own providers
  (`ReauthButtons`), parking `returnTo` for the OAuth callback — the tab's URL with `&confirm=<action>`, which the
  tab reads to open the same dialog again and then drops from the address.
- **Wrong passwords stay on the form.** The step-up refusals are 401s, so the client signs out only on the
  `unauthorized` code (§ `lib/api/client.ts`).
- **Setup** is inline in the Two-factor section: `POST …/setup`, the QR drawn in the browser from `otpauth_uri`
  with `qrcode.react` on a white tile in both themes (scanners need dark on light), the key in groups of four with
  Copy, then code + password. The recovery codes replace the section until *I’ve saved them*: Copy all, and
  *Download as .txt* through `saveDownload`. Nothing keeps them after that; the API has only hashes.
- **Deactivating** clears the query cache and lands on `/sign-in?deactivated=1`, which says what happened.
  `account.owns_organization` draws the organisations from `valid_values`, each a button that switches the
  session there and opens its Danger zone.
- **Danger zone** is offered to the Owner only. The transfer picker lists `!deactivated && email_verified &&
  !is_owner` members; the pending offer (`GET …/ownership-transfer`, polled at `POLL.admin`) shows with *Cancel
  offer*, drawn early. Deleting asks for the slug typed exactly before the step-up's button enables; the scheduled
  state replaces the button with the date and *Cancel deletion* (no step-up, drawn early).
- **The grace banner** is `DeletionBanner` in the shell, read from `Organization.deletion` on the current
  organisation, so it is on every page of it; only the Owner gets *Cancel deletion*.
- **Deactivated people** keep their real name, greyed with `deactivatedInk`, and a greyscale avatar in
  `MemberAvatar`; `PersonName` does both, and the member lists add `InactiveChip`. Pickers need nothing: the API
  leaves deactivated accounts out of them.
- **`/transfer/<token>`** reads the preview once (`staleTime: Infinity`, no refocus), so an accepted offer does
  not turn into *invalid* on the next focus. `/transfer` is in the client's `AUTH_PATHS`: signed out, the page
  offers sign-in and comes back through `?next=`. *Sign in as someone else* signs out with the same `next`.

## Issue list, saved views and home

Built in 1c; the visual rules are design § 8 and § 8a. How the pieces fit:

- **The URL is the state.** `components/issues/list/list-state.ts` reads `?q=`, `?view=`,
  `?group=` and `?sort=` and writes them back; nothing about the list lives anywhere
  else, so copying the address shares the view. `group` defaults to `status` and
  is written only when it differs (`none` is a value). `sort` is the API's `sort=`
  parameter — a `sort by:` value list — so a column header click never rewrites the
  person's query text.
- **One `IssueList` renders every list.** `/issues` and `/projects/PROJ/issues` pass a
  `project`; `/my-issues` and `/starred` pass a `base` query (`assignee: me #Unresolved`,
  `#Star`) that is ANDed in front of the bar unseen, and turn the view tabs off. A query
  error's `span` is shifted back by the base's length before it is underlined.
- **The query bar runs on Enter**, not per keystroke: a half-typed query is a parse
  error, and each round trip costs a second. `Tab` (or `↵` on an arrowed item) applies a
  suggestion from `GET /v1/search/suggest`, asked for 400 ms after the text last changed at
  the caret position of that change — never on a click or an arrow key, which would cost a
  request per caret move (owner, 24 Sep 2026). Colour is a mirror `<div>` under a
  transparent `<input>`; only the caret and a translucent selection belong to the input, so
  the selected text stays readable through it.
- **Pages are 200 rows**, appended with _Load more_; `meta.groups` and the total come from
  the first page. The table is always virtualised (`@tanstack/react-virtual`) against the
  shell's `<main data-scroll-root>`, so a 2,000-row list costs what a 20-row one does.
  A group whose `category` is done or cancelled starts collapsed.
- **Inline edits go through `useUpdateListedIssue`**: the row changes in every search on
  screen at once, the server's answer replaces it, a refusal rolls it back and toasts.
  Editors mount inside the popover, so a 200-row list makes no schema request until a
  pill is clicked. Whether a row is editable comes from `useProjectRoles`, never from a
  guess about the API's answer.
- **Bulk edit** posts to `/v1/issues/bulk-update` and reads one result per key: a clean
  run is a toast, anything refused opens a dialog listing each key with the API's
  message and keeps those keys selected. Status, priority and type pickers merge the
  selected issues' projects' lists by name.
- **Saved views** are tabs (`view-tabs.tsx`) and sidebar items (`saved-view-nav.tsx`); each
  counts itself with `GET /v1/issues?q=…&limit=1` (`pagination.total`), scoped to the project
  on a project list. Clicking a tab writes the view's query, name and sort into the URL;
  typing past the view's query drops `?view=` on the next Enter. The tab's menu (only
  when `can_edit`) saves the current query into the view, renames or re-shares it, or
  deletes it behind a `ConfirmDialog`, because a shared view's deletion reaches other people.
- **Columns** are a per-viewer `localStorage` choice (`use-visible-columns.ts`) unless the
  active view carries its own, in which case the menu explains rather than edits. The CSV
  export sends the visible columns' names plus key, title, priority and type.
- **Dashboards** are figures from `GET /v1/issues/figures` (`per=project` for the cards and
  for My work's _across N projects_), short lists from `GET /v1/issues?limit=`, and every
  number is a `listHref()` to the query that produced it (`lib/issue-list/links.ts`).
  Role decides the composition (`useProjectRoles().isAdmin`); organisation-level pieces
  (the audit feed, limits, _New project_ here and in the sidebar) go by `orgAdmin`, never
  `isAdmin`. My work's rail shows the inbox's newest five entries (6a). Active sprints come
  from `GET /v1/sprints?state=active` (Phase 3). Assigned to me is one
  `group_by=due&group_limit=10` search; Logged this week is `GET /v1/issues/figures` with no
  query. A section tells _failed_ from _empty_ with `isError && !data`, and keeps stale data
  under a notice when only a refresh failed (`SectionError`, `StaleNotice`).
- **The landing** (`/`) asks `GET /v1/me/landing` once per visit and either navigates or
  renders the organisation chooser / no-organisation state, or sends an account that never
  joined an organisation to `/welcome`. Sign-in with no `?next=` and the signed-in bounce
  from the auth pages both go to `/`, so the server's answer is what a returning user meets. Every project page records the visit with
  `useRecordProjectVisit`; the issue page records itself in `useRecentlyViewed`, and signing out or deactivating calls
  `clearRecentlyViewed()`, which removes every account's list from the browser.

## Page width

Pages are **fluid**: the shell gives content 24px side padding and nothing
else, so collapsing the sidebar hands every pixel to the page, at any viewport.
Do not add `max-w-*` or `mx-auto` around a page. The
only width cap is the 72ch prose column inside rendered markdown.

## Loading states

Two kinds, and the choice is not a matter of taste
([frontend.md](./frontend.md#rules) rule 7):

| Situation                                                                                   | Component                                                                                            | Why                                                |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| The signed-in shell is booting: session unknown, so no navigation, no organisation, no user | `<FullPageLoader>` via the session gate in `components/shell/app-shell.tsx`                          | Nothing on screen has a shape to skeleton yet      |
| Anything after that — a route change, a list, a panel, a row, a stat                        | `<PageSkeleton>` / `<RowsSkeleton>` / `<TextSkeleton>` or a bespoke skeleton shaped like the content | The layout is known; keep it stable and fill it in |

`app/(app)/loading.tsx` is the default route skeleton; a page with a distinct
shape adds its own `loading.tsx` beside it. Inside a component, branch on the
hook's `isPending` and render the skeleton in the same slot the content will
occupy. Never a spinner, never a blank.

`useSession()` drives the gate. It calls `GET /v1/me` once per five minutes;
`401` triggers the client's sign-in redirect and a network failure shows the
retry screen.

**`proxy.ts` routes on the session cookie's presence, before any page renders.** No cookie on
a route that needs one → `/sign-in?next=<here>`; a cookie on `/sign-in` or `/sign-up` → the
`?next=` path, else `/`. It never calls the API, so the auth pages make no `GET /v1/me` at
all. Whether the session is still alive stays the API's answer: any request carrying a dead
`sid` gets it cleared in the response, so a stale cookie costs one bounce to sign-in and
cannot loop. The route lists live in `lib/auth-routes.ts`. This needs the web app to see the
API's cookie: the same host, or `SESSION_COOKIE_DOMAIN` covering both (infrastructure.md).

## Adding a page, step by step

Worked example: the project list at `/projects`.

1. **Resource**: `lib/api/projects.ts` with `listProjects()`. Type from
   `@nothingleft/types` — add it there first if it is missing.
2. **Keys**: `queryKeys.projects()` in `lib/query/keys.ts`.
3. **Hook**: `hooks/use-projects.ts` → `useQuery({ queryKey, queryFn })`.
4. **Components**: `components/projects/project-card.tsx` etc. Skeletons
   shaped like the content while loading, an `EmptyState` naming the action
   when empty, `<RelativeTime>` for timestamps, `<LetterBadge>` /
   `<IssueKey>` for the dense bits.
5. **Route**: `app/(app)/projects/page.tsx` with `metadata`, composing the
   components. Reads `permissions.md` to decide what to hide: an Observer
   never sees the _New project_ button.
6. **Sidebar / shortcuts**: add the nav item to `components/shell/sidebar.tsx`
   and the key to the shortcuts page if it has one.
7. `bun run lint && bun run typecheck`, then the affected manual page.

Adding a **shadcn primitive**: `bunx shadcn@latest add <name>`, then the
`cn` import fix above. Adding a **design-system component**: one file in
`components/`, styled with the utilities above, never a raw colour.

## Not allowed

| Temptation                                                                  | Do instead                                                                                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch(` anywhere but `lib/api/client.ts`                                   | A resource function in `lib/api/` (`nothingleft/no-http-client` fails otherwise)                                                                                     |
| A component importing `lib/api`                                             | A hook in `hooks/`                                                                                                                                                   |
| `new Date().toLocaleDateString()`, `Intl.DateTimeFormat`, `date-fns/format` | `lib/datetime` (`nothingleft/no-date-formatting` fails otherwise)                                                                                                    |
| `type Me = {...}` in `lib/api/`                                             | Add the DTO to `packages/types` and import it                                                                                                                        |
| A duration, slug or issue-key parser written here                           | `@nothingleft/format`                                                                                                                                                |
| `<select>`, `<input type="date">`, `alert()`, `confirm()`                   | shadcn Select / Command / Calendar in a Popover / Dialog (`nothingleft/no-native-controls` fails otherwise)                                                          |
| `<DialogContent className="max-w-lg">`                                      | `sm:max-w-lg`. A bare `max-w-*` replaces the shadcn phone guard `max-w-[calc(100%-2rem)]` through `cn()`, and the dialog runs off a 400px screen                     |
| `{formatDuration(m, calendar)}` in JSX                                      | `<Duration minutes={m} calendar={calendar} />`, which sets the mono face                                                                                             |
| `required` / `minLength` / `pattern` on an input                            | `noValidate` on the form and validate with the Zod schema from `packages/types`; the browser's bubble is a native control too                                        |
| `text-[#ff6600]`, `bg-[oklch(…)]`                                           | A token utility from the table above                                                                                                                                 |
| `text-text-muted` on a paragraph                                            | `text-text-secondary`. Muted is 3.97:1 on `--bg-app` in dark, 3.16:1 in light — under AA. It is for a timestamp or an empty-value label, not for prose (design § 8d) |
| `focus:ring-*` on a component                                               | Nothing: `:focus-visible` in `globals.css` declares the one ring (design § 3.2)                                                                                      |
| `dangerouslySetInnerHTML`, `innerHTML =`                                    | Only inside `components/markdown/` (`nothingleft/no-inner-html` fails otherwise)                                                                                     |
| A spinner                                                                   | A skeleton shaped like the content; `<FullPageLoader>` only at shell boot                                                                                            |
| Editing between the `tokens:start` / `tokens:end` markers                   | `design/tokens.css`, then `bun run tokens:sync`                                                                                                                      |
| An empty panel                                                              | `<EmptyState>` naming the action                                                                                                                                     |
| Editing `components/ui/*` by hand                                           | Wrap it, or re-add with `--overwrite`                                                                                                                                |
| Relative `../../` imports                                                   | The aliases above                                                                                                                                                    |
| A README next to code                                                       | Extend this document                                                                                                                                                 |
| Tests in `apps/web`                                                         | None by decision; put logic that needs tests in a package                                                                                                            |
