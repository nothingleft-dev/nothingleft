# Limits, Quotas and Billing Posture

No payment code exists in v1. What exists is honest signposting, so nobody is
surprised later.

**Beta messaging:** teams of any size can join without a subscription charge
while billing is absent. The first 20 members remain free permanently. Any
future charge for additional seats needs advance notice before it takes effect.
The platform file-storage limit still applies during beta; connecting a
verified own bucket lifts that limit.

## Plans

A plan is a **limit preset** on `organizations.plan`, nothing more — no billing,
no feature gating.

| Plan | Seats | Storage | Git | Availability |
|---|---|---|---|---|
| `free` | 20, then the seat notice | 5GB, or BYO | 2 connections, 10 linked repositories and 10 automations per project | **Public** — every new organisation starts here |
| `pro` | 20, then the seat notice | 50GB, or BYO | Unlimited | Public, **not offered yet** |
| `pro_lite` | Unlimited | 5GB, or BYO | Unlimited | **Private** — set by the platform operator only |
| `unlimited` | Unlimited | 250GB, or BYO | Unlimited | **Private** — set by the platform operator only |

- **Public** means selectable at sign-up; **private** means only the platform
  operator assigns it, directly in the database — there is no admin console
  (permissions.md § Deliberately not implemented).
- Presets live in `packages/types` as one constant. `FREE_SEAT_LIMIT` and
  `FREE_STORAGE_BYTES` override the `free` row for self-hosters
  (infrastructure.md § Environment configuration).
- Changing a plan writes an `org_settings_changed` row to `org_activity`.
- Avatars never count toward storage; they live in the public bucket
  (file-storage.md § Two buckets).

Everything below describes the `free` plan. The other plans differ only in
the numbers above.

The git caps (owner, 25 Oct 2026) are checked where the write happens: a third live connection
answers `409 git.connection_limit_reached`, an eleventh repository linked to one project
`git.repository_limit_reached`, an eleventh automation in one project `automation.limit_reached`,
each with the `limit`. A disconnected connection does not count. Lowering a plan removes nothing;
it only refuses the next one.

## Seats

**20 members per organisation, free, permanently.**

Members beyond the 20th are **allowed**. The join or invite succeeds; nothing
is blocked. What happens instead:

- The invite dialog, from the 20th member onward, shows:
  > *Adding your 21st member. The first 20 members of every organisation are
  > free forever. Seats beyond that will cost around $5/user/month once
  > billing launches — we'll give you plenty of notice first.*
- Organisation settings show a persistent (not dismissible-forever) banner to
  org admins stating the current member count and how many are beyond the
  free allowance.
- Nothing degrades. No feature is withheld, no read-only mode, no countdown.

When billing does launch, existing organisations keep their first 20 seats
free. That promise is stated in the product.

## Storage

**5GB per organisation on the `free` plan. A hard cap** (50GB on `pro`,
250GB on `unlimited`; `pro_lite` shares the free cap).

There is **no purchase path**. A user at the limit has exactly two options:

1. Delete existing files.
2. Connect their own Cloudflare R2 or AWS S3 credentials → unlimited.

Progressive warnings:

| Usage | Behaviour |
|---|---|
| 80% | Banner in org settings and above an issue's Attachments section, not above every editor |
| 95% | Banner escalates; one email to org admins (transactional, not subject to notification preferences) |
| 100% | Presign requests refused. The error names the two options and links to both. |

Accounting: `organizations.storage_used_bytes` is updated in the same
transaction as the `attachments` row, on both upload completion and delete.

- **Uploads in flight count.** The check at presign is
  `storage_used_bytes + bytes of pending uploads + size ≤ quota`, under a lock on the
  organisation row, so two uploads can never both fit the last free space. A pending upload
  that is never completed gives its reservation back when the hourly sweep removes it.
- **Each email goes out once per crossing.** The 95% email is sent by the completion that
  crosses 95%; the 100% email by the first refused upload. Both go to Org Admins and the
  Owner through `bestEffort`, so a failed send never fails the upload.
  `organizations.storage_notice_level` remembers which was sent; a delete (or sweep, or
  purge) that leaves usage below 95% re-arms both.
- **Every member sees usage**: the Organization carries
  `storage: { used_bytes, limit_bytes, level, configured }`, `level` being `ok`, `warning`
  (80%), `critical` (95%) or `full` (100%), for the banners; `configured` is false where the
  server has no private bucket, so the web hides upload rather than waiting for a
  `503 storage.not_configured`.
- The refusal is `409 storage.quota_exceeded`, whose message names both ways out.
A nightly reconciliation job recomputes it from the attachments table and
logs any drift — so a bug cannot silently under-count someone into a surprise
overage.

A storage usage screen lists files by size with a delete action, so "delete
existing media" is a real option rather than a suggestion.

- **`storage.reconcile`, nightly at 03:30 UTC.** For every organisation, under the lock on
  its row: `storage_used_bytes` is set to the sum of its completed, undeleted platform files;
  a difference is logged (`warn`, with the organisation id and the drift) and emitted as
  `storage_reconciled`. The notice level then follows the true figure: below 95% it re-arms
  (0); at or above 95% with no email sent yet it rises to 95 and the 95% email goes out, once
  — unless the organisation's own bucket is verified. No email about the drift
  itself: that is a bug of ours, not news for the customer. The same job probes every
  connected bucket and re-queues a stalled migration ([file-storage.md](./file-storage.md#bring-your-own-storage)).
- **The usage screen** (`/organization?tab=storage`, `GET /v1/organizations/{slug}/storage`
  and `…/storage/files`) is for **Org Admins and the Owner only**: they receive the
  storage emails and they can already delete any file. Every member still sees the meter on
  the Organization. The list is completed files on an issue, comment, work item or article,
  largest first (or newest), paged, filterable by project and by bucket, each with what holds
  it; deleting is the ordinary attachment delete. Drafts are counted in *Unclaimed uploads*
  but never listed — they are their uploader's alone. A file on a deleted issue or article is
  listed with the date its restore window closes and cannot be deleted from here; its bytes
  are shown as *Awaiting purge*.

## Bring your own storage

Org Admins and the Org Owner can connect their own Cloudflare R2 or AWS S3
bucket. On verification the quota lifts **immediately** — not on migration
completion — so a blocked user can unblock themselves in under a minute.

Full flow, credential handling and migration behaviour:
[file-storage.md](./file-storage.md#bring-your-own-storage).

Under BYO storage, storage is unlimited. Per-file limits below still apply,
since those exist for upload reliability rather than cost.

- **Nothing in the customer's bucket counts.** `storage_used_bytes` keeps counting only
  what is still on the platform, and falls as the migration moves files out. While the
  connection is verified the level stays `ok`, uploads are never refused for space and
  neither storage email goes out.
- **The owner still sees what they hold**: the usage screen shows the files and bytes in
  their own bucket, summed on read — shown, never limited.
- **A failing key does not fall back to the platform.** Uploads are refused with
  `storage.byo_unavailable` until an admin fixes the key; falling back would silently fill
  the platform quota.
- **After a disconnect** the quota applies again from what is on the platform, which is
  usually nothing once a migration finished.

## Other limits

| Limit | Value | Reason |
|---|---|---|
| Max file size | 100MB | Practical upload reliability |
| Max attachments per issue | 50 | Sanity |
| Max issues per bulk operation | 500 | Transaction and timeout safety |
| Max custom fields per project | 50 | UI legibility |
| Max projects per org | unlimited | No reason to cap |
| Max tags per org | unlimited | Slug uniqueness already prevents sprawl |
| API rate limit (signed out) | 60 req/min | `RATE_LIMIT_MAX_ANONYMOUS` |
| API rate limit (session) | 300 req/min | `RATE_LIMIT_MAX_PER_SESSION` |
| API rate limit (PAT) | 600 req/min | `RATE_LIMIT_MAX_PER_PAT`; agents burst, humans do not |
| Global search results per request | 5 by default, 50 at most | `GLOBAL_SEARCH_DEFAULT_LIMIT`, `GLOBAL_SEARCH_MAX_LIMIT` |
| Items per page in paginated lists | 200 at most | `PAGINATION_MAX_LIMIT` |

Rate limits are returned in response headers so well-behaved clients can pace
themselves rather than discovering the limit by hitting it.

## Self-hosting

Everything above is configuration, not code:

```
FREE_SEAT_LIMIT=20
FREE_STORAGE_BYTES=5368709120
```

A self-hoster sets both to any positive whole number (`apps/api/src/config/env.ts`
rejects zero, negatives and non-numbers at boot); there is no switch that turns the
checks off, so a very large value is the way to lift them. The AGPL licence means the self-hosted build is the same build —
there is no crippled community edition.
