# Data Model

PostgreSQL 15+, plain SQL, no provider-specific features. Drizzle ORM emits
standard migrations.

## Conventions

- **Surrogate entity keys are `bigint GENERATED ALWAYS AS IDENTITY`.** Eight
  bytes rather than sixteen, on every primary key, every foreign key and every
  index they appear in — which is where the saving compounds, through index
  size and cache pressure. Sequential, so insert locality is perfect and
  there is no application-side generation to get wrong.
- **Tables that are not entities have natural keys.** A junction
  (`issue_tags`, `project_members`, `work_item_values`) has a composite primary
  key made of the keys it joins; a table that extends one parent
  (`user_preferences`, `org_storage_configs`) takes that parent's key. Neither
  gets an identity column.
- **`attachments.public_id` is a secondary identifier, not a primary key**: a
  random `uuid` used in file URLs, beside the attachment's identity key. See
  [Attachments](#attachments) for why that one is not a sequential integer,
  and why it is v4 rather than v7. A few columns that are not keys are also
  `uuid`, such as `issue_activity.change_group_id`.
- Instants: `timestamptz`, always UTC. Converted for display only.
- **Calendar dates** (`due_date`, `start_date`, `work_date`): plain `date`.
  Never timezone-converted — a due date of 19 Sep must read as 19 Sep for
  every user on earth. Getting this wrong is the most common date bug in
  project management tools.
- Durations: `integer` minutes.
- **Identity values are JSON numbers.** Identity columns are SQL `bigint`, but
  the API and the TypeScript types carry them as JavaScript numbers, which are
  exact only below 2^53 (9,007,199,254,740,992). The supported range is
  therefore that, not the full 64-bit range. Imports and integrations never
  assign identity values (columns are `GENERATED ALWAYS`); a future need for
  larger ids is a string boundary in `packages/types`, decided then.
- **Columns are `NOT NULL` unless the definition marks them `NULL`.**
  `created_at` and `updated_at` default to `now()`.
- **Enums are `text` with a `CHECK`**, never PostgreSQL `enum` types.
  Drizzle's `pgEnum` can only append values; renaming or removing one is DDL
  surgery on a type every dependent column shares. A `CHECK` is edited in one
  migration.
- Foreign keys are `ON DELETE CASCADE` from an organisation or project to the
  rows it owns, and `ON DELETE RESTRICT` to `users`. Keys from issues and
  work items to the configuration rows they point at (statuses, priorities,
  types, work types), and `issues.parent_id`, are declared `NO ACTION`: it
  refuses the same deletes as `RESTRICT`, but is checked at the end of the
  statement, so deleting a project can cascade through its statuses and its
  issues together (decided 24 Sep 2026). Anything else is stated on the
  table.
- **Identifiers people type are matched case-insensitively** — email,
  username, article slug. Stored exactly as typed, unique on the folded form
  (`lower()`).
- **Tag slugs are canonicalised when written**: the service slugifies the name
  to lower-case ASCII before insert, so the stored value is already folded and
  the ordinary `UNIQUE (org_id, slug)` is unique as stored. There is no
  `lower(slug)` key on tags, and nothing outside the service may write a tag
  slug.
- IP addresses are `inet`. Hashes — session tokens, PATs, recovery codes,
  one-time tokens, attachment checksums — are `bytea`: 32 raw bytes rather
  than 64 hex characters, with no case or encoding ambiguity.
- Soft delete: `deleted_at` on `issues`, `comments`, `articles` and
  `attachments` (a soft-deleted article is restorable for 14 days too); `removed_at` on `org_members`; `revoked_at` on invitations
  and tokens. Everything else is hard-deleted. A soft-deleted issue is
  restorable for **14 days**, then `issues.purge` hard-deletes it with its
  comments, work items, attachments and activity (see [Retention](#retention)).
- Every tenant-owned table carries `org_id`, even when reachable through a
  parent, so isolation is enforceable in one place — see
  [Tenancy integrity](#tenancy-integrity) for what makes the column
  trustworthy.
- **Text fields are `text`.** PostgreSQL imposes no declared length limit and
  transparently compresses and moves large values out of line via TOAST. The
  MySQL-style "split long text into a child row" pattern is unnecessary here.

## Index policy

**The schema ships with UNIQUE indexes only.**

Unique indexes are correctness constraints, so they are present from day one.
That includes partial (`WHERE deleted_at IS NULL`) and functional
(`lower(email)`) unique indexes — they enforce correctness in exactly the
same way. Every other index waits for evidence.

The reasoning: an index added speculatively at schema time prevents the query
it covers from ever appearing in the slow-query log, so the real access
patterns stay invisible. Reshaping indexes later under production load is
expensive. It is cheaper to run without them, collect one or two months of
real data, and then index exactly what the evidence demands.

To make that work, the evidence has to be collected from the first day:

- `pg_stat_statements` enabled.
- `log_min_duration_statement = 200ms`.

**One exception**, stated explicitly so it is a decision rather than an
oversight: the **GIN indexes on `issues.search_tsv` and `articles.search_tsv`**. That is not an
optimisation, it is the mechanism. `search_tsv` is a stored generated column,
so the vector is computed once at write, not per query; without the GIN index,
though, a search can only scan every row's stored vector, which is unusable at
even a few thousand issues. There is exactly one query shape that
uses it, so there is nothing to discover later. `articles.search_tsv` is the
same mechanism over the knowledge base.

## Tenancy integrity

`org_id` on every tenant-owned table is only as trustworthy as the write that
set it. Nothing in the schema as described stops a service-layer bug from
filing an ORG1 issue against an ORG2 project:

```sql
-- both foreign keys resolve; the row is now filed under the wrong tenant
INSERT INTO issues (org_id, project_id, …) VALUES (<ORG1>, <ORG2's project>, …);
```

The query is not the problem — `WHERE org_id = <ORG1>` does exactly what it
says, and faithfully returns a row that should not exist. An unscoped project
lookup, a stale cached id, a bulk move or a CSV import is enough to produce
it, and the tenant-isolation tests catch it only if a test happens to
exercise that path.

A composite foreign key makes the row unwritable:

```sql
ALTER TABLE projects ADD UNIQUE (id, org_id);
ALTER TABLE issues   ADD FOREIGN KEY (project_id, org_id)
                         REFERENCES projects (id, org_id);
```

The same pattern runs down from `issues`: `comments`, `issue_assignees`,
`issue_links`, `work_items`, `issue_field_values` and `attachments` all carry
`org_id` and reference `issues (id, org_id)`.

Two more, for hierarchy rather than tenancy — a parent must live in the same
project as its child:

```sql
ALTER TABLE issues   ADD UNIQUE (id, project_id);
ALTER TABLE issues   ADD FOREIGN KEY (parent_id, project_id)
                         REFERENCES issues (id, project_id);
ALTER TABLE articles ADD UNIQUE (id, project_id);
ALTER TABLE articles ADD FOREIGN KEY (parent_id, project_id)
                         REFERENCES articles (id, project_id);
```

The full list of these integrity keys:

| Table | Extra UNIQUE | Composite foreign keys |
|---|---|---|
| `projects` | `(id, org_id)` | `(estimation_field_id, id)`, `(spent_time_field_id, id)` → `custom_fields (id, project_id)` |
| `project_members`, `invitations`, `import_jobs` | — | `(project_id, org_id)` → `projects` |
| `workflow_statuses`, `priorities`, `issue_types` | `(id, project_id)` | `(project_id, org_id)` → `projects` |
| `work_types` | `(id, org_id)`, `(id, project_id)` | `(project_id, org_id)` → `projects` |
| `issues` | `(id, org_id)`, `(id, project_id)` | `(project_id, org_id)` → `projects`; `(status_id, project_id)`, `(priority_id, project_id)`, `(type_id, project_id)` → the value tables, so a value from another project is unwritable; `(parent_id, project_id)` → `issues`; `(sprint_id, project_id)` → `sprints` |
| `sprints`, `boards` | `(id, org_id)`, `(id, project_id)` | `(project_id, org_id)` → `projects` |
| `board_columns` | `(id, board_id)` | `(board_id, org_id)` → `boards` |
| `board_column_values`, `board_swimlane_types` | — | `(project_id, org_id)` → `projects`; the rest in [Agile](#agile) |
| `sprint_snapshots` | — | `(sprint_id, org_id)` → `sprints` |
| `tags` | `(id, org_id)` | — |
| `comments` | `(id, org_id)` | `(issue_id, org_id)` → `issues` |
| `work_items` | `(id, org_id)`, `(id, project_id)` | `(issue_id, org_id)` and `(issue_id, project_id)` → `issues`; `(work_type_id, project_id)` → `work_types` |
| `issue_assignees`, `issue_stars`, `issue_votes`, `issue_watchers`, `issue_tags`, `issue_activity`, `mentions` | — | `(issue_id, org_id)` → `issues`; `issue_tags` also `(tag_id, org_id)` → `tags` |
| `issue_links` | — | `(from_issue_id, org_id)` and `(to_issue_id, org_id)` → `issues` |
| `comment_reactions` | — | `(comment_id, org_id)` → `comments` |
| `attachments` | — | `(issue_id, org_id)`, `(comment_id, org_id)`, `(work_item_id, org_id)` |
| `saved_views` | — | `(project_id, org_id)` → `projects` |
| `custom_fields` | `(id, org_id)`, `(id, project_id)` | `(project_id, org_id)` → `projects` |
| `custom_field_applies_to`, `custom_field_options`, `issue_field_values` | options `(id, field_id)` | `custom_field_applies_to` `(project_id, org_id)` → `projects`; the rest in [`custom_fields`](#custom_fields) |
| `work_item_attributes` | `(id, org_id)`, `(id, project_id)` | `(project_id, org_id)` → `projects` |
| `work_item_attribute_values`, `work_item_values` | values `(id, attribute_id)` | see [`work_items`](#work_items) |
| `articles` | `(id, org_id)`, `(id, project_id)` | `(project_id, org_id)` → `projects`; `(parent_id, project_id)` → `articles` |
| `article_tags`, `article_stars`, `article_watchers`, `article_issue_refs` | — | `(article_id, org_id)` → `articles`; `article_tags` also `(tag_id, org_id)` → `tags` |
| `comments`, `mentions`, `attachments` | — | `(article_id, org_id)` → `articles` |
| `notifications` | `(user_id, dedupe_key)` | `(project_id, org_id)` → `projects`, `(issue_id, org_id)` → `issues`, `(comment_id, org_id)` → `comments`, `(article_id, org_id)` → `articles`, `(sprint_id, org_id)` → `sprints` |
| `personal_access_token_projects` | — | `(project_id, org_id)` → `projects` |
| `org_storage_locations` | `(id, org_id)` | — |
| `attachments`, `org_storage_configs` | — | `(storage_location_id, org_id)` and `(location_id, org_id)` → `org_storage_locations` |
| `git_connections` | `(id, org_id)` | — |
| `git_repositories` | `(id, org_id)` | `(connection_id, org_id)` → `git_connections` |
| `project_repositories` | — | `(project_id, org_id)` → `projects`; `(repository_id, org_id)` → `git_repositories` |
| `git_webhook_events` | — | `(connection_id, org_id)` → `git_connections`; `(repository_id, org_id)` → `git_repositories` |
| `git_branches`, `git_commits`, `git_pull_requests` | `(id, org_id)` | `(repository_id, org_id)` → `git_repositories` |
| `git_checks` | — | `(repository_id, org_id)` → `git_repositories` |
| `git_pull_request_commits` | — | `(pull_request_id, org_id)` → `git_pull_requests`; `(commit_id, org_id)` → `git_commits` |
| `issue_git_links` | — | `(issue_id, org_id)` → `issues`; `(repository_id, org_id)` → `git_repositories` |

Every one cascades on delete, except the value-table, parent and sprint keys on
`issues`, the parent key on `articles`, the work-type key on `work_items`, the option key on `issue_field_values`, the
value key on `work_item_values` and the two time-field keys on `projects`, which are
`NO ACTION` (see Conventions), and the location keys, which are `RESTRICT` on `attachments` and
`NO ACTION` on `org_storage_configs`. Enum columns are `text` + `CHECK` generated from the constant
lists in `packages/types`, so a CHECK and its TypeScript union cannot drift.

The cost is one redundant unique index per parent table. They are unique
indexes, so the index policy permits them, and they move a class of
cross-tenant bug from *tested for* to *impossible*.

## Full-text search

Two choices are frozen into every stored `tsvector` and cannot be changed
later without rewriting the table:

**Configuration: `english`.** Stemming means `login` matches `logins` and
`logged in`. That is worth more than exact-token matching on code
identifiers, because issue keys, filenames and usernames are matched by their
own attributes rather than by free text.

**Weights: A = title, B = description.** A title hit ranks above a body hit.

**Comment bodies are not indexed.** `search_tsv` covers title and description
only. Everything it indexes therefore lives on the same row, which is what
allows it to be a `GENERATED ALWAYS … STORED` column: always correct, no
refresh job, and no window in which an issue someone just saved cannot be
found. Free text over comment bodies falls back to a `LIKE '%…%'` scan —
slower, unranked, unable to use an index, and adequate at this scale. If it
ever is not, `pg_trgm` is the answer, on evidence. `commenter:` is
unaffected: it is a join, not a text match.

Articles are the same shape, over title and `body_md`.

## Size limits

| Field | Soft warning | Hard limit |
|---|---|---|
| Issue description | 64KB | 256KB |
| Comment body | 64KB | 256KB |
| Article body | 64KB | 256KB |
| Work item note | — | 16KB |
| Sprint goal | — | 16KB |
| Title (issue or article) | — | 500 chars |

These are product limits, not storage limits. They exist for two reasons:

1. **`tsvector` has a hard 1MB ceiling.** A value above it fails to index,
   making the issue findable by nothing. The cap keeps everything well clear.
2. **Token cost.** A 500KB description returned by an MCP `get_issue` call
   destroys an agent's context window. This is the constraint that actually
   matters for this product, and it is why `get_issue` truncates with a
   marker and offers paged retrieval — see [mcp.md](./mcp.md).

---

## Identity and organisation

### `users`

See [auth-and-tenancy.md](./auth-and-tenancy.md) for the full definition and
the OAuth email-verification rule.

```
users(id, email, email_verified_at NULL, name,
      avatar_url NULL,          -- resolved external URL: provider or Gravatar; NULL renders the generated mark
      avatar_object_key NULL,   -- a manual upload in the public bucket; wins over avatar_url
      password_hash NULL, google_id NULL UNIQUE, github_id NULL UNIQUE,
      timezone default 'UTC', country_code char(2) NULL, last_login_at NULL, last_login_ip inet NULL,
      totp_secret_ciphertext NULL, totp_enabled_at NULL,
      totp_last_used_step bigint NULL,   -- the last TOTP step accepted
      deactivated_at NULL, deleted_at NULL,
      created_at, updated_at,
      UNIQUE (lower(email)))
```

**There is no `username` column.** Usernames are per-organisation and live on
`org_members` — see [user-lifecycle.md](./user-lifecycle.md).

**Two avatar columns**, because the chain in
[file-storage.md § Avatars](./file-storage.md#avatars) has one input a user
controls and one the system resolves. `avatar_object_key` is set only by an
upload and cleared by "remove photo". Its value is
`web/avatar/{user_id}/{uuid}.{ext}`, and the upload completes only for the user the key
names ([file-storage.md § Avatars](./file-storage.md#avatars)); a key from before 1 Oct 2026
has no user segment. `avatar_url` is resolved once at
account creation and on each OAuth login — provider URL if present, else
Gravatar if the address has one, else NULL — so a render never has to probe
Gravatar. The DTO exposes a single `avatar_url`, computed as the object key's
public URL when present, otherwise the stored URL, otherwise the API's generated
initials mark for the current name.

**Email is unique case-insensitively**, on `lower(email)` rather than on
`email`. Without that, `Foo@example.com` and `foo@example.com` become two
accounts, and the "link an OAuth login only to a verified email" rule in
[auth-and-tenancy.md](./auth-and-tenancy.md) silently creates a second
account instead of linking to the first — the exact failure that rule exists
to prevent.

`country_code` is `char(2)`, `last_login_ip` is `inet`.

`google_id` and `github_id` are not the lookup key — email is. They exist for
one specific failure: a user who signs up with `foo@gmail.com` via Google and
later changes their Google account's primary email. Matching on email alone
would miss them and silently create a second account, stranding their
history. The provider ID is stable across that change. `UNIQUE` prevents two
accounts claiming the same provider identity.

**`users` rows are never hard-deleted**, so every foreign key resolves
forever and attribution on old issues never degrades. `deactivated_at` and
`deleted_at` express the two terminal states. `deleted_at` is the one soft-delete column name everywhere; on `users` it means erased.

### Two-factor authentication

```
users(…, totp_secret_ciphertext NULL, totp_enabled_at NULL)

totp_recovery_codes(id, user_id, code_hash bytea, used_at NULL, created_at)
```

TOTP only — Google Authenticator, 1Password, Authy and every other standard
app. The secret is encrypted with AES-256-GCM under
`ENCRYPTION_MASTER_KEY`, never returned by any API after setup.

**Applies to password sign-in only.** A Google or GitHub sign-in skips the
second factor, because the provider already enforces its own. See
[auth-and-tenancy.md](./auth-and-tenancy.md) for the reasoning and the
trade-off that implies.

**Recovery codes are mandatory, not optional.** Ten single-use codes,
generated at setup, shown once, stored hashed. Without them, a lost phone
locks a user out permanently and there is no support team to appeal to.

**As built in 6b** (27 Sep 2026):

```
users(…, totp_secret_ciphertext NULL,   -- 'v1.<iv>.<ciphertext>.<tag>', base64url
         totp_enabled_at NULL,          -- null with a ciphertext = setup pending, not yet confirmed
         totp_last_used_step NULL)      -- bigint: a code at or before this 30-second step is a replay

totp_recovery_codes(
  id, user_id → users RESTRICT,
  code_hash bytea,          -- SHA-256 of the code, lower-cased, dashes and spaces removed
  used_at NULL, created_at,
  UNIQUE (user_id, code_hash)
)
```

- **The secret** is sealed with AES-256-GCM under a subkey HKDF-derived from
  `ENCRYPTION_MASTER_KEY` for the purpose `totp`, with a fresh 12-byte IV on every seal and the
  row (`users:<id>`) as additional data, so a ciphertext copied onto another row does not open.
  The `v1` prefix is the key version; there is no rotation in v1.
- **`totp_last_used_step`** is claimed with one conditional `UPDATE … WHERE step < $n`, so two
  requests racing with the same code cannot both succeed.
- **Recovery codes** are ten `xxxxx-xxxxx` codes from a Crockford base32 alphabet (50 bits
  each). `UNIQUE (user_id, code_hash)` is the lookup and the correctness constraint at once, so
  the index policy allows it. Replacing the codes (disable, regenerate) deletes the **unused**
  rows; used rows stay as the record of each use.

### `one_time_tokens`

Password reset, email verification, email change and ownership transfer are
one shape: a hashed single-use token with an expiry, consumed once and then
purged. They share one table rather than occupying four.

```
one_time_tokens(
  id, user_id → users,                -- who the token is for
  purpose: 'password_reset' | 'email_verify' | 'email_change'
         | 'ownership_transfer',
  token_hash   bytea,                 -- SHA-256; the raw token is never stored
  org_id       → organizations NULL,  -- ownership_transfer only
  new_email    text NULL,             -- email_change only
  created_by   → users NULL,          -- ownership_transfer: the current owner
  expires_at, used_at NULL, created_at,
  UNIQUE (token_hash),
  UNIQUE (org_id) WHERE purpose = 'ownership_transfer' AND used_at IS NULL,
  CHECK (purpose <> 'ownership_transfer' OR (org_id IS NOT NULL AND created_by IS NOT NULL)),
  CHECK (purpose <> 'email_change' OR new_email IS NOT NULL)
)
```

**Not a WordPress-style key/value meta table.** All four purposes have
identical structure, so one typed table keeps `NOT NULL`, the foreign key to
`users` and an expiry that can be selected on. A key/value shape loses all
three and turns every read into "fetch several rows and reassemble them".

Expiries: password reset 1 hour, email verification and email change 24
hours, ownership transfer 7 days. Rows are deleted after expiry by
`tokens.gc`.

**Ownership transfer** (6b): `user_id` is the proposed owner, `created_by` the Owner who
offered it, `org_id` the organisation. One live transfer per organisation: a partial UNIQUE
key, so a second unused transfer row is unwritable — an expired unused row still
counts until the next offer or `tokens.gc` deletes it; a new offer, a
cancel, a decline, scheduling the deletion and the organisation's deletion all delete the
unused row; accepting consumes it. Deactivating an account deletes every unused token it holds
or offered. Offering, cancelling and accepting each lock the organisation row first and re-read
its Owner inside that transaction, so two offers cannot both stand and an acceptance whose
offerer is no longer the Owner is refused (`ownership_transfer.invalid`).

`email_change` holds the new address in `new_email` and only moves it onto
`users.email` when the token is consumed, so an unconfirmed address never
occupies the unique index.

### `organizations`

```
organizations(
  id, name, slug UNIQUE, owner_user_id → users,
  plan: 'free' | 'pro' | 'pro_lite' | 'unlimited'  default 'free',  -- limits per plan in limits-and-billing.md
  storage_used_bytes    bigint default 0,
  storage_notice_level  smallint default 0 CHECK IN (0, 95, 100),  -- which storage email already went out
  workday_minutes       int default 480,   -- 1d when parsing "1d 4h"
  workweek_days         int default 5,     -- 1w when parsing "1w"
  week_starts_on        smallint default 1, -- 0=Sunday … 6=Saturday; 1=Monday
  deletion_scheduled_at timestamptz NULL,   -- deletion requested, grace period running
  deletion_reminder_sent_at timestamptz NULL, -- the one-day reminder went out
  deleted_at            timestamptz NULL,
  created_at, updated_at,
  CHECK (workday_minutes BETWEEN 1 AND 1440), CHECK (workweek_days BETWEEN 1 AND 7),
  CHECK (week_starts_on BETWEEN 0 AND 6), CHECK (storage_used_bytes >= 0)
)
```

`workday_minutes` and `workweek_days` are what make `1w 1d 1h 1m` parse
correctly for a given organisation.

`storage_used_bytes` counts completed, undeleted attachments in the platform's private
bucket — never a file in the organisation's own bucket (6c); it moves in the same
transaction as the attachment row (upload completion, delete, the sweep, the purge, and the
migration moving a file out), and the nightly `storage.reconcile` recomputes it from the
rows and corrects any drift. `storage_notice_level` (25 Sep 2026) makes each
storage email go out once: set to `95` when a completion crosses 95% of the quota, to
`100` on the first refused upload, and back to `0` whenever a release leaves usage under
95%, so a later refill warns again ([limits-and-billing.md § Storage](./limits-and-billing.md#storage)).

**Slug** (decided 23 Sep 2026): 2–48 characters of `a-z 0-9 -`, no leading,
trailing or doubled hyphen, globally unique and editable in settings. Derived
from the name when not supplied (`Acme Corporation` → `acme-corporation`),
with `-2`, `-3`… on collision; a name that yields fewer than two characters
makes the user choose one. `parseOrganizationSlug` and
`generateOrganizationSlug` in `packages/format` are the one implementation.
The web routes carry no organisation segment, so the slug appears only in
`/v1/organizations/{slug}/…`, `X-Organization` and the org switcher.

Deleting an organisation is two steps. `deletion_scheduled_at` is stamped and
every Org Admin is emailed; the Org Owner can cancel from settings at any
point during the **14-day grace period**, which clears the timestamp and
emails again; a reminder goes out one day before the deadline; then
`org.delete` deletes the organisation's rows and objects and stamps
`deleted_at`. The row itself is retained, so `org_activity` and attribution
outlive the organisation. Objects in a customer's own bucket are never
touched (file-storage.md).

**As built in 6b** (27 Sep 2026):

- `deletion_reminder_sent_at` is claimed by the hourly `org.deletion_reminder` once the
  deadline is within a day, so the reminder goes out exactly once; cancelling clears it with
  `deletion_scheduled_at`. `deletion_scheduled_at` stays set after the deletion.
- `org.delete` (hourly) takes every organisation whose `deletion_scheduled_at` is 14 days old,
  in this order: (1) one transaction stamps `deleted_at` — every lookup already filters on it,
  so nobody reaches the organisation or uploads into it from here — and deletes its pending
  ownership transfer; then every session whose `current_org_id` points at it forgets it
  (and leaves the Redis cache), and every PAT confined to its projects is revoked;
  (2) attachments in batches of 500: a `platform` row's object is deleted, then the row; a
  `byo` row is deleted and its object never touched; (3) one transaction deletes its projects
  (cascading through everything project-scoped), then its remaining attachments,
  notifications, digests, mentions, comments, tags, saved views, recent searches,
  invitations, one-time tokens and, last, `org_members`. `storage_used_bytes` goes to 0.
- **Resuming.** A run that fails part-way leaves the organisation stamped with members left;
  the next run picks up every organisation past its deadline that is unstamped **or** still has
  `org_members` rows, and carries on.
- **The slug stays reserved forever** (owner, 27 Sep 2026): the plain `UNIQUE (slug)` covers
  deleted rows, and a new organisation is refused `organization.slug_taken`, so a script or an
  `X-Organization` header naming it never reaches a stranger's organisation.

`week_starts_on` is needed by four separate things, so it belongs here rather
than being hardcoded: `{This week}` and `{Last week}` in the search query
language, week columns in the Timesheet report, weekly buckets in Burndown,
and default sprint start dates. Default is Monday, per ISO-8601.

### `org_members`

```
org_members(
  org_id, user_id,
  username,                        -- per-organisation handle, à la Slack
  role: 'org_admin' | 'member',
  joined_at default now(),
  invited_by → users NULL,
  removed_at NULL,                 -- soft delete
  PRIMARY KEY (org_id, user_id),
  UNIQUE (org_id, lower(username))
)
```

The Org Owner is `organizations.owner_user_id`, not a role value.

**Usernames are unique per organisation, not globally, and case-insensitively
so.** The constraint is on `lower(username)`: if `@Alex` and `@alex` could
coexist, mention resolution would be ambiguous and the reserved-handle
guarantee below would leak. One account, a handle per organisation — Slack's
model. `@alex` always resolves within the
organisation of the issue it appears in, and since every issue is org-scoped,
resolution is never ambiguous.

**`removed_at` is a soft delete**, for two load-bearing reasons: the username
stays reserved so a later member cannot claim a departed colleague's handle
and silently inherit their historical mentions, and re-adding someone
restores the same membership, username and join date.

`invited_by` predates the organisation audit log ([`org_activity`](#organisation-audit-log)),
which now records invitations and joins. It is kept because the member list and
the person's profile show who invited them without querying the log.

### `projects`

```
projects(
  id, org_id, key, name, slug, description_md NULL,
  avatar_color, avatar_initials,
  lead_user_id → users NULL,
  issue_counter    int default 0,
  is_archived      bool default false,
  time_tracking_enabled bool default true,  -- off: no work-item writes; see § work_items
  estimation_field_id  → custom_fields NULL,  -- null = the built-in Estimation
  spent_time_field_id  → custom_fields NULL,  -- null = the built-in Spent time
  created_by, created_at, updated_at,
  UNIQUE (org_id, key), UNIQUE (org_id, slug), UNIQUE (id, org_id),
  CHECK (issue_counter >= 0),
  CHECK (estimation_field_id IS NULL OR spent_time_field_id IS NULL OR estimation_field_id <> spent_time_field_id)
)
```

`key` is 2–10 uppercase alphanumerics (`AC`, `PMS`) and becomes immutable
once the project has its first issue.

**Estimation and Spent time fields** (8.12; owner, 26 Sep 2026). Either may
name one of the project's own `duration` custom fields — `(estimation_field_id, id)` and
`(spent_time_field_id, id)` → `custom_fields (id, project_id)`, `NO ACTION` — and never the same
one for both:

- **A field chosen as Estimation becomes the estimate.** `estimate` on create and PATCH writes
  it, the Issue's `estimate_minutes` reads it, and `estimation:`, the sprint snapshot's remaining
  estimate and the estimate-against-spent comparison all read it. `issues.estimate_minutes`
  keeps what it held, and returns when the project goes back to the built-in.
- **A field chosen as Spent time mirrors the rollup**: it reads `issues.spent_minutes`, is
  read-only (`409 custom_field.read_only`), and stores no values of its own.

**An archived project is read-only** (decided 24 Sep 2026): creating,
editing, deleting or restoring its issues and changing its statuses,
priorities, types or work types answer `409 project.archived`. Reading,
and the personal signals — star, vote, watch — still work. Unarchive to edit.

**It is optional at creation and generated**, then editable:

| Project name | Generated key | Rule |
|---|---|---|
| `Acme Corporation` | `AC` | Two or more words → first letter of each |
| `Nothing Left Web App` | `NLWA` | …capped at 4 |
| `Billing` | `BIL` | Single word → first 3 characters |
| `Go` | `GO` | …or the whole word if shorter |
| `Partner Portal` | `PP` | |

Non-alphanumerics are stripped before splitting; the result is uppercased;
minimum 2 characters, maximum 4 when generated. On collision within the
organisation, a digit is appended (`PP` → `PP2`). A user-supplied key may be
2–10 characters.

`generateProjectKey` in `packages/format` is the one implementation. A name
that cannot yield two characters (`X`, `!!!`) returns nothing rather than an
invalid key — the signal to make the user type one.

Issue numbers come from

```sql
UPDATE projects SET issue_counter = issue_counter + 1
WHERE id = $1 RETURNING issue_counter;
```

inside the issue-insert transaction. Not a Postgres sequence: per-project
sequences proliferate, and sequence gaps from rolled-back transactions look
broken in a tracker where `AC-622` is a name people say out loud.

### `project_members`

```
project_members(project_id, org_id, user_id,
                role: 'project_admin' | 'contributor' | 'observer',
                created_at, created_by, PRIMARY KEY (project_id, user_id),
                FOREIGN KEY (project_id, org_id) → projects (id, org_id) ON DELETE CASCADE)
```

Removing someone from the organisation **deletes** their `project_members`
rows (decided 23 Sep 2026). Re-adding restores the `org_members` row —
username, join date — but not project access, which the re-inviting link or
a Project Admin grants afresh. A returning member silently regaining every old
project is the surprise an admin would not expect.

### `invitations`

Behaviour in [auth-and-tenancy.md § Invitations](./auth-and-tenancy.md#invitations).

```
invitations(
  id, org_id,
  project_id NULL,              -- null = organisation-level; composite FK (project_id, org_id)
  kind: 'email' | 'link',
  email NULL,                   -- kind='email'
  token_hash bytea UNIQUE,      -- SHA-256; every lookup is by hash
  token NULL,                   -- kind='link' only, CHECK (kind='link') = (token IS NOT NULL)
  org_role: 'org_admin' | 'member',
  project_role NULL: 'project_admin' | 'contributor' | 'observer',
  max_uses NULL, use_count int default 0,
  expires_at NULL, allowed_email_domain NULL,
  created_by, created_at, revoked_at NULL
)
invitation_uses(invitation_id → invitations ON DELETE CASCADE, user_id,
                used_at default now(), ip NULL, PRIMARY KEY (invitation_id, user_id))
```

**A share link keeps its raw token** (decided 23 Sep 2026).
Links are made to be pasted into group chats, so their secrecy is low, and an
admin must be able to copy an existing link again from the Invites tab rather
than rotate it to get a URL. Email invitations stay hash-only: their token
exists only in the recipient's inbox.

### `user_preferences`

One row per user, created at signup.

```
user_preferences(
  user_id PRIMARY KEY → users,
  theme: 'light' | 'dark' | 'system'  default 'system',
  last_project_id → projects NULL,    -- where a returning user lands; ON DELETE SET NULL
  ui              jsonb default '{}'  -- shapeless per-user UI state, such as
                                      -- knowledge-base tree collapse; nothing
                                      -- here is ever queried
)
```

Typed columns rather than a key/value meta table, because jobs select on
them. `timezone` stays on `users`, next to identity, and decides who receives
a digest at 9am local — that has to be a real column, not a key lookup.

`ui` is `jsonb` precisely because nothing queries it. **Recently-viewed issues
are not stored server-side at all**: that is per-device state and lives in the
browser. `last_project_id` is the one piece that has to survive a change of
device.

`PATCH /v1/me/preferences` writes `ui` by top-level key — a key sent as `null` is removed — and
refuses more than 16 KB after the merge (3.5). The knowledge base keeps its collapsed branches
there as `kb_collapsed: { "<PROJECT KEY>": ["<slug>", …] }`.

#### The `Me` DTO

`GET /v1/me` returns identity and preferences together, because the web shell
needs both before it can render anything:

```
{ id, email, name, avatar_url, timezone,
  email_verified_at, has_password, linked_providers,
  preferences: { theme, last_project_key, ui },
  current_organization_slug }
```

`current_organization_slug` is the session's current organisation, so the org
switcher and `/organization` need no second call; it is null for a PAT, for a
session in no organisation yet, and once the membership is removed (added
23 Sep 2026, 0c).

`last_project_id` is exposed as **`last_project_key`**: a client routes on
`/projects/<key>`, and rule 8 makes keys the public interface. `MeSchema` in
`packages/types` is the definition; no client redeclares it.

---

## Project configuration

Three value tables sharing a shape, cloned from a system seed when a project
is created, then editable by a Project Admin.

**No project is ever without values.** The seed runs inside project creation.
The user-facing word is **Status** everywhere — never "State".

**Names must be unique within a project, case-insensitively**, for statuses,
priorities, types, work types, sprints, boards and custom field options.
`status: {In Progress}`, `#{August 2026}` and every MCP tool that accepts a
name resolve by it, so a second "Open" makes those lookups
non-deterministic — and rule 8 makes names the public interface. The same
goes for `is_default`: exactly one per project per table. Both are
constraints as well as service checks: a UNIQUE key on
`(project_id, lower(name))`, and a partial UNIQUE key on `project_id WHERE
is_default` with a CHECK that the default is never archived. PostgreSQL's
`lower()` is the truth; the service compares with `toLowerCase()` for the
readable error and answers the same `409 config.name_taken` when a
concurrent write reaches the key first. The keys say *at most one* default;
*at least one* is the service's, which takes the project row (`FOR NO KEY
UPDATE`) before any configuration write, so a create-as-default, a default
switch, an archive and a delete in one project run one at a time. See
[Enforced in the application layer](#enforced-in-the-application-layer).

`short_label` is `char(1)`. `position` is `smallint`. `color` on statuses,
priorities and types is a **label-grid** name — `gray-1` … `pink-5`, eight
families × five steps (`LABEL_COLORS` in `packages/types`; values in
`design/tokens.css`). The column has no default; the service writes `gray-2`
(`DEFAULT_LABEL_COLOR`) when a create names no colour.

**Deleting a value that is still in use** requires `move_to=<Name>`: the service re-points every issue (or
work item) in the same transaction, writing one never-coalesced
`field_changed` row per issue. Without it the API answers `409
config.in_use` with the count. The keys from `issues` and `work_items` to a
value are `NO ACTION`, so the database refuses the delete too, checked at the
end of the statement; the value's board column mappings, swimlane-type rows
and custom-field type scoping cascade with it. The default cannot be deleted — make another
value the default first — and neither can the last value of a table.
Statuses and work types can be archived instead: an archived value stays on
the issues that have it but cannot be newly chosen (decided 24 Sep 2026).

### `workflow_statuses`

```
workflow_statuses(
  id, project_id, org_id, name,
  category: 'backlog' | 'unstarted' | 'started' | 'done' | 'cancelled',
  color, short_label,      -- 1 char, for the compact badge
  position, is_default default false, is_archived default false,
  UNIQUE (project_id, lower(name)),  UNIQUE (project_id) WHERE is_default,
  CHECK (NOT (is_default AND is_archived))
)
```

`category` is what keeps cross-project reporting meaningful when projects
rename their statuses. It doubles as the resolved flag: `done` and `cancelled` both count
as resolved.

Seeded defaults:

| Name | Category | Colour | Note |
|---|---|---|---|
| Submitted | `backlog` | `gray-1` | |
| Open | `unstarted` | `blue-2` | default for new issues (decided 24 Sep 2026; was Submitted) |
| In Progress | `started` | `yellow-2` | |
| Reopened | `unstarted` | `orange-2` | |
| Can't Reproduce | `cancelled` | `gray-2` | resolved |
| Duplicate | `cancelled` | `gray-2` | resolved |
| Fixed | `done` | `green-2` | resolved |
| Won't fix | `cancelled` | `gray-2` | resolved |
| Obsolete | `cancelled` | `gray-2` | resolved |
| Closed | `done` | `green-3` | resolved |

**There are no transition rules.** Any status may follow any status. This is
the single largest simplification in the product, and it is intentional.

### `priorities`

```
priorities(id, project_id, org_id, name, color, short_label,
           position, is_default default false,
           UNIQUE (project_id, lower(name)), UNIQUE (project_id) WHERE is_default)
```

Seeded: Show-stopper `red-3`, Critical `pink-3`, Major `yellow-2`, **Normal**
(default) `green-1`, Minor `gray-4`.

### `issue_types`

```
issue_types(id, project_id, org_id, name, icon NULL, color, short_label,
            position, is_default default false,
            UNIQUE (project_id, lower(name)), UNIQUE (project_id) WHERE is_default)
```

Seeded: **Bug** (default) `red-2`, Feature `blue-2`, Task `gray-2`, Epic
`pink-2`.

### `work_types`

```
work_types(id, project_id, org_id, name, short_label, position,
           is_default default false, is_archived default false,
           UNIQUE (project_id, lower(name)),  UNIQUE (project_id) WHERE is_default,
           CHECK (NOT (is_default AND is_archived)))
```

Seeded: **Development** (default), Documentation, Implementation,
Investigation, Maintenance, Observation, Testing — the letter badge is the
first letter. The default pre-fills the work-type picker when time is logged
(1e).

---

## Issues

### `issues`

```
issues(
  id, org_id, project_id,
  key_number        int,           -- rendered as PROJ-<key_number>
  title             text,
  description_md    text NULL,

  status_id     → workflow_statuses,
  priority_id   → priorities,
  type_id       → issue_types,

  created_by → users,           -- "Created by X"; searchable as `created by:`
  updated_by → users,           -- "Updated by Y"
  parent_id     → issues NULL,     -- canonical hierarchy, max depth 3
  sprint_id     → sprints NULL,  -- (sprint_id, project_id) → sprints (id, project_id)
  rank          double precision NULL,  -- manual order within the backlog or a sprint

  estimate_minutes   int NULL,
  spent_minutes      int default 0,   -- denormalised rollup; see below
  story_points       int NULL,

  start_date   date NULL,
  due_date     date NULL,
  resolved_at  timestamptz NULL,
  last_automation_at timestamptz NULL, -- the last change an automation made (7); updated_by stays a person

  vote_count   int default 0,         -- denormalised
  comment_count int default 0,        -- denormalised

  search_tsv   tsvector GENERATED ALWAYS AS (…) STORED,
  created_at, updated_at, deleted_at NULL,
  UNIQUE (project_id, key_number),
  CHECK (estimate_minutes IS NULL OR estimate_minutes >= 0), CHECK (spent_minutes >= 0),
  CHECK (story_points IS NULL OR story_points BETWEEN 0 AND 999), CHECK (vote_count >= 0), CHECK (comment_count >= 0),
  CHECK (parent_id IS NULL OR parent_id <> id), CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
)
```

Notes:

- `resolved_at` is stamped automatically when the issue enters a status whose
  category is `done` or `cancelled`, and cleared on the way out. Moving
  between two resolved statuses (Fixed → Closed) keeps the original stamp. It powers
  Average Issue Age, Burndown, cycle time, and the struck-through rendering
  of resolved issue keys in link lists.
- `spent_minutes` is **the rollup**: this issue's own work items plus every
  descendant's, refreshed in the same transaction as any work-item write.
  Time logged on a subtask is immediately visible on its epic, which is what
  the issue list and `spent time:` both mean. There is no separate own-time
  column — `work_items` is where per-issue time is read from, and moving an
  issue to a new parent recomputes the rollup on both the old and the new
  ancestor chain.

  As built in 1e (owner decisions, 25 Sep 2026): the rollup counts the **live**
  subtree only. Soft-deleting an issue takes its time (and its subtree's) out of
  every ancestor; restoring puts it back. The value is always recomputed from
  `work_items` rather than adjusted by a delta — `refreshSpentRollup` in
  `@services/issue-hierarchy` is the one caller, reached from every work-item
  write, every parent change (PATCH `parent`, subtask links, `parent for` links
  at creation) and delete / restore — so a drifted value heals on the next write.

  **Reports must never sum `spent_minutes` across issues.** A parent already
  contains its children, so the total would double-count. The Time and
  Timesheet reports aggregate `work_items` directly.
- `rank` is the drag order in the backlog and on the board, scoped to the
  issue's container (its sprint, or the backlog when `sprint_id` is null).
  A drop writes the midpoint of its neighbours; when neighbours are closer
  than `1e-6` the container's ranks are renumbered `1, 2, 3…` in the same
  transaction (a rank only ever compares within its container). `NULL` sorts last, so
  untouched issues fall back to `created_at`; the first drop into a container with
  unranked issues renumbers it in its displayed order first. An issue moved into a
  sprint, or carried over by *Finish sprint*, lands at the bottom of its new container. It is `double precision` rather than `smallint` because
  hundreds of issues are reordered one at a time and a midpoint scheme
  avoids rewriting every row on each drop.
- `parent_id` is the **single source of truth** for hierarchy. The `subtask`
  link type is a UI projection of it: setting a parent renders as a subtask
  link, and creating a subtask link sets `parent_id`. No row is written to
  `issue_links` for it.
- `search_tsv` is a **generated column** over title and description, so it can
  never be stale and there is no reindex job:

  ```sql
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description_md, '')), 'B')
  ) STORED
  ```

  Comment bodies are deliberately not included — see
  [Full-text search](#full-text-search).

The only non-UNIQUE index on this table is the GIN index on `search_tsv`. See
[Index policy](#index-policy).

### `issue_assignees`

```
issue_assignees(issue_id, org_id, user_id, assigned_at default now(),
                PRIMARY KEY (issue_id, user_id))
```

Multi-assignee. Empty set renders as the configured empty value,
"Unassigned".

### `issue_links`

```
issue_links(
  id, org_id, from_issue_id, to_issue_id,
  type: 'relates' | 'depends' | 'duplicate' | 'subtask',
  created_by, created_at,
  UNIQUE (from_issue_id, to_issue_id, type),
  CHECK (from_issue_id <> to_issue_id)
)
```

Stored canonically in the outward direction, rendered in both:

| Type | Outward name | Inward name |
|---|---|---|
| `relates` | relates to | relates to |
| `depends` | is required for | depends on |
| `duplicate` | is duplicated by | duplicates |
| `subtask` | parent for | subtask of |

Writing a `subtask` link also sets `issues.parent_id`. Cycles are rejected on
`depends` and `subtask`.

As built in 1d (decided 24 Sep 2026):

- `relates` is stored once, **from the lower issue id**, so the unique key
  refuses B → A when A → B exists. The other types are stored outward:
  "A depends on B" is `from = B, to = A`.
- A link may join projects within the organisation; the caller needs the link
  capability on the issue they act from and read access to the target. A
  linked issue in a project the reader cannot open is neither listed nor
  counted.
- The `depends` cycle check walks every `depends` row, soft-deleted issues
  included, so restoring an issue can never complete a cycle.
- Linking or unlinking stamps `updated_at` / `updated_by` on the issue acted
  from; a parent change stamps them on the child, whose row changed.

### `tags`

```
tags(id, org_id, name, slug, color, created_by, created_at,
     UNIQUE (org_id, slug))
issue_tags(issue_id, org_id, tag_id, added_at default now(),
           PRIMARY KEY (issue_id, tag_id))
```

**Tags are organisation-level**, usable across every project, rather than
per project. A tag used on one project is immediately available on another,
which is what makes cross-project search useful.

**Naming rule.** A tag has a display form and a matching form, and this app
stores **both**:

- `name` — exactly as typed. Case and spaces preserved. This is what displays.
- `slug` — `trim → lowercase → collapse internal whitespace → "-"`, plus
  stripping of characters outside `[a-z0-9._:-]`, then collapsing runs of
  `-` and trimming them from both ends, so `-- Needs -- Review --` and
  `Needs Review` land on the same slug. Unique per organisation.
  One implementation: `slugify` in `packages/format`.

So typing `Needs Review` when `needs-review` already exists **reuses the
existing tag** instead of creating a near-duplicate twin — the failure mode
that makes tag lists useless after six months. Display stays human
(`Needs Review`), matching stays machine-safe (`needs-review`).

Colons are preserved, so namespaced tags (`area:billing`, `area:billing`) work
naturally.

MCP tools accept either form, resolve by slug, and **create on first use** so
an agent can tag freely without a separate creation step.

Colour comes from the fixed 40-name label grid (`gray-1` … `pink-5`), the one
statuses, priorities and types use, not free hex, so tags stay legible in dark
mode and one picker serves them all (owner decision, 24 Sep 2026, 1d review).

As built in 1d (decided 24 Sep 2026): a tag created on first use takes its own
`color`, else the request's, else a label colour derived deterministically
from its slug. `POST /v1/issues` applies tags and links in the issue's own
transaction, with the same rules. When two
spellings race for one slug, the first insert wins and keeps its name and
colour. Tagging or untagging stamps the issue's `updated_at` / `updated_by`.

### `custom_fields`

As built in Phase 4 (26 Sep 2026). Owner decisions from that session are
recorded beside the rule they shape.

```
custom_fields(
  id, org_id, project_id,
  name, slug,                  -- slug is the search-query attribute name; fixed at creation
  type: 'text' | 'markdown' | 'number' | 'integer' | 'date' | 'datetime' | 'checkbox' |
        'select' | 'multi_select' | 'user' | 'multi_user' | 'url' | 'duration',
  config           jsonb default '{}',  -- number: min, max, decimals; integer: min, max
  is_required      bool default false,
  default_value    jsonb NULL,          -- the input form of a value; null = no default
  empty_label      text NULL,           -- null reads "No <name>", so a rename carries it
  position smallint, is_archived bool default false,
  created_by, created_at, updated_at,
  UNIQUE (project_id, slug), UNIQUE (id, org_id), UNIQUE (id, project_id),
  UNIQUE (project_id, lower(name)),
  FOREIGN KEY (project_id, org_id) → projects (id, org_id)
)

-- Which issue types a field applies to. NO rows = applies to all types.
custom_field_applies_to(
  field_id, type_id, project_id, org_id,
  PRIMARY KEY (field_id, type_id),
  FOREIGN KEY (project_id, org_id)  → projects (id, org_id),
  FOREIGN KEY (field_id, project_id) → custom_fields (id, project_id),
  FOREIGN KEY (type_id, project_id)  → issue_types (id, project_id)
)

custom_field_options(
  id, org_id, field_id, name, color default 'gray-2', position, is_archived default false,
  UNIQUE (id, field_id),
  UNIQUE (field_id, lower(name)),
  FOREIGN KEY (field_id, org_id) → custom_fields (id, org_id)
)

issue_field_values(
  id,
  org_id, project_id, issue_id, field_id,
  value_text NULL, value_number double precision NULL, value_date date NULL,
  value_timestamptz NULL, value_bool NULL,
  option_id NULL, user_id → users NULL,
  created_at, updated_at,
  -- one row per value; multi-value fields have several rows per (issue, field)
  UNIQUE NULLS NOT DISTINCT (issue_id, field_id, option_id, user_id),
  CHECK (num_nonnulls(value_text, value_number, value_date, value_timestamptz,
                      value_bool, option_id, user_id) = 1),
  FOREIGN KEY (issue_id, project_id) → issues (id, project_id),
  FOREIGN KEY (issue_id, org_id)     → issues (id, org_id),
  FOREIGN KEY (field_id, project_id) → custom_fields (id, project_id),
  FOREIGN KEY (option_id, field_id)  → custom_field_options (id, field_id)   -- NO ACTION
)
```

Everything cascades on delete except `option_id` (`NO ACTION`: an option in use is moved
first) and `user_id` (`RESTRICT`, as every key to `users`). The composite keys make a value
for another project's field, an option of another field, or a type of another project
unwritable. The option's column is `name`, not `value`, as every other value table.

`default_value` is required by the "defaults" half of the custom-field
requirement; without it a field can be marked required with nothing to
pre-fill.

`value_timestamptz` exists because `value_date` is a `date` and the
`datetime` field type had nowhere to land — a silent truncation of the time
component. The two are separate columns for the same reason `due_date` is a
`date` and `created_at` is a `timestamptz`: one is a calendar date that must
never shift by timezone, the other is an instant that must.

`custom_field_applies_to` replaces an `applies_to_type_ids` array column.
An array has no referential integrity: delete an issue type and the array
keeps a dangling id, with no error and no way for the database to tell you.
A join table makes the foreign key real.

`UNIQUE NULLS NOT DISTINCT` (PostgreSQL 15+) is load-bearing, not decoration.
Every field that is neither a select nor a user — text, markdown, number,
integer, date, datetime, checkbox, url, duration — leaves both `option_id` and
`user_id` null. Under the default `NULLS DISTINCT`, Postgres treats each such
row as unique, the constraint enforces nothing at all, and the same field can
be written to the same issue an unlimited number of times. It has to be a
`UNIQUE` constraint with a separate surrogate `id`, not the primary key: a
primary key forces every column `NOT NULL`, which is exactly what these two
columns are not.

`custom_field_applies_to` implements "applicable to which issue types" — a field
scoped to Bug does not clutter an Epic.

Typed columns rather than a `jsonb` blob on the issue, because:

- multi-value fields need rows, not a scalar key;
- select values reference `custom_field_options` by ID, so renaming an option
  updates every issue at once rather than orphaning old strings;
- reports `GROUP BY` a custom field value, which is a column comparison
  rather than a scan through a document.

**Where each type lands:**

| Type | Column | Input | Notes |
|---|---|---|---|
| `text` | `value_text` | one line, ≤ 1000 characters | |
| `markdown` | `value_text` | markdown, ≤ 16KB | history records that it changed, as for the description |
| `url` | `value_text` | `http(s)://…`, ≤ 2000 characters | |
| `number` | `value_number` | a number within `min` / `max`, at most `decimals` places (0–6) | stored as `double precision`: approximate, see below |
| `integer` | `value_number` | a whole number within `min` / `max` | exact below 2^53 |
| `duration` | `value_number` | minutes, or `1w 1d 1h 1m` read with the organisation's calendar | stored as whole minutes |
| `date` | `value_date` | `YYYY-MM-DD` | a calendar date, never timezone-shifted |
| `datetime` | `value_timestamptz` | an ISO instant | |
| `checkbox` | `value_bool` | `true` / `false` | only `true` is stored; no row is unchecked, so a checkbox is never empty and cannot be required |
| `select` | `option_id` | an option's name | |
| `multi_select` | `option_id`, one row each | option names, ≤ 50 | |
| `user` | `user_id` | a username; anyone who can open the issue, as for assignees | |
| `multi_user` | `user_id`, one row each | usernames, ≤ 50 | |

**Custom numbers are approximate.** `value_number` is `double precision`, binary
floating point, shared by `number`, `integer` and `duration`. A field's
`decimals` setting is input validation, not storage precision: the API rejects
a value with more places than configured, and never rounds. `0.1 + 0.2` is not
exactly `0.3`, and equality filters and sums over a `number` field are not
exact. Custom fields are not for money or any figure that must add up to the
cent; durations stay exact because they are whole minutes. If exact decimals are
ever required, the change is a `numeric(p,s)` column with a string representation
in the API, which is deliberately not done now.

**Rules** (owner, 26 Sep 2026):

- **The slug is fixed at creation** — the slugified name unless given, `^[a-z][a-z0-9-]{0,39}$`,
  never a built-in attribute name, `aggregate` or `description`. A rename changes the name only,
  so saved views, history (`custom:<slug>`) and URLs keep working.
- **One slug means one kind of value across the organisation.** Two projects may both have a
  `severity` select, so a cross-project `severity: High` works; a `severity` number beside it is
  refused (`409 custom_field.slug_conflict`). Kinds: text (text, markdown, url), number (number,
  integer), duration, date, datetime, checkbox, option (select, multi_select), person (user,
  multi_user).
- **At most 50 live fields per project**; archived fields do not count
  (`409 custom_field.limit`).
- **Required** is checked when an issue is created, when the field is cleared, and when a type
  change makes the field apply; a default fills the gap where there is one, else
  `400 custom_field.required`. Issues that existed before the field became required are not
  checked until then.
- **A field that stops applying keeps its values** (owner, 26 Sep 2026): when an issue's type
  changes to one the field does not apply to, or the field's types are narrowed, the values
  stay stored but hidden — the issue no longer lists them and a search on the slug no longer
  matches them — and they return if the field applies again. Nothing is written to history.
- **A default** is applied at creation when the request does not name the field, and is
  validated against the type when it is set.
- **Archiving** keeps every value and keeps the field searchable, but it cannot be written, the
  issue no longer lists it, and autocomplete no longer offers it.
- **Deleting** a field is allowed after a confirmation and destroys its values; the history rows
  that name it stay. Deleting an option still in use needs `move_to=<option>`, as the project's
  value lists do; an archived option stays on the issues that have it but cannot be newly
  chosen.
- **A field chosen as the project's Estimation or Spent time** (see [`projects`](#projects)) cannot
  be archived; deleting it returns the project to the built-in.

### `issue_stars`, `issue_votes`, `issue_watchers`

```
issue_stars(issue_id, org_id, user_id, created_at)      -- ★ favourite; implies watch
issue_votes(issue_id, org_id, user_id, created_at)      -- 👍 with a count
issue_watchers(issue_id, org_id, user_id, source: 'explicit' | 'auto', created_at)
-- all three: PRIMARY KEY (issue_id, user_id), FOREIGN KEY (issue_id, org_id) → issues
```

Auto-watch on create, assign or comment. `issue_watchers` is what the
notification fan-out reads.

Auto-watch is **subject-based** (decided 24 Sep 2026): creating an issue
makes the creator a watcher; assigning makes each *newly assigned* user a
watcher, not the person who assigned; commenting (1d) makes the author one.
An existing row is never downgraded from `explicit` to `auto`. Starring
inserts an `explicit` watch; unstarring leaves the watch. An explicit unwatch
deletes the row, and a later new assignment adds it back — assignment is new
information the person should hear about. Unassigning removes nobody.

---

## Comments and activity

### `comments`

```
comments(
  id, org_id,
  issue_id   → issues NULL,      -- exactly one of issue_id
  article_id → articles NULL,    -- or article_id is set; added in 3.5 with `articles`
  author_id, body_md,
  created_at, edited_at NULL, deleted_at NULL
)

comment_reactions(comment_id, org_id, user_id, emoji, created_at,
                  PRIMARY KEY (comment_id, user_id, emoji))
```

One table serves both issue and article comments, so mentions, reactions,
editing, permissions and notifications have a single implementation.

Exactly one of `issue_id` and `article_id` is set. Both are nullable because
either one may be the absent one, so `NOT NULL` cannot express the rule; it is
enforced in the service layer, which is the only writer. See
[Enforced in the application layer](#enforced-in-the-application-layer).

`comment_reactions.emoji` is constrained to a **fixed set of five**:
👍 👎 🎉 👀 ❤️. Not an open picker — a small set keeps the UI quiet and still
absorbs the low-value "+1" comments that clutter a thread.

Comment visibility always follows issue visibility. There is no per-comment
visibility setting and no permission groups — deliberately omitted.

As built in 1d (owner decisions, 24 Sep 2026):

- **A soft-deleted comment vanishes.** It leaves every list and
  `comment_count`, its `commented` / `comment_edited` history rows are no
  longer served, and its mentions are deleted; only the `comment_deleted` row
  remains. The row itself stays until the issue is purged.
- **A new comment stamps the issue's `updated_at`, not its `updated_by`**,
  which keeps naming the last person to change the issue itself. Edits and
  deletes stamp neither.
- `comment_count` moves in the same transaction as the insert or soft delete.
- Ticking a task checkbox in a comment is an edit: it sets `edited_at` and
  writes `comment_edited`.

### `issue_activity`

```
issue_activity(
  id, org_id, issue_id,
  actor_id NULL,                     -- NULL: the system (a git event, an automation); 7
  automation_run_id bigint NULL,     -- the run that made the change (7); no FK: purging runs must not scan this table, a purged id finds nothing
  change_group_id  uuid,           -- v7, one per save; groups its rows
  kind: 'created' | 'field_changed' | 'commented' | 'comment_edited' |
        'comment_deleted' | 'linked' | 'unlinked' | 'attached' |
        'detached' | 'time_logged' | 'tagged' | 'untagged' |
        'sprint_changed' | 'parent_changed' | 'deleted' | 'restored' |
        'git_linked' | 'git_unlinked' | 'git_pr_changed',
  field        text NULL,          -- e.g. 'status', 'assignee', 'custom:severity'
  old_value    jsonb NULL,
  new_value    jsonb NULL,
  created_at, updated_at        -- see Coalescing: first touch, last touch
)
```

`old_value` / `new_value` are **readable snapshots taken at write time**, never
ids: `{"name": "Open"}` for a status, priority or type; a sorted array of
usernames for `assignees` (one row per save, the whole set on each side, so
A → B → A compares equal); minutes for `estimate`; ISO dates for
`start_date` / `due_date`; the text for `title`; `description` carries no
value, only that it changed. History therefore reads as it was, and survives
a rename or deletion of the value (decided 24 Sep 2026).

`deleted` and `restored` record a soft delete and its undo; purge removes
them with the issue.

The other kinds carry (decided 24 Sep 2026, 1d): `commented`,
`comment_edited` and `comment_deleted` → `new_value: {"comment_id": 42}`, the
one id a snapshot holds, because the entry renders the live comment beneath
it; `linked` / `unlinked` → `{"link": "depends on", "issue": "PMS-3"}` in
`new_value` / `old_value`, read from the issue the row belongs to, one row on
each end; `tagged` / `untagged` → `{"name": "Needs Review"}`;
`parent_changed` → `{"key": "PMS-1"}` or `null` on each side, with `linked` /
`unlinked` (`"parent for"`) on the new and old parent. None of them coalesce.

`attached` / `detached` (decided 25 Sep 2026, 1f) record a file joining or leaving the
issue — on completion of an upload to it, on a draft's claim (in the create's change
group), and on delete — with `new_value` / `old_value`
`{"attachment_id": "<public_id>", "filename": "login-bug.png", "mime_type": "image/png",
"size_bytes": 48213, "comment_id": 42, "work_item_id": null}`, one row per file. The id is
kept, as `comment_id` is on `commented`, so the entry can link a file that still exists.
Deleting a comment does not add `detached` rows for its files; its `comment_deleted` row
covers them. They do not coalesce.

`time_logged` (decided 25 Sep 2026, 1e) records every work-item write with the one
kind: `new_value` only when time was added, both sides when a record was edited,
`old_value` only when one was deleted. Each side is
`{"work_item_id": 7, "author": "casey", "work_date": "2026-09-21", "minutes": 120,
"work_type": "Development"}` — the author's username and the work type's name, read at
write time; `work_type` is `null` for time logged without one. A request that writes
several rows (records, or a range) writes one `time_logged` row per work item, all in one
change group. It does not coalesce.

**Custom fields** (Phase 4, 26 Sep 2026) are ordinary `field_changed` rows with `field:
'custom:<slug>'` — the slug is fixed, so the row keeps naming its field — and coalesce like any
other field. Each side is `null` when empty, else: the option's name `{"name": "High"}` for a
select; a sorted array of option names for a multi-select, and of usernames for a multi-user
field (one row per save, the whole set on each side, as `assignees`); a username for a user
field; the number, the minutes of a duration, the ISO date or instant, the text or URL, `true`
for a checkbox. A markdown field carries no value, only that it changed, as `description`.
`time_logged` snapshots gain `attributes`, `{"Billable": "Yes"}`, read at write time.

`sprint_changed` (decided 26 Sep 2026, Phase 3) records an issue joining, leaving or moving
between sprints — from the issue's own sprint field, the backlog, *Finish sprint*'s
carry-over, a sprint created with the unresolved issues of another, and a planned
sprint's deletion — with `{"name": "September 2026", "slug": "september-2026"}` or `null`
(the backlog) on each side. It does not coalesce. A change of `rank` records nothing:
ordering is not a change to the issue. `story_points` is an ordinary `field_changed` field
with the number, or `null`, on each side.

A member's removal (decided 25 Sep 2026, 1g) reassigns or unassigns each of their open
issues with an ordinary `assignees` row whose actor is whoever removed them; nothing on
the row records why, and it coalesces like any other change. The API answers each
row with `people`, the members its snapshots name by username resolved at read time
(former members included), so a removed assignee still renders by name — custom user and
multi-user fields' rows included (Phase 4).

**Git** (7, 25 Oct 2026). `git_linked` / `git_unlinked` record a branch, commit or pull request
joining or leaving the issue, with `new_value` / `old_value` a snapshot of it — `{"kind":
"pull_request", "repo": "acme/web", "number": 42, "title": "…", "url": "…", "state": "open",
"review": "approved", "ci": "passing", "sources": ["pr_title"], "intent": "closes"}`; a commit has
`sha` and `title`, a branch `name`. `git_pr_changed` records a linked pull request's state, review
or CI moving, `old_value` and `new_value` the snapshot before and after, and **coalesces per pull
request** over the same five-minute window: twelve matrix jobs make one row, and a change that
returns to where it started erases the row. Rows written by the system have `actor_id` NULL and
render as the bot (`actor.system` in the catalogue, a generated mark); a link made or removed by
hand carries the person. A system row never coalesces with a person's.

**Immutable** once outside the coalescing window. Never updated, never deleted
otherwise. It renders the issue history
("Status: Open → In Progress"), feeds the notification fan-out, answers the
MCP question *"what changed on this issue?"*, and provides audit evidence.

The issue page filters this one table into its All and History tabs by `kind`;
the Comments and Spent time tabs list `comments` and `work_items` themselves, since
their rows are edited in place.

**`change_group_id` is stamped once per transaction**, so several field
changes made in one save render as a single entry:

```
Alex Lee · Updated 3 months ago
    Estimation:    ? → 4h
    Story points:  Not estimated → 5
    Priority:      Normal → Major
```

and a comment saved alongside a field change renders as one unit, with the
change shown beneath the comment body. Without this, the history becomes an
unreadable stream of one-line entries.

### Coalescing — collapse to net effect

`change_group_id` groups changes made in **one save**. Coalescing handles the
separate problem of the same field changed **repeatedly over a short period**,
which is almost always a correction rather than a decision.

Assigning an issue to the wrong person and fixing it twenty seconds later
should not leave two entries in the permanent record. It is noise, and at
scale it makes the history unreadable.

**Rule: within a 5-minute window, the same actor changing the same field on
the same issue updates the existing row instead of inserting a new one.**

The window is **fixed from first touch**: a row coalesces while
`now − created_at < 5 min`, so continuous editing cannot keep rewriting one
entry indefinitely. Only `field_changed` rows coalesce; `created` never does.
A coalesced row keeps its original `change_group_id` (decided 24 Sep 2026).

```
Assignee: A → B, then B → C     ⇒  one row:  Assignee: A → C
Assignee: A → B, then B → A     ⇒  the row is DELETED — net-zero change
Story points: ? → 2, then 2 → 5 ⇒  one row:  Story points: ? → 5
```

The A → B → A case is the biggest win and the one most trackers miss: an
edit that changed nothing leaves no trace at all.

#### Three hard stops

Coalescing rewrites the record, so it must never rewrite something a person
has already read or relied on.

1. **Never coalesce across a comment.** Once anyone has commented on the
   issue, earlier changes are part of a narrative someone read. Collapsing
   them changes what the thread said.
2. **Never coalesce across another actor's change to the same field.**
   A → B by you, B → D by someone else, D → E by you must remain three rows.
   Merging your two would erase their change.
3. **Never coalesce the organisation audit log.** `org_activity` records
   security-relevant events, where every intermediate state matters.
   Coalescing is for the issue narrative only.

#### Columns

```
issue_activity(
  …,
  created_at,        -- first touch; ordering is stable
  updated_at         -- last touch; what the UI renders as the timestamp
)
```

Ordering uses `created_at` so the timeline never reshuffles under the
reader. The displayed relative time uses `updated_at`, so an entry that was
still being edited a minute ago reads as a minute ago.

#### Implementation

At write time, in the service layer: look for a coalescable row, update it or
delete it, otherwise insert. Not a background compaction job — a job would
race with readers and change history under someone's eyes.

#### The second benefit

**Notification fan-out is deferred by the same window and reads the settled
value.** Nobody receives "assigned to you" followed ninety seconds later by
"unassigned". This is arguably worth more than the cleaner history, and it
is free once coalescing exists. See [notifications.md](./notifications.md).

#### Accepted cost

Intermediate states are lost for coalesced fields. For a tracker that is
correct — the record should show what was decided, not every keystroke. Where
completeness genuinely matters, in `org_activity`, coalescing is off.

### `mentions`

```
mentions(id, org_id,
         source_type: 'issue' | 'comment' | 'work_item' | 'article',
         source_id, mentioned_user_id,
         issue_id   NULL,        -- context pointer, for fan-out and jump-to-source
         article_id NULL,        -- added in 3.5 with `articles`
         created_at,
         UNIQUE (org_id, source_type, source_id, mentioned_user_id))
```

Extracted from markdown at write time so notification fan-out never has to
re-parse text. Every save of a description or a comment replaces that source's rows:
`@username` resolves against the organisation's live members, and unknown
names are dropped.

`PROJ-123` references are **not stored** (decided 24 Sep 2026). They are
resolved when the markdown is rendered — linked, and struck through when
resolved — against the issues that exist then, so a reference to an issue
created later starts working on its own.
The one stored copy is `article_issue_refs` (3.5), which answers an issue's *Referenced by*
list; rendering still resolves every key live.

`source_type` includes `article` because `@username` works in an article
body, and both context pointers are nullable because a mention hangs off
exactly one of the two. Without this, a mention written in a knowledge base
article has no valid `source_type` and nothing to put in `issue_id`; a
comment on an article has the same problem, since `source_type` is
`comment` but no issue exists. Exactly one of `issue_id` and `article_id` is
set, enforced in the service layer.

---

## Time tracking

### `work_items`

```
work_items(
  id, org_id, issue_id,
  project_id,                 -- always the issue's project
  author_id      → users,     -- whose time this is
  created_by  → users,     -- who recorded it (may be a Project Admin)
  work_date        date,      -- calendar date, never timezone-shifted
  duration_minutes int,
  work_type_id   → work_types NULL,
  description_md   text,
  created_at, updated_at,
  CHECK (duration_minutes > 0)
)
```

`author_id ≠ created_by` supports a Project Admin logging time on someone
else's behalf through the author selector.

**Duration input** accepts the format `1w 1d 1h 1m`, resolved using
the organisation's `workday_minutes` and `workweek_days`. Output renders in
the same format (`3d`, `1h 30m`). Stored as minutes.

**Date-range mode** expands one entry across a date range into **one
independent row per working day**. Logging Monday–Wednesday writes three
rows, each editable and deletable on its own.

There is deliberately **no `batch_id`** linking them. The range is an input
convenience, not an entity: once written, three days of work are three facts,
and someone correcting Tuesday should not have to touch Monday. It also keeps
the Timesheet report a simple per-day grid rather than a range-overlap
calculation.

Writing a work item updates `issues.spent_minutes` in the same transaction
and appends an `issue_activity` row.

As built in 1e (owner decisions, 25 Sep 2026):

- **A range's duration is per day.** `4h` from Monday to Friday writes five 4h rows.
  **Working days** are the organisation's `workweek_days` counted from
  `week_starts_on`: Monday–Friday by default, Sunday–Thursday for a Sunday-start
  five-day week. A range spans at most 62 days and must contain a working day.
- One request may carry up to 20 records (dates or ranges) sharing one author, work
  type and note. The note is markdown, 16 KB at most, and stored on every row it
  produces; its `@username` mentions are written per row (`source_type 'work_item'`).
- `work_type_id` absent on the request takes the project's default; `null` is time
  logged without a type. An archived work type stays on its rows but cannot be chosen.
- The **author** is a live member who could log their own time in the project —
  Contributor or Project Admin there, or an organisation admin or the owner. Observers
  are never authors. "Own" in the permission matrix means `author_id`, not
  `created_by`.
- Logging time stamps the issue's `updated_at`, not its `updated_by`, as a comment does;
  edits and deletes stamp neither. A delete is a hard delete; its `time_logged` row keeps
  the snapshot.
- **Time tracking off** (`projects.time_tracking_enabled = false`) refuses creating,
  editing and deleting work items with `409 time_tracking.disabled`; everything already
  logged stays readable and keeps counting in `spent_minutes`. Estimates stay writable
  over the API.

**As built** (1 Oct 2026). `project_id` is the issue's project. The insert
reads it from the issue row in the same statement; no caller passes it. `(issue_id, project_id)`
→ `issues (id, project_id)` and `(work_type_id, project_id)` → `work_types (id, project_id)`
make a work type of another project unwritable; it implies `(work_type_id, org_id)`, so there
is no separate org key. `UNIQUE (id, project_id)` lets `work_item_values` bind to the work
item's project in turn.

No path changes an issue's project (checked 1 Oct 2026). `IssuePatch` has no `project_id`, no
statement updates it, and the `issue.move` capability has no caller. A future move must carry the
issue's work items. In the issue's transaction it maps each work type and attribute value to the
target project (or clears it) and rewrites `project_id` on `work_items` and `work_item_values`.
These keys, like the issue's own value-table and parent keys, are `ON UPDATE NO ACTION`.
Neither the parent nor the child can change first, so the change that builds a move also has
to make the keys `DEFERRABLE` or the child keys `ON UPDATE CASCADE`.

### Work item attributes

As built in Phase 4 (8.13; 26 Sep 2026). **Work type** is the built-in
attribute — `work_types` and `work_items.work_type_id`, unchanged — and cannot be removed. A
project may add its own select attributes beside it (*Billable*: Yes / No), each with values
and letter badges:

```
work_item_attributes(id, org_id, project_id, name, position smallint,
                     is_archived default false, created_at, updated_at,
                     UNIQUE (id, org_id), UNIQUE (id, project_id),
                     UNIQUE (project_id, lower(name)),
                     FOREIGN KEY (project_id, org_id) → projects (id, org_id))

work_item_attribute_values(id, org_id, attribute_id, name, short_label char(1),
                           position smallint, is_archived default false,
                           UNIQUE (id, attribute_id),
                           UNIQUE (attribute_id, lower(name)),
                           FOREIGN KEY (attribute_id, org_id) → work_item_attributes (id, org_id))

-- At most one value per attribute per work item; no row = no value.
work_item_values(work_item_id, attribute_id, value_id, org_id, project_id,
                 PRIMARY KEY (work_item_id, attribute_id),
                 FOREIGN KEY (work_item_id, org_id) → work_items (id, org_id),
                 FOREIGN KEY (work_item_id, project_id) → work_items (id, project_id),
                 FOREIGN KEY (attribute_id, project_id) → work_item_attributes (id, project_id),
                 FOREIGN KEY (value_id, attribute_id) → work_item_attribute_values (id, attribute_id))
```

Despite the similar names, the two tables with `values` in them hold different
things. `work_item_attribute_values` is the **option catalogue**: the choices an
attribute offers (*Yes*, *No*). `work_item_values` holds **selections**: which
option a given work item has for a given attribute. A rename to
`work_item_attribute_options`, matching `custom_field_options`, is wanted only
if a later schema change already touches these tables.

Everything cascades except `value_id` (`NO ACTION`). `(value_id, attribute_id)` makes a value of
another attribute unwritable, and `(attribute_id, project_id)` makes an attribute of
another project unwritable. `project_id` is the work item's, read from the work item row by the
insert.

- Names are unique per project (attributes, and `Work type` is taken) and per attribute (values),
  case-insensitively; at most 10 attributes per project and 50 values each.
- Time is logged with `attributes: {"Billable": "Yes"}` by name; `null` clears one. An archived
  attribute or value stays on its entries but cannot be newly chosen.
- Deleting a value still in use needs `move_to=<value>`; deleting an attribute is allowed after a
  confirmation and drops it from every entry (owner, 26 Sep 2026).
- Work item attributes are **not searchable** (owner, 26 Sep 2026): nobody searches issues by what
  was entered in a time log. Phase 5's time reports may group by them.

---

## Agile

As built in Phase 3 (26 Sep 2026). Owner decisions from that session are
recorded beside the table they shape.

### `sprints`

```
sprints(id, org_id, project_id, name, slug, goal_md NULL,
        start_date date NULL, end_date date NULL,
        state: 'planned' | 'active' | 'completed'  default 'planned',
        started_at timestamptz NULL, completed_at timestamptz NULL,
        created_by, created_at, updated_at,
        UNIQUE (project_id, slug), UNIQUE (id, org_id), UNIQUE (id, project_id),
        UNIQUE (project_id) WHERE state = 'active',
        UNIQUE (project_id, lower(name)),
        CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date))
```

`slug` is derived from the name (`September 2026` → `september-2026`), suffixed on
collision, always lower-case, and is what URLs and the `sprint://PROJ/<slug>` resource use.
Internal ids never appear in a URL.

- **Dates are optional** while a sprint is planned: `NULL` reads *Unscheduled*, as in
  the New Sprint dialog (owner, 26 Sep 2026). Starting a sprint sets `start_date` to
  the day it is started — the caller's today — unless the call names another day (owner,
  26 Sep 2026); it keeps the planned `end_date` and needs one, so
  the days-left countdown always has one.
- `started_at` / `completed_at` are the instants of *Start sprint* and *Finish sprint*;
  burndown and the reports read them rather than the planned dates.
- **At most one `active` sprint per project** is a partial unique index — a UNIQUE index,
  so the index policy allows it, and two concurrent starts cannot both succeed.
- A completed sprint takes no new issues; its name and goal stay editable.
- Only a **planned** sprint may be deleted; its issues return to the backlog first, each
  with a `sprint_changed` row.
- The goal is markdown, at most 16KB.

**One sprint per issue** (`issues.sprint_id`). Carry-over is modelled as
moving the issue to the next sprint; `issue_activity` preserves the history.
Many-to-many was considered and rejected: it makes burndown arithmetic
ambiguous and the UI harder, for a case the activity log already records.

### `boards`

```
boards(id, org_id, project_id, name, slug,
       column_field: 'status' | 'priority' | 'type'  default 'status',
       swimlane_by: 'none' | 'values' | 'issues'  default 'none',
       swimlane_field: NULL | 'assignee' | 'priority' | 'type',
       created_by, created_at, updated_at,
       UNIQUE (org_id, slug), UNIQUE (id, org_id), UNIQUE (id, project_id),
       UNIQUE (project_id, lower(name)),
       CHECK ((swimlane_by = 'values') = (swimlane_field IS NOT NULL)))

board_columns(id, org_id, board_id, name, position, wip_min NULL, wip_max NULL,
              is_collapsed_by_default default false,
              UNIQUE (board_id, position), UNIQUE (id, board_id),
              CHECK (wip_min IS NULL OR wip_min BETWEEN 1 AND 999), CHECK (wip_max IS NULL OR wip_max BETWEEN 1 AND 999),
              CHECK (wip_min IS NULL OR wip_max IS NULL OR wip_min <= wip_max))
```

The board slug is unique per **organisation**, not per project, so the short
route `/board/<slug>/current` resolves without a project segment; the
canonical route `/projects/PROJ/board/<slug>/…` carries the project anyway.
See [frontend-guide.md § Routes](./frontend-guide.md#routes).

- **Columns map one field** (owner, 26 Sep 2026): `column_field` is status
  (default), priority or type, and every column holds values of it. A column may hold several
  values (*Merge with*); a value sits in one column per board. A value in no column shows no card;
  the board view reports it as unmapped with its count. Moving a card between columns sets that
  field of the issue. Changing a board's `column_field` without naming columns makes one column
  per value; swimlanes by `values` may not use the column field
  (`board.swimlane_same_as_columns`). The *resolved* badge is for status columns only.
- **WIP limits are warnings, never refusals**: `wip_min` and `wip_max` (*Min* /
  *Max WIP*) are compared with the column's unfiltered count.
- **Swimlanes** (owner, 26 Sep 2026, the *Columns and Swimlanes* settings tab):
  `none`; `values` of `swimlane_field` — one lane per assignee, priority or type, a card
  with several assignees in its first assignee's lane (by username); or `issues` — the
  issues of the types in `board_swimlane_types` (e.g. Epic) become lanes, and a card goes
  in the lane of its nearest ancestor of such a type. A card with no lane goes in
  *Uncategorized*, always last.
- Every project is created with one board, named after the project and slugged by its
  key: **To do** (backlog and unstarted statuses) · **In progress** (started) · **Done**
  (done and cancelled), swimlanes by Epic issues when the project has an Epic type
  (`SEED_BOARD_COLUMNS`).
- At most 20 columns; names ≤ 100 characters; column names unique per board (application layer) and
  board names per project, case-insensitively (`UNIQUE (project_id, lower(name))`).

```
-- Which values map into a column. Same
-- reasoning as custom_field_applies_to: an array of ids has no referential integrity.
-- One of status_id / priority_id / type_id is set, matching the board's column_field (the
-- field match is the service's; exactly one is a CHECK). board_id and project_id ride along
-- so a value sits in one column per board, and only a value of the board's own project.
board_column_values(
  id, column_id, board_id, project_id, org_id,
  status_id NULL, priority_id NULL, type_id NULL,
  CHECK (num_nonnulls(status_id, priority_id, type_id) = 1),
  UNIQUE (board_id, status_id), UNIQUE (board_id, priority_id), UNIQUE (board_id, type_id),
  FOREIGN KEY (column_id, board_id)     → board_columns (id, board_id),
  FOREIGN KEY (board_id, project_id)    → boards (id, project_id),
  FOREIGN KEY (project_id, org_id)      → projects (id, org_id),
  FOREIGN KEY (status_id, project_id)   → workflow_statuses (id, project_id),
  FOREIGN KEY (priority_id, project_id) → priorities (id, project_id),
  FOREIGN KEY (type_id, project_id)     → issue_types (id, project_id)
)

-- The issue types whose issues are lanes when swimlane_by = 'issues'.
board_swimlane_types(
  board_id, type_id, project_id, org_id,
  PRIMARY KEY (board_id, type_id),
  FOREIGN KEY (project_id, org_id)   → projects (id, org_id),
  FOREIGN KEY (board_id, project_id) → boards (id, project_id),
  FOREIGN KEY (type_id, project_id)  → issue_types (id, project_id)
)
```

All of them cascade on delete: deleting a status, priority or type drops its mappings.
`board_column_values` has a surrogate id because a row keys on one of three nullable columns.

### `sprint_snapshots`

```
sprint_snapshots(sprint_id, org_id, snapshot_date date,
                 total_points, completed_points,
                 total_issues, completed_issues,
                 remaining_estimate_minutes,
                 total_estimate_minutes NULL,
                 PRIMARY KEY (sprint_id, snapshot_date),
                 FOREIGN KEY (sprint_id, org_id) → sprints (id, org_id),
                 CHECK every count and estimate >= 0 (total_estimate_minutes when set),
                 CHECK (completed_points <= total_points), CHECK (completed_issues <= total_issues))
```

Written by `sprint.snapshot` nightly at 00:05 UTC for the UTC day just ended, for every
active sprint, and upserted immediately when a sprint starts (its first point) and
finishes (its last). Figures are over the sprint's live issues: points and issues in
total and resolved, and the summed estimation of the unresolved ones and of all of them.
`total_estimate_minutes` (Phase 5, 27 Sep 2026) is the estimate scope line
of the remaining-estimate burndown; a `NULL` day draws no scope for that measure. Burndown charts
read one small table instead of replaying the activity log, which makes them both
instant and historically accurate even after issues are edited.

---

## Attachments and storage

### `attachments`

```
attachments(
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id   uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),  -- random v4; the only id in a URL
  org_id,
  issue_id NULL, comment_id NULL, work_item_id NULL,
  article_id NULL,                    -- added in 3.5 with `articles`
  filename, mime_type, size_bytes bigint, checksum bytea,
  storage_target: 'platform' | 'byo',
  storage_location_id NULL,       -- → org_storage_locations; set exactly when storage_target = 'byo'
  bucket, object_key, public_url NULL,   -- private-bucket files have none
  width NULL, height NULL,        -- images, for layout without a fetch
  created_by, created_at,
  completed_at NULL,              -- NULL while the upload is pending
  deleted_at NULL,
  CHECK (size_bytes >= 0), CHECK (width IS NULL OR width > 0), CHECK (height IS NULL OR height > 0),
  CHECK (NOT (issue_id IS NOT NULL AND article_id IS NOT NULL) AND (work_item_id IS NULL OR issue_id IS NOT NULL)
         AND (comment_id IS NULL OR issue_id IS NOT NULL OR article_id IS NOT NULL)),  -- a draft has none
  CHECK ((storage_target = 'byo') = (storage_location_id IS NOT NULL))
)
```

As built (1f, 25 Sep 2026):

- **`issue_id` is set on every attached file**, including one on a comment or a work
  item, which then carries `comment_id` or `work_item_id` as well. The issue's list, its
  50-file limit, `attachments:` / `has: attachments` in search and the purge all read one
  column. `article_id` (3.5) is the other parent.
- **A draft has no parent at all**: a file uploaded from a form whose issue, comment or
  work item does not exist yet (`presign` with `project`). Only its uploader sees it; the
  create request claims it with `attachment_ids`, setting `issue_id` (and `comment_id` /
  `work_item_id`). Its object key is `api/{org_id}/drafts/{user_id}/{public_id}` and stays
  that way after the claim — the key is an address. Unclaimed drafts go after two days.
- **`completed_at` NULL is a pending upload**: the row exists from `presign` so its bytes
  are reserved against the quota and its place against the issue's 50. Pending rows are
  swept after an hour.
- **`checksum` is the client's SHA-256** of the file, sent at `presign` and signed into the
  presigned `PUT` (`x-amz-checksum-sha256`), so storage itself refuses other bytes.
- **`deleted_at` is short-lived**: a delete stops serving at once and releases the bytes;
  the hourly `attachments.sweep` removes the object, then the row. History keeps what it
  needs in its snapshot. Deleting a comment soft-deletes its files; deleting a work item
  (a hard delete) soft-deletes its files and clears `work_item_id` first, so the foreign
  key's cascade cannot strand objects.

Uploaded direct-to-R2 via presigned PUT; bytes never pass through the API.
`object_key` follows `api/{org_id}/{module}/{module_id}/{public_id}` in the
**private** bucket — see [file-storage.md § Two buckets](./file-storage.md#two-buckets).
Moving an issue to another project never rewrites keys; the row is the
source of truth, the key is only an address.
`storage_target` is recorded per row so platform-hosted and
customer-hosted objects coexist safely during a migration.

As built in 6c (28 Sep 2026) and restructured on 1 Oct 2026: a `byo` row's
`storage_location_id` names the location — provider, endpoint and bucket — it was uploaded to or
migrated into, through `(storage_location_id, org_id) → org_storage_locations (id, org_id) ON DELETE
RESTRICT` (`attachments_storage_location_org_fk`), and `attachments_storage_location_check` keeps it
set exactly when `storage_target = 'byo'`. A `byo` row is served only while the organisation's
verified connection points at that location; a bucket of the same name in another account or
region is a different location. `bucket` stays for display and is not the identity. The
storage migration rewrites `storage_target`, `storage_location_id` and `bucket` per file and never
the key. Files in a customer bucket count toward neither `storage_used_bytes` nor the pending
reservation.

### Why `public_id` exists, and why only here

Attachments are the one resource whose identifier appears in a URL that is
handed to a browser:

```
https://files.nothingleft.dev/<public_id>/<filename>
```

Every other resource is addressed by something already human-readable and
already non-sequential in the ways that matter — issues by `PMS-118`,
organisations and articles by slug, projects by key, users by username.
Their integer primary keys never leave the database.

A sequential integer in that file URL would be walkable. Authorisation still
refuses the fetch, but a walk reveals how many files exist and invites
scanning. `public_id` removes the temptation entirely, at the cost of one
extra column on one table.

**It is v4, deliberately — not v7.** UUID v7 encodes a timestamp and is
partially ordered, which is exactly what makes it good as a primary key and
exactly what disqualifies it as a public identifier: it leaks creation time
and narrows the guessing space. Public identifiers want randomness, not
locality.

The primary key stays `bigint`, so every foreign key pointing at an
attachment is still eight bytes and joins are still integer joins. Only the
lookup from a URL uses `public_id`, through its unique index.

Serving is via a stable application URL that authorises and then redirects to
a short-lived presigned URL — presigned URLs are **never** stored in
markdown. See [file-storage.md](./file-storage.md).

### `org_storage_locations`

As built on 1 Oct 2026.

```
org_storage_locations(
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      bigint → organizations ON DELETE CASCADE,
  provider    text CHECK IN ('r2', 's3'),
  endpoint    text,          -- built by the API from the R2 account ID or the S3 region, never typed
  region      text,          -- 'auto' on R2; how requests are signed, set by the latest connect
  bucket      text,
  created_at,
  UNIQUE (org_id, provider, endpoint, bucket),   -- org_storage_locations_identity_unique
  UNIQUE (id, org_id)                            -- the target of the two composite keys below
)
```

Where an organisation's customer-bucket files live: one row per provider, endpoint and bucket it has
ever connected. **The identity never changes and the row outlives its connection** — disconnecting
deletes the `org_storage_configs` row and keeps this one, so every file's row still says where its
bytes are. `attachments.storage_location_id` references it `ON DELETE RESTRICT`, so no location is
deleted while a file names it; `org.delete` removes an organisation's locations after its attachment
rows and its connection (`organization-purge.repository.ts`). `region` is not part of the identity:
a connect to the same provider, endpoint and bucket reuses the row and updates its region. A
location nothing references — a typo that failed its check — is harmless and stays until the
organisation is deleted. No index beyond the two keys.

### `org_storage_configs`

As built in 6c (28 Sep 2026); its location moved to `org_storage_locations` on 1 Oct 2026. At
most one row per organisation.

```
org_storage_configs(
  org_id              bigint PRIMARY KEY → organizations ON DELETE CASCADE,
  location_id         bigint,        -- (location_id, org_id) → org_storage_locations (id, org_id)
  access_key_id       text,          -- shown in settings
  secret_ciphertext   text,          -- sealed: AES-256-GCM, HKDF purpose byo_storage, AAD org_storage_configs:{org_id}
  status              text default 'pending' CHECK IN ('pending', 'verified', 'failed'),
  verified_at         timestamptz NULL,   -- first verification; set once
  checked_at          timestamptz NULL,   -- the last round trip, or the last refusal
  last_error          text NULL,          -- '<step>.<reason>', e.g. 'put.wrong_secret'
  migration_state     text default 'idle' CHECK IN ('idle', 'running', 'done', 'failed'),
  migrated_bytes      bigint default 0,
  total_bytes         bigint default 0,
  migrated_files      integer default 0,
  total_files         integer default 0,
  migration_error     text NULL,          -- '<step>.<reason>'
  migration_started_at  timestamptz NULL,
  migration_finished_at timestamptz NULL,
  created_by          bigint → users ON DELETE RESTRICT,
  updated_by          bigint → users ON DELETE RESTRICT,
  created_at, updated_at                   -- updated_at is also the migration's heartbeat
)
```

No index beyond the primary key.

Changes from the earlier sketch (owner, 28 Sep 2026): **`public_base_url` is dropped** — the
private bucket never serves publicly, every download is a presigned GET; `migrated_files`,
`total_files`, the two migration timestamps and `updated_by` are added; `checked_at` and
`last_error` record the last check. Codes in `last_error` and `migration_error` come from
`BYO_CHECK_STEPS` and `BYO_CHECK_REASONS` in `packages/types`.

- **Status.** `pending` after a passing server round trip, until the browser check; `verified`
  once it passes; `failed` when a check fails. A connection that failed before it ever
  verified (`verified_at` NULL) holds no files and counts as no connection at all; one that
  had verified and then failed (a revoked key) refuses serving and uploads until fixed.
  `markFailed` flips only a verified row, so the failure email goes out once.
- **Checks leave `updated_at` alone**: it is the migration's heartbeat, and a run with no
  progress for 30 minutes reads as stalled.
- **The secret is never returned by any API, at any access level.**
- **Disconnecting deletes the row** — the credentials, status and migration progress — and keeps
  its `org_storage_locations` row. The attachments there keep their rows and their location; a new
  connection to the same location (provider, endpoint and bucket) serves them again, and one to any
  other location, even a bucket of the same name, does not. `org.delete` deletes the row with the
  organisation's other contents (`organization-purge.repository.ts`).

The full behaviour — the setup wizard, the migration, the circuit breaker and what may delete
a customer object — is [file-storage.md § Bring your own storage](./file-storage.md#bring-your-own-storage).

---

## Saved views and search

### `saved_views`

```
saved_views(
  id, org_id, owner_id,
  project_id NULL,           -- null = cross-project
  name,
  query        text,         -- the query-language string
  query_ast    jsonb,        -- parsed form, for execution
  sort         jsonb,
  columns      text[],
  visibility: 'private' | 'project' | 'org',
  position, created_at, updated_at,
  CHECK (visibility <> 'project' OR project_id IS NOT NULL)
)
```

Saved views are referenceable inside other queries as `#{View name}`.

`query` is the canonical rendering of `query_ast` (`render.ts`); `query_ast` is
the parsed, unexpanded form, so a referenced view is expanded live and a change
to it reaches every query that names it. `sort` is `[{attribute, direction}]`,
the view's own order when its query has no `sort by:`. `columns` is the list
columns the view shows, by id. `position` is per owner, appended on create.
`project_id` is required for `project` visibility and optional otherwise.

### `recent_searches`

```
recent_searches(user_id, org_id, query_hash bytea, query text,
                last_used_at, use_count default 1,
                PRIMARY KEY (user_id, org_id, query_hash))
```

Powers the "Recent Searches" section of the search dropdown. Written by
`GET /v1/issues` for a session with a non-empty `q` — never for a personal
access token, so an agent's queries do not fill a person's dropdown — and
pruned to the newest 20 per user and organisation when a new query is
inserted (decided 24 Sep 2026). A repeat of a query last used under five
minutes ago writes nothing, so a view that polls its filter does not write on
every poll; a later repeat bumps `last_used_at` and `use_count` once. Page 2 and
beyond of a search are not recorded, and a failed write never fails the search.

`query_hash` is `sha256(query)`, and the query text cannot be the key: a btree
tuple is capped at roughly 2700 bytes, so a long saved query would fail to
insert rather than degrade. `org_id` is present for the same reason it is on
every other tenant-owned table — searches are org-scoped, and one
organisation's query text must not surface in another's dropdown.

---

## Notifications

Built in 6a (27 Sep 2026). Decisions in
[notifications.md § As built in 6a](./notifications.md#as-built-in-6a-api-half-27-sep-2026).

### `notifications`

```
notifications(
  id, org_id, user_id → users,
  kind: 'assigned' | 'unassigned' | 'mentioned' | 'commented' |
        'status_changed' | 'resolved' | 'linked' | 'due_soon' | 'overdue' |
        'time_logged' | 'sprint_started' | 'sprint_finished' |
        'article_published' | 'article_updated' | 'reaction' |
        'pull_request_merged' | 'ci_failed',
  project_id NULL,            -- the centre filters by project; set on every row written
  issue_id NULL, comment_id NULL, article_id NULL, sprint_id NULL,
  actor_id → users NULL,      -- null for due_soon and overdue, and for what the system wrote (git, automations)
  payload jsonb default '{}', -- the settled facts by name: {field, from, to}, comment, link, minutes, due_date
  dedupe_key text,            -- 'a:<issue_activity id>', 'm:comment:42', 'due_soon:<issue id>', …
  read_at NULL, created_at,
  UNIQUE (user_id, dedupe_key)
)
-- composite FKs, all ON DELETE CASCADE: (project_id, org_id) → projects, (issue_id, org_id) → issues,
-- (comment_id, org_id) → comments, (article_id, org_id) → articles, (sprint_id, org_id) → sprints
```

Backs the **notification centre**: a dedicated inbox listing everything,
with unread counts, filters by kind and by project, mark-read and
mark-all-read.

The `kind` list is the catalogue in [notifications.md](./notifications.md) in
full, rather than an abbreviation of it — a truncated enum is how the two
documents drift. There is no `invited` kind: invitations are transactional
email. `article_id` exists because `article_published` and `article_updated` have
nothing else to point at; `sprint_id` likewise for the two sprint kinds.

**`payload` holds facts, not a sentence.** The summary line is rendered from the
catalogue when it is read (rule 15), with the issue's key, title and project read live, so a
moved or renamed issue reads as it is now; the payload keeps only what the settled history
said — the status names on each side, the comment's number, the link.

**`UNIQUE (user_id, dedupe_key)`** is what makes *one row per person per event* a constraint:
a retried fan-out or an overlapping run inserts nothing twice, and `due_soon` / `overdue` are
once per issue without stamping the issue. It is a unique index, so the index policy allows
it, and its leading `user_id` is the inbox's own filter.

**Retention.** Read notifications are deleted after 30 days, unread after 90.
Nothing in the product deletes them on the user's behalf, and this is the
fastest-growing table in the schema. See [Retention](#retention).

### `notification_preferences`

```
notification_preferences(
  user_id → users, kind,     -- kind: the notifications kinds
  email: 'off' | 'instant' | 'daily_digest' | 'weekly_digest' default 'off',
  PRIMARY KEY (user_id, kind)
)
```

Per account, not per organisation, and created lazily: no row means `off`. There is no
`in_app` column: in-app notifications are always on.

**Every activity email is off by default.** Only transactional mail —
invitations, email verification, password reset, ownership transfer, storage
quota warnings — sends without opt-in, and those are not governed by this
table at all. Rationale: unread notification email is pure cost with negative
user value, and the cost is borne personally.

### `notification_digests`

```
notification_digests(
  user_id → users, org_id → organizations,
  cadence: 'daily' | 'weekly',
  sent_at,                     -- the last 9am run that claimed this digest
  PRIMARY KEY (user_id, org_id, cadence)
)
```

One row per person, organisation and cadence. The hourly `email.digest` run claims it with an
upsert that only succeeds when the last claim is older than the period, so a restart inside
the hour cannot send a digest twice; `sent_at` is also where the next digest's window starts.
A claimed run with nothing unread sends nothing.

---

## Organisation audit log

```
org_activity(
  id, org_id,
  actor_id → users NULL,
  kind: 'member_invited' | 'member_joined' | 'member_removed' |
        'role_changed' | 'invite_created' | 'invite_revoked' |
        'project_created' | 'project_archived' | 'project_deleted' |
        'schema_changed' | 'custom_field_changed' |
        'storage_connected' | 'storage_disconnected' |
        'ownership_transferred' | 'org_settings_changed' |
        'export_requested' | 'token_created' | 'token_revoked' |
        'project_updated' | 'project_unarchived' | 'invite_rotated' |
        'username_changed' | 'deletion_scheduled' | 'deletion_cancelled' |
        'storage_updated' | 'tag_renamed' | 'tag_merged' | 'tag_deleted' |
        'git_connection_created' | 'git_connection_removed' |
        'git_connection_error' | 'repository_linked' | 'repository_unlinked' |
        'automation_changed',
  target_type, target_id,
  old_value jsonb NULL, new_value jsonb NULL,
  ip inet NULL, created_at
)
```

Same shape as `issue_activity`, written by the same service layer, covering
everything `issue_activity` does not: who removed a member, who changed a
role, who created or revoked an invite link, who changed project statuses or
custom fields, who connected BYO storage, who transferred ownership.

Three properties that are not optional:

1. **Immutable**, and enforced as such by the database rather than by
   convention: the application's role holds `INSERT` and `SELECT` on this
   table and nothing else (no `UPDATE`, `DELETE` or `TRUNCATE`), provisioned
   and verified as in [infrastructure.md](./infrastructure.md#database-roles).
   Never updated, never deleted, no soft delete. The table cascades from
   `organizations`, so the log survives an organisation only while the
   organisation row is retained.
2. **Never coalesced.** Unlike issue activity, every intermediate state
   matters. A role raised and lowered within a minute is two events.
3. **Must exist from the first migration.** It is impossible to backfill.
   "Who gave this person access?" gets asked exactly once, urgently, and the
   answer has to already be there.

Visible to Org Admins and the Org Owner, filterable by actor, kind and date,
exportable to CSV.

**Targets** (decided 23 Sep 2026, 0c). `target_id` is the internal id as text;
the human-readable names at the time of the event (`username`, project `key`,
`email`) ride in `old_value` / `new_value`, so a later rename never rewrites
what the log says.

| `target_type` | `target_id` | Kinds |
|---|---|---|
| `organization` | org id | `org_settings_changed`, `export_requested` (`export: 'org_activity'` and the filter for the audit log's CSV; 6d: `export: 'org'` and `export_id` for a full export), `deletion_scheduled` and `deletion_cancelled` (6b: `slug` and `deletes_at`), `ownership_transferred` (6b: `owner` username on each side; the actor is the new Owner), `storage_connected` / `storage_updated` / `storage_disconnected` (6c: `provider`, `bucket`, `access_key_id` on the side that has them — the connection after, before, or both for a key rotation; never the secret) |
| `member` | user id | `member_joined`, `member_removed`, `role_changed`, `username_changed` |
| `project_member` | `<project id>:<user id>` | `member_joined`, `member_removed`, `role_changed` |
| `project` | project id | `project_created`, `project_updated`, `project_archived`, `project_unarchived` |
| `invitation` | invitation id | `member_invited` (email), `invite_created` (link), `invite_rotated`, `invite_revoked` |
| `tag` | tag id | `tag_renamed` (`name` on each side), `tag_merged` (the target; `names` of the merged tags before, `name` of the target after), `tag_deleted` (`name`, `issue_count`, `article_count` before; nothing after). A recolour is not logged (6d) |
| `git_connection` | connection id | `git_connection_created`, `git_connection_removed` (7: `connection` name and `provider` after), `git_connection_error` (7: written with no actor when the connection moves into a problem state — `status` before, `status` and `reason` after — once per change, never per failed delivery) |
| `project` (7) | project id | `repository_linked`, `repository_unlinked` — `repository` full name and `project` key after; `automation_changed` — `{project, automation, change: created \| updated \| deleted}` after |
| `custom_field` | field id | `custom_field_changed` — a field or one of its options created, changed, archived or deleted; each side carries `project_key`, `slug`, `name`, `action` and the changed keys (Phase 4) |

Work item attributes and their values record `schema_changed` with `table:
'work_item_attributes'`, as work types do; choosing the Estimation or Spent time field is
`project_updated` (Phase 4).

Every event has its own kind rather than reusing a neighbour's, which would make the log lie:
`project_updated` is not `project_created`, and `storage_updated` (a key rotation) is neither a
new connection nor a disconnection.

**The log keeps what it recorded** (owner, 27 Sep 2026, 6b): an email address or name in an
old entry — an invitation's `email`, say — is never scrubbed, not even when the person's
account is later erased. The audit trail is the point.

---

## Knowledge base

Full design in [knowledge-base.md](./knowledge-base.md).

```
articles(
  id, org_id, project_id,
  parent_id → articles NULL,        -- a tree; a "category" is a parent article
  title, slug,
  body_md          text  default '',
  status: 'draft' | 'published'  default 'draft',
  position         int,             -- order among live siblings, 0…n-1
  created_by, updated_by,
  published_at NULL,                -- the latest publish; kept on unpublish
  search_tsv       tsvector GENERATED ALWAYS AS (A title, B body_md) STORED,
  created_at, updated_at, deleted_at NULL,
  UNIQUE (id, org_id), UNIQUE (id, project_id),
  UNIQUE (project_id, lower(slug)) WHERE deleted_at IS NULL,
  CHECK (parent_id IS NULL OR parent_id <> id),
  GIN (search_tsv)
)

article_tags(article_id, org_id, tag_id, added_at default now(),
             PRIMARY KEY (article_id, tag_id))
article_stars(article_id, org_id, user_id, created_at,
              PRIMARY KEY (article_id, user_id))
article_watchers(article_id, org_id, user_id, source: 'explicit' | 'auto', created_at,
                 PRIMARY KEY (article_id, user_id))
article_issue_refs(article_id, org_id, issue_key text,
                   PRIMARY KEY (org_id, issue_key, article_id))
-- each: FOREIGN KEY (article_id, org_id) → articles ON DELETE CASCADE;
--       article_tags also (tag_id, org_id) → tags; user_id → users RESTRICT

comments.article_id, mentions.article_id, attachments.article_id   NULL
-- each: FOREIGN KEY (article_id, org_id) → articles ON DELETE CASCADE
```

As built in Phase 3.5 (26 Sep 2026):

- **`org_id` on the join tables.** The design sketch left it off `article_stars` and
  `article_watchers`; every tenant-owned table carries it, so they do too.
- **`parent_id` is `NO ACTION`** through `(parent_id, project_id)`, so a parent lives in its
  child's project and deleting a project cascades through the whole tree in one statement.
- **Positions** number a parent's live children `0…n-1`, drafts included. Create, move,
  delete and restore renumber that one sibling list in the same transaction. Moves are
  anchored on a sibling (`before` / `after`), never an index, because a reader who cannot see
  a draft would count differently.
- **Soft delete, restorable for 14 days**, then the nightly purge removes the article with
  its comments, mentions, tags, stars, watchers, references and attachments — every object
  first, as for issues. Deleting an article with children needs a choice: `move_up` puts them
  in its place under its parent; `delete` soft-deletes the whole subtree with one
  `deleted_at`, and restoring the root brings back exactly the articles deleted with it.
  A restored article whose slug was taken meanwhile takes a numeric suffix; one whose parent
  is gone, or under which the branch would exceed depth 3, returns at the top level. A draft
  the deleting caller cannot read is never deleted with the branch: it moves up instead.
- **The slug is set once.** Generated from the title (`articleSlug` in `packages/format`),
  suffixed on collision; renaming keeps it. Only an explicit slug change moves it, and a
  clash there is refused rather than suffixed (owner, 26 Sep 2026).
- **`article_issue_refs` is Referenced by** (owner asked for the cheapest option on a small
  database, 26 Sep 2026). Every save of an article body replaces its rows with the issue keys
  its markdown mentions, as `packages/markdown` extracts them (so a key in a code block does
  not count). An issue page's list is one lookup on the primary key's `(org_id, issue_key)`
  prefix, rather than a full-text query and a re-parse of every candidate body on each view.
  The key is stored as text, not as an issue id, so a key written before its issue exists
  starts counting when the issue does.
- `comments`, `mentions` and `attachments` hang off an article exactly as they hang off an
  issue: a comment or a mention sets `article_id` instead of `issue_id`; a file sets
  `article_id`, plus `comment_id` for a file in an article comment. The article's object
  keys are `api/{org_id}/articles/{article_id}/{public_id}`. At most 50 files per article.


**Articles reuse the organisation-level `tags` table**, the same one issues
use. The tree is one hierarchy; tags are the cross-cutting facet it cannot
express — *"every RCA"*, *"every DevOps runbook"* — which live in different
branches. Sharing the vocabulary means `tag: payment-outage` returns both the
outage issues and the RCA article written afterwards.

Articles form a **tree via `parent_id`**, maximum depth 3, rather than being
assigned to a separate `categories` table. One concept instead of two: a
category is simply an article that has children, which means a category can
carry its own overview content and deleting one has an obvious meaning.

**The slug is unique per project, not per parent.** The MCP resource is
`article://PROJ/<slug>`, a single segment, so a per-parent slug could not
resolve — and a flat namespace means reparenting an article, which is one
drag in the sidebar, never changes its URL. A collision on create takes a
numeric suffix (`overview-2`). The constraint is partial on
`deleted_at IS NULL`, so a deleted article does not squat its slug.

**There is no version history.** Considered and dropped. `updated_at` and `updated_by` record
the last edit; nothing records the one before it. Restoring an earlier draft
is not a capability this product has.

Comments and attachments reuse their existing tables via `article_id`, a
nullable column on `comments`, `attachments` and `mentions`.

The knowledge base is **private to project members**. No public publishing,
no anonymous access, no share-with-anyone link.

---

## Import and export

Built in 6d (10 Oct 2026).

```
import_jobs(
  id bigint PK,
  org_id bigint NOT NULL → organizations ON DELETE CASCADE,
  project_id bigint NOT NULL,          -- (project_id, org_id) → projects ON DELETE CASCADE
  created_by bigint NOT NULL → users,  -- the importer; every row is created as them
  source text NOT NULL DEFAULT 'csv'   CHECK in ('csv'),
  filename text NOT NULL,
  size_bytes bigint NOT NULL,          -- announced at upload; at most 100 MB
  sha256 text NOT NULL,                -- base64, signed into the upload
  object_key text NULL,                -- api/{org_id}/import/{id}/{uuid}; null once the file is deleted
  status text NOT NULL DEFAULT 'awaiting_upload'
        CHECK in ('awaiting_upload','ready','queued','running','completed','failed','expired'),
  headers text[] NULL,                 -- the header row, once read
  column_mapping jsonb NULL,           -- issue field or custom:<slug> → header, set at start
  total_rows integer NULL,             -- at most 10,000
  processed_rows integer NOT NULL DEFAULT 0,   -- rows up to and including the last one written
  created_issues integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',  -- the first 1,000 failed rows: row, column, field, code, message, valid_values
  error text NULL,                     -- why the whole job stopped: a catalogue code
  created_at, updated_at timestamptz NOT NULL DEFAULT now(),
  started_at, completed_at timestamptz NULL
)

export_jobs(
  id bigint PK,
  org_id bigint NOT NULL → organizations ON DELETE CASCADE,
  created_by bigint NOT NULL → users,
  scope text NOT NULL DEFAULT 'org'    CHECK in ('org'),
  format text NOT NULL DEFAULT 'json'  CHECK in ('json'),   -- JSON plus the attachment objects, one .zip
  status text NOT NULL DEFAULT 'queued'
        CHECK in ('queued','running','completed','failed','expired'),
  object_key text NULL,                -- the archive, api/{org_id}/export/{id}/{uuid}, always in platform storage
  size_bytes bigint NULL,
  file_count integer NULL,
  missing_file_count integer NULL,     -- files whose objects were gone or whose own bucket did not answer
  expires_at timestamptz NULL,         -- completed_at + 7 days; then the archive is deleted
  error text NULL,
  created_at, updated_at timestamptz NOT NULL DEFAULT now(),
  started_at, completed_at timestamptz NULL
)
UNIQUE (org_id) WHERE status in ('queued', 'running')   -- export_jobs_one_pending_per_org
```

CSV only in v1. Column mapping, a dry run, per-row errors. Anything more complex is handled by
pointing an agent at the MCP server.

- **An import** is reserved with the file's size and checksum, uploaded straight to the
  platform's private bucket like an attachment, read (`ready`), dry-run as often as wanted,
  then started (`queued` → `running` → `completed` or `failed`). Each row is created in its own
  transaction together with `processed_rows`, so a run that stops resumes after the last row
  written. The file is deleted when the job ends, or after a day if nobody ran it (`expired`).
  Neither the file nor the archive counts toward the storage quota.
- **A full organisation export** is produced by `export.org` and downloaded once it is ready,
  rather than streamed from the request. `org_activity.export_requested` records who asked
  for it. The archive's layout is [file-storage.md § Organisation export](./file-storage.md#organisation-export).
- Both tables' objects are deleted by `org.delete` before the rows go; `import_jobs` cascade
  with their project.

---

## Git integration

Built in 7 (first milestone, 25 Oct 2026): connections, repositories and the webhook delivery
log. Branches, commits, pull requests, links and automations follow in later milestones of the
same sub-phase, each in its own migration.

```
git_connections(
  id bigint PK,
  org_id → organizations ON DELETE CASCADE,
  provider text,                        -- 'github' | 'gitlab'; no CHECK, see below
  base_url text,                        -- https://github.com, https://gitlab.com or a self-hosted origin
  auth_kind text CHECK in ('app_installation','token','manual'),
  installation_id text NULL,            -- an app installation
  account_login text, account_avatar_url text NULL, account_url text,
  token_ciphertext text NULL,           -- sealed, purpose git_connection
  hook_id_hash bytea NULL UNIQUE,       -- SHA-256 of the hook URL's id
  hook_secret_ciphertext text NULL,     -- sealed {hook_id, secret}, purpose git_hook
  status text DEFAULT 'active' CHECK in ('active','suspended','token_expired','failing','revoked'),
  last_error text NULL CHECK in ('signature','processing','token_invalid','token_expired','suspended','uninstalled'),
  last_event_at timestamptz NULL,
  token_expires_at timestamptz NULL,
  created_by → users, created_at, updated_at,
  revoked_at timestamptz NULL,
  UNIQUE (id, org_id),
  UNIQUE (provider, base_url, installation_id) WHERE revoked_at IS NULL AND installation_id IS NOT NULL,
  UNIQUE (org_id, provider, base_url, lower(account_login)) WHERE revoked_at IS NULL
)

git_repositories(
  id bigint PK,
  org_id → organizations ON DELETE CASCADE,
  connection_id,                        -- (connection_id, org_id) → git_connections ON DELETE CASCADE
  provider_repo_id text,                -- the provider's own id, which survives a rename
  full_name text, html_url text, default_branch text,
  is_private boolean, is_archived boolean DEFAULT false,
  provider_webhook_id text NULL,        -- the hook we registered (token connections)
  webhook_status text DEFAULT 'not_applicable' CHECK in ('active','failing','missing','not_applicable'),
  webhook_last_status_code integer NULL,
  match_all_projects boolean DEFAULT false,
  merge_base_branches text[] NULL,      -- NULL follows default_branch; globs allowed
  last_event_at timestamptz NULL,
  backfill_state jsonb NULL,
  created_at, updated_at,
  removed_at timestamptz NULL,          -- gone from the installation, or deleted at the provider
  UNIQUE (id, org_id), UNIQUE (connection_id, provider_repo_id)
)

project_repositories(
  project_id, repository_id, org_id → organizations ON DELETE CASCADE,
  linked_by → users, linked_at,
  PRIMARY KEY (project_id, repository_id)
  -- (project_id, org_id) → projects and (repository_id, org_id) → git_repositories, both ON DELETE CASCADE
)

git_webhook_events(
  id bigint PK,
  org_id → organizations ON DELETE CASCADE,
  connection_id,                        -- (connection_id, org_id) → git_connections ON DELETE CASCADE
  repository_id NULL,                   -- (repository_id, org_id) → git_repositories ON DELETE CASCADE
  provider_repo_id text NULL,           -- from the payload, kept when no repository row matches yet
  delivery_id text, event_name text,
  received_at, processed_at timestamptz NULL,
  status text DEFAULT 'pending' CHECK in ('pending','done','ignored','failed'),
  error text NULL,                      -- the ignored reason or the failure, as a code
  attempts smallint DEFAULT 0, next_attempt_at timestamptz NULL,
  run_automations boolean DEFAULT false,
  payload jsonb, truncated boolean DEFAULT false,
  UNIQUE (connection_id, delivery_id)
)
```

**`provider` has no CHECK.** The API's provider registry is the list of providers; the service
refuses a kind the registry lacks. Adding a provider is one module and one entry in
`GIT_PROVIDER_KINDS`, with no migration (owner, 25 Oct 2026).

**A connection is never deleted.** Disconnecting stamps `revoked_at`, sets `status: revoked`
and nulls the token, the hook hash and the hook secret; the row, its repositories and their
links stay so history keeps its attribution. An app uninstalled at the provider is revoked the
same way with `last_error: uninstalled`. The two partial keys therefore cover live rows only: a
reinstalled app or a reconnected account gets a new row.

**Names.** A connection is addressed as `provider:account` (`github:acme-inc`), with `@host`
when its `base_url` is not the provider's own (`gitlab:acme@gitlab.example.com`). A repository is
its `full_name`; when two connections have one of that name, the provider prefixes it
(`gitlab:acme/web`).

**Secrets.** The token and the hook's shared secret are sealed as `org_storage_configs` seals its
key (`seal` in `@lib/crypto`): AES-256-GCM under an HKDF subkey of `ENCRYPTION_MASTER_KEY`, purposes
`git_connection` and `git_hook`, the row `git_connections:<id>` as additional data. Neither is
returned by any route; the hook secret is shown once, at creation and at rotation. The hook URL's
id is looked up by its hash, like a token, but is sealed beside the secret too, because
registering the hook on a repository linked later needs the URL again.

Second milestone (links, 25 Oct 2026, migration `0002_git_links`):

```
git_branches(id, org_id, repository_id, name, head_sha NULL, created_at, updated_at, deleted_at NULL,
  UNIQUE (id, org_id), UNIQUE (repository_id, name))
git_commits(id, org_id, repository_id, sha, message_subject, message_full NULL (first 4 KB),
  author_name, author_email, author_login NULL, author_provider_id NULL, author_user_id → users NULL,
  committed_at, html_url, superseded_at NULL, created_at,
  UNIQUE (id, org_id), UNIQUE (repository_id, sha))
git_pull_requests(id, org_id, repository_id, number, title,
  state CHECK in ('draft','open','merged','closed'),
  author_login NULL, author_provider_id NULL, author_avatar_url NULL, author_user_id → users NULL,
  head_repo_full_name NULL, head_ref, head_sha, base_ref, merge_commit_sha NULL,
  merged_by_login NULL, merged_by_user_id → users NULL, is_revert, html_url,
  review_state CHECK in ('none','review_requested','approved','changes_requested'), reviewers jsonb,
  ci_state CHECK in ('none','running','passing','failing'), ci_summary jsonb,
  commits_fetched_for_sha NULL, commits_total NULL, additions/deletions/changed_files NULL,
  provider_updated_at, opened_at, merged_at NULL, closed_at NULL, created_at, updated_at,
  UNIQUE (id, org_id), UNIQUE (repository_id, number))
git_pull_request_commits(pull_request_id, commit_id, org_id, PRIMARY KEY (pull_request_id, commit_id))
git_checks(id, org_id, repository_id, sha, external_id, name,
  status CHECK in ('queued','in_progress','completed'), conclusion NULL CHECK in (…GitHub's eight…),
  details_url NULL, started_at NULL, completed_at NULL, updated_at,
  UNIQUE (repository_id, sha, external_id))
issue_git_links(id, org_id, issue_id, repository_id,
  target_type CHECK in ('branch','commit','pull_request'), target_id,
  sources text[], intent CHECK in ('mention','closes','revert'), removed_sources text[] DEFAULT '{}',
  created_by → users NULL, created_at, updated_at, removed_at NULL, removed_by → users NULL,
  UNIQUE (issue_id, target_type, target_id))
git_identities(id, user_id → users, provider, base_url, provider_user_id NULL, login NULL, email NULL,
  verified_by CHECK in ('provider','email','claim'), verified_at NULL, created_at,
  UNIQUE (provider, base_url, provider_user_id) WHERE provider_user_id IS NOT NULL,
  UNIQUE (provider, base_url, lower(login)) WHERE login IS NOT NULL,
  UNIQUE (lower(email)) WHERE email IS NOT NULL AND verified_at IS NOT NULL,
  CHECK (num_nonnulls(provider_user_id, login, email) >= 1))
```

Every repository-owned table keys `(repository_id, org_id)` → `git_repositories` and cascades;
`git_pull_request_commits` keys both sides the same way; `issue_git_links` keys `(issue_id,
org_id)` → `issues` and `(repository_id, org_id)` → `git_repositories`. `target_id` names a row of
the table `target_type` says, so it has no foreign key: `git.purge` deletes a commit or pull
request and its link rows in one statement. `git_identities` has no `org_id`, as `users` has
none: an identity is a person's, and matches inside an organisation only while its owner is a
member there.

**What is stored.** A branch, commit or pull request is stored only when it references an issue
of a project the repository is linked to (every project of the organisation with
`match_all_projects`), or belongs to a pull request that does; a push naming no issue writes
nothing but its delivery row. Nothing is ever created from git: a key whose number does not exist
is dropped; a soft-deleted issue's links are kept and hidden until it is restored.

**References.** A key matches case-insensitively when not glued to other text:
`(?<![A-Za-z0-9_-])(KEYS)-(\d{1,7})(?![A-Za-z0-9_/])`, so `feat/ph-675-login`, `[PH-675]` and
`(ph-675)` match and `alpha-ph-675`, `ph-675x`, `ph-675/notes` do not; the web app's own issue
URLs count too. A closing keyword (`close`, `fix`, `resolve`, `implement` and their `-s`/`-d`
forms, optional colon) closes its own run of keys, `Fixes PH-1, PH-2 and PH-3`. A pull request
body's code is not read; at most 50 references per text (`packages/format`, `findIssueReferences`).

**Links follow their sources.** Each link records which texts named the issue (`branch_name`,
`commit_message`, `pr_title`, `pr_body`, `pr_commits`, `merge_commit`, `manual`); every event
recomputes the sources it knows and keeps the rest. A link left with none is removed
(`removed_at`, `git_unlinked`); `manual` goes only by a person. A link a person removes keeps
`removed_sources`, and comes back only for a source it did not have then — for a pull request's
commits, commits pushed after the unlink (recorded as `pr_commits@<head sha>`). A link the system
removed (its last source went) comes back as soon as any source names the issue again. A merged pull
request's merge commit is linked to every issue the pull request is (`merge_commit`), so a squash
whose message lost the key still shows what landed. A force push supersedes the commits the
provider's compare says are gone (`superseded_at`), which unlinks their `commit_message` links;
GitLab does not say a push was forced, so every push to a stored branch is compared there.

**Order and staleness.** A pull request event older than the stored row's `provider_updated_at`
changes nothing (the nightly reconcile catches up); checks are keyed by commit and kept for any commit of a linked repository (a check may arrive
before the pull request moves to its commit), and a report older than the stored one is dropped,
so a late event for an old head never moves the current rollup.

**Rollups** are computed when read, from the live links: CI per pull request over its head's
checks (`failing` > `running` > `passing` > `none`), review as the latest review per reviewer
(`changes_requested` > `approved` with none pending > `review_requested` > `none`), and the issue's
badge (`reverted`, `merged`, `ci_failing`, `changes_requested`, `approved`, `in_review`, `draft`,
`branch_active`, `none`), carried on the issue and the board card.

**Authors.** A commit or pull request author maps to a member, at write time, by provider user id
(a claimed identity, or sign-in's GitHub id on github.com, read only), a GitHub `noreply` address,
the account's verified email, then a claimed email or login; else the provider's login shows.

**Deliveries.** Every accepted delivery is a row, applied by a per-repository job in the order
received; a duplicate delivery id inserts nothing. A delivery over 1 MB is stored trimmed
(per-commit file lists dropped, the first 100 commits kept) or, if still too large, as `{}`,
with `truncated`. A failed apply is retried after 1, 4, 16 and 64 minutes and is `failed` after
the fifth attempt; a replay resets `attempts` and `processed_at`.

### Automations

Built in 7 (third milestone, 25 Oct 2026). A rule of one project: one trigger, conditions, one
action. A change it makes is written as the system (`issue_activity.actor_id` NULL) with
`automation_run_id` set, and its snapshot names the rule and the cause:
`{"name": "Fixed", "automation": "Close on merge", "cause": "acme/web#42 was merged by @alex"}`.

```
automations(
  id bigint PK, org_id → organizations ON DELETE CASCADE,
  (project_id, org_id) → projects (id, org_id) ON DELETE CASCADE,
  name text,                         -- unique per project, case-insensitive
  trigger text,                      -- 'git.pull_request_merged', … : the API's catalogue, no CHECK
  conditions jsonb default '{}',     -- only what was set; the catalogue holds the defaults
  action text,                       -- 'issue.set_status'; no CHECK, same reason
  action_params jsonb default '{}',  -- {"status": "Fixed"}: the status by name, as the project spells it
  is_enabled boolean default true,
  position smallint default 0,       -- evaluation order, lowest first
  created_by → users, created_at, updated_by → users, updated_at,
  UNIQUE (id, org_id),
  UNIQUE (project_id, lower(name))
)

automation_runs(
  id bigint PK, org_id → organizations ON DELETE CASCADE,
  (automation_id, org_id) → automations (id, org_id) ON DELETE CASCADE,
  (issue_id, org_id) → issues (id, org_id) ON DELETE CASCADE,
  trigger_ref jsonb,                 -- what fired it, readable: {"pull_request": "acme/web#42", "cause": "…"}
  caused_by → users NULL,            -- the member whose git action fired it: not notified of the change
  result text CHECK in ('applied','skipped','failed'),
  reason text NULL,                  -- 'already_in_status' | 'condition_not_met' | 'archived_project' | 'status_missing'
  changes jsonb NULL,                -- {"status": {"from": "In Review", "to": "Fixed"}} when applied
  created_at
)
```

- **Rules run after the event's writes commit**, in `position` order for the trigger; the first that
  changes the issue ends the evaluation. Every rule looked at leaves a run, skipped ones too.
- **Depth one.** A change an automation makes fires no rule. `issue.children_resolved` fires only
  when a person resolves the last open subtask.
- **Conditions read live state**, not the event's snapshot: the issue's status category and type,
  its other linked pull requests (`all_linked_merged`, `no_other_open_prs`), the repository's merge
  base branches.
- **A renamed status is followed**: renaming it rewrites `action_params.status` in every rule of the
  project that sets it. An archived or deleted status leaves the rule pointing nowhere; its runs skip
  with `status_missing`.
- **Webhook deliveries run rules** only when received live or replayed with `run_automations` (and a
  replay fires only on what it changes: stored state already moved fires nothing again);
  backfill, the nightly reconcile and a manual link never do.

## Tables defined in other documents

This document is the map of the schema, so the tables specified elsewhere are
named here rather than left to be discovered.

| Table | Defined in |
|---|---|
| `sessions` | [auth-and-tenancy.md](./auth-and-tenancy.md) |
| `personal_access_tokens`, `personal_access_token_projects` | [auth-and-tenancy.md § Personal Access Tokens](./auth-and-tenancy.md#personal-access-tokens) |
| `webhooks`, `webhook_deliveries` | [notifications.md § Webhooks — v2](./notifications.md#webhooks--v2) (not built in v1) |

**A token's project restriction is a junction** (1 Oct 2026). The mode is
`personal_access_tokens.restricted boolean NOT NULL DEFAULT false`; the list is
`personal_access_token_projects (token_id, project_id, org_id)`, primary key
`(token_id, project_id)`, `token_id` → `personal_access_tokens` and `(project_id, org_id)` →
`projects (id, org_id)`, both `ON DELETE CASCADE`, plus the plain `org_id` → `organizations` key.
A deleted project therefore leaves no dangling id, and **a restricted token whose last project
is deleted allows no project; it never becomes unrestricted.** `restricted = false` means every
project the owner can reach, and such a token has no junction rows. No index beyond the primary
key: every read starts from a token.

---

## Retention

Nothing in the product deletes these on a user's behalf, so a job does.

| Table | Policy | Job |
|---|---|---|
| `articles` (soft-deleted) | hard-deleted 14 days after `deleted_at`, with their comments, mentions, tags, stars, watchers, references and attachments; objects first | `issues.purge`, nightly |
| `issues` (soft-deleted) | hard-deleted 14 days after `deleted_at`, with their comments, work items, attachments and `issue_activity`; every attachment object — platform bucket and a customer's own — is deleted first, and the bytes released | `issues.purge`, nightly |
| `attachments` | pending uploads after 1 hour, unclaimed drafts after 2 days, deleted files at the next run: object first, then the row. A file in the organisation's own bucket is deleted there through its verified connection; a disconnected bucket's file loses only its row; a failing connection's files wait for it (6c) | `attachments.sweep`, hourly |
| `organizations` (deletion scheduled) | rows (`org_storage_configs` and `org_storage_locations` included) and platform-bucket objects deleted 14 days after `deletion_scheduled_at` unless cancelled; objects in the organisation's own bucket are never touched; the org row and `org_activity` stay | `org.delete`, hourly at :45 (reminder: `org.deletion_reminder`, hourly at :40) |
| `notifications` | read 30 days after reading, unread 90 days after writing | `notifications.purge`, nightly at 03:15 UTC |
| `webhook_deliveries` (v2) | 30 days | `webhooks.purge`, nightly |
| `git_webhook_events` | 7 days after `received_at`, whatever their status (7) | `git.purge`, nightly at 03:20 UTC |
| `automation_runs` | 90 days after `created_at`; history rows keep their own snapshot and lose only the link (7) | `git.purge`, nightly at 03:20 UTC |
| `git_checks`, `git_commits`, `git_pull_requests` | checks of a commit that heads no pull request after 7 days; superseded commits after 30; commits and pull requests no live link has needed for 90 days, with their link rows (7) | `git.purge`, nightly at 03:20 UTC |
| `one_time_tokens` | on expiry | `tokens.gc`, hourly |
| `sessions` | on expiry | `session.gc`, hourly |

`webhook_deliveries` stores a full request payload per attempt and grows
faster than anything else listed here.

`org_activity` is never purged, and `issue_activity` only goes with the issue
it belongs to — they are the audit trail, and the questions they answer are
asked years later. There is no
`article_versions` table to purge.

---

## Enforced in the application layer

These invariants live in the service layer: the API is the only writer, and it
is where each gets its readable error. An invariant with no constraint behind it
needs a test, and this is the list that suite is built from. Every one that a
UNIQUE key or a row-local CHECK can state is also a constraint, named in the
third column (decided 1 Oct 2026). The service still checks
first; the constraint turns a writer bug, or a race between two requests, into a
refused write instead of a bad row. A counter that drifts negative fails
loudly, which is the point.

| Invariant | Guards | Constraint |
|---|---|---|
| Exactly one parent is set | `comments` (issue XOR article), `mentions` (3.5) | — the one deliberate omission, below |
| An attached file names its issue or its article, never both; `comment_id` with either, `work_item_id` only with `issue_id`; a draft names none of them | `attachments` (1f, 25 Sep 2026; articles 3.5) | `attachments_parent_shape_check`; that the comment or work item belongs to the named issue stays here |
| Names are unique per project, case-insensitively | `workflow_statuses`, `priorities`, `issue_types`, `work_types`, `sprints`, `boards`, `custom_fields`, `work_item_attributes`; per field `custom_field_options`, per attribute `work_item_attribute_values` | `<table>_project_lower_name_unique`, `custom_field_options_field_lower_name_unique`, `work_item_attribute_values_attribute_lower_name_unique`; a violation answers the table's `*.name_taken` |
| An organisation has at most one export queued or running | `export_jobs` (6d, 10 Oct 2026) | `export_jobs_one_pending_per_org`, a partial unique index; a second request answers the pending export |
| A value row uses the column its field's type names, and a single-value field has one row | `issue_field_values` (Phase 4) | the one-column CHECK only |
| A custom field slug means one kind of value across the organisation; at most 50 live fields per project | `custom_fields` (Phase 4) | — the registry is deferred; creating a field takes a transaction-scoped advisory lock on (organisation, slug) before the check, so two projects cannot claim one new slug with different kinds at once |
| The Estimation and Spent time fields are two different `duration` fields | `projects.estimation_field_id`, `spent_time_field_id` (Phase 4) | `projects_time_fields_distinct_check` (different); the type is the service's |
| A work item's work type and attribute values belong to its issue's project | `work_items`, `work_item_values` (Phase 4) | `work_items_issue_project_fk`, `work_items_work_type_project_fk`, `work_item_values_work_item_project_fk`, `work_item_values_attribute_project_fk` |
| Exactly one `is_default` per project, never an archived one | `workflow_statuses`, `priorities`, `issue_types`, `work_types` | `<table>_one_default_per_project` (at most one); `workflow_statuses_default_not_archived`, `work_types_default_not_archived`; at least one is the service's, serialised on the project row |
| A new or renamed saved view's name matches no view its author can already see, case-insensitively | `saved_views` — so `#{View name}` resolves to one view for its author; a reader who sees two of one name gets their own first, then the project's, then the organisation's (decided 24 Sep 2026) | — visibility decides who sees a name, so no key fits |
| A `project` saved view names its project | `saved_views` | `saved_views_project_visibility_check` |
| A token carries what its purpose needs: a transfer its organisation and offerer, an email change its new address | `one_time_tokens` | `one_time_tokens_transfer_fields_check`, `one_time_tokens_email_change_check` |
| One open ownership transfer per organisation | `one_time_tokens` (6b) | `one_time_tokens_one_open_transfer_per_org` |
| A person is mentioned once per source | `mentions` | `mentions_source_user_unique`; that `source_id` exists is the service's |
| A board's `swimlane_field` is set exactly when its lanes are `values` | `boards` | `boards_swimlane_field_mode_check` |
| No self-reference | `issue_links.from ≠ to`, `issues.parent_id ≠ id`, `articles.parent_id ≠ id` | `issue_links_from_issue_id_check`, `issues_parent_id_check`, `articles_parent_id_check` |
| Symmetric links are stored once | `issue_links` — `relates` between A and B, not also B and A | — |
| No cycles | `issue_links` of type `depends`, and the `parent_id` tree | — |
| Hierarchy depth ≤ 3 | `issues.parent_id`, `articles.parent_id` | — |
| A parent article is live and in the same project | `articles.parent_id` — the key covers the project, the service covers `deleted_at` | `articles_parent_project_fk` |
| Sibling positions are `0…n-1` | `articles.position` | — |
| An article's reference rows match the keys in its body | `article_issue_refs` | — |
| Stated size limits | title ≤ 500 characters; `description_md`, article bodies and comment bodies ≤ 256KB; work-item notes ≤ 16KB | — |
| Sane numbers | `duration_minutes > 0`, `estimate_minutes ≥ 0`, `0 ≤ story_points ≤ 999`, counters ≥ 0, `size_bytes ≥ 0`, image sides > 0, a snapshot's completed ≤ its total | `work_items_duration_minutes_check`, `issues_estimate_minutes_check`, `issues_story_points_check`, `issues_spent_minutes_check`, `issues_vote_count_check`, `issues_comment_count_check`, `projects_issue_counter_check`, `organizations_storage_used_bytes_check`, `attachments_size_bytes_check`, `attachments_width_check`, `attachments_height_check`, the six `sprint_snapshots_*_check` |
| A working day is 1–1440 minutes, a week 1–7 days | `organizations` | `organizations_workday_minutes_check`, `organizations_workweek_days_check` |
| Sane dates | `start_date ≤ due_date`, sprint `start_date ≤ end_date` | `issues_start_date_check`, `sprints_start_date_check` |
| A sprint takes issues of its own project only while not completed; only a planned sprint is deleted | `issues.sprint_id`, `sprints` | the project half is `issues_sprint_project_fk` |
| WIP limits `1…999`, `wip_min ≤ wip_max`; at most 20 columns per board | `board_columns` | `board_columns_wip_min_check`, `board_columns_wip_max_check`, `board_columns_wip_order_check`; the column cap is the service's |
| Colours are palette token names | every `color` column: the 40 label-grid names for statuses, priorities, types and tags; the 14 hues for project avatars | — |
| Invite limits | `use_count ≤ max_uses`, `expires_at` in the future | — a moving clock is no CHECK |
| Quotas | 5GB per organisation on `free` (the plan's quota), 100MB per file, 50 attachments per issue and per article — pending uploads count toward both the quota and the 50; with a verified bucket of its own an organisation has no storage quota, while the other limits still apply (6c) | — |
| One live connection per app installation across every organisation; one per account per organisation | `git_connections` (7) | `git_connections_installation_unique`, `git_connections_org_account_unique` (partial, live rows); a second claim of an installation answers `git.installation_already_connected` without naming the holder |
| Git plan caps: on `free`, 2 live connections per organisation and 10 linked repositories per project | `git_connections`, `project_repositories` (7) | — counted by the service |
| A `byo` attachment is served, and its object deleted, only through a verified connection whose location is the row's | `attachments`, `org_storage_configs` (6c) | which location a file is at: `attachments_storage_location_org_fk`, `attachments_storage_location_check` |

One of these could be a constraint and deliberately is not: the one-parent rule
on `comments` and `mentions` (a `CHECK (num_nonnulls(issue_id, article_id) = 1)`).
The service is its only writer and already produces the readable error for it.
The rest of the "—" rows span rows or the clock — cycles, depth, positions,
quotas, expiry — which no row-local CHECK can state.
