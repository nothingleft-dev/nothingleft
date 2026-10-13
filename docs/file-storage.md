# File Storage

Upload, private serving, and bring-your-own storage.

Quota rules live in [limits-and-billing.md](./limits-and-billing.md).

## Principles

1. **Every attachment is private.** The private bucket has no public access.
   A leaked URL is worthless without a valid session. The one public bucket
   holds avatars and nothing else.
2. **Bytes never pass through the API.** Uploads go browser → storage;
   downloads go storage → browser. The API only authorises.
3. **Markdown stores a permanent URL.** Never a presigned one.

## Two buckets

Decided 22 Sep 2026.

| | Public bucket | Private bucket |
|---|---|---|
| Holds | User avatars (display pictures) only | Everything else: attachments on issues, comments, work items and articles; export archives; import files |
| Access | Public read via the R2 custom domain `static.nothingleft.dev`; write only through the API's presigned PUT | No public access; authorised redirect to a presigned URL, see [Serving](#serving--the-part-that-is-easy-to-get-wrong) |
| Counts toward the organisation's storage quota | **No** | **Yes** |
| Bring your own storage | Not replaceable | Yes, per organisation |
| Env | `S3_PUBLIC_BUCKET`, `S3_PUBLIC_BUCKET_BASE_URL` | `S3_PRIVATE_BUCKET`, `FILES_BASE_URL` |
| Object key | `web/avatar/{user_id}/{uuid v4}.{ext}` | `api/{org_id}/{module}/{module_id}/{public_id}` |

Private-bucket keys, by module: `api/1/issues/2/<public_id>` for an issue
attachment, `api/1/comments/9/…`, `api/1/work-items/4/…`, `api/1/articles/7/…` (3.5: a file on
an article, 50 at most per article; one on a comment of an article uses the comment's key),
`api/1/export/2/…` for an export archive, `api/1/import/3/…` for an uploaded
CSV (both always on the platform and outside the quota — [§ CSV imports](#csv-imports),
[§ Organisation export](#organisation-export)). Rules:

- **No project segment.** Issues move between projects; a key that named the
  project would lie after the move. `org_id` is enough for tenant grouping,
  and it makes BYO migration and organisation export a single prefix listing:
  `api/{org_id}/`.
- **The object is named by `attachments.public_id`**, never by the user's
  filename. Filenames carry unicode, length limits and collisions; the real
  name lives in the row and is applied at download through
  `response-content-disposition`.
- **Moving an issue never rewrites keys.** `attachments.bucket` and
  `object_key` on the row are the source of truth; the key is an address.
- The `web/` and `api/` prefixes exist so a listing shows at a glance which
  side wrote an object.

## Avatars

The chain, in priority order — the first that exists wins:

1. **Manual upload** — `users.avatar_object_key` in the public bucket, via
   presigned PUT from the profile page (`image/png`, `image/jpeg`,
   `image/webp`, ≤ 2MB, resized client-side to 256px). The limits hold on the
   stored bytes, not only on what the browser declared: see below.
2. **Provider avatar** — the Google or GitHub URL captured at OAuth login.
3. **Gravatar** — `https://gravatar.com/avatar/<sha256(email)>?d=404`,
   checked once server-side at account creation and on OAuth login; kept only
   if it answers `200`.
4. **Generated initials** — `<API_BASE_URL>/avatars/person?seed=<name>`, an SVG the API
   renders itself with DiceBear's `initials` style (`@dicebear/core`, no hosted service) on the
   pastel set of design/DESIGN-SYSTEM.md § 3.4, from `AVATAR_PASTEL_BACKGROUNDS` in
   `apps/api/src/config/constants.ts`.

Steps 2–3 resolve into `users.avatar_url` at write time, so rendering never
probes anything. Step 1 overrides at read time, and step 4 fills in at read time when
`avatar_url` is empty, from the current name, so a rename needs no rewrite.

**What leaves for a third party.** A provider avatar is the URL Google or GitHub gave us
until `avatar.mirror` copies it. Gravatar receives the SHA-256 of the address, once, from the
API, and then the browser loads the Gravatar image for anyone who has one. Nothing else: the
generated marks, for people, projects and organisations, are served by the API from
`GET /avatars/{kind}`, so no name, key or organisation name is sent anywhere. Provider avatars are later
mirrored into the public bucket by `avatar.mirror` (M6), which simply fills
`avatar_object_key`.

**An avatar key names its user.** Presign and the mirror both mint
`web/avatar/{user_id}/{uuid}.{ext}`, and `POST /v1/me/avatar/complete` accepts only a key
whose `user_id` is the caller's. Any other key answers `400 avatar.upload_missing` before
storage is asked, exactly as a key with nothing behind it does, so no account can point at —
and later delete — another account's photo. Keys minted before 1 Oct 2026 have no user
segment: they never complete again, and "remove photo" still deletes the one already on the
caller's own row.
The presigned PUT signs the declared `Content-Type` and `Content-Length`, so storage refuses
any other body; completion then HEADs the object and answers `422 avatar.invalid_object` —
deleting it — when it is empty, over `AVATAR_MAX_BYTES` (2 MiB) or not one of
`AVATAR_MIME_TYPES`. A presigned key that is never completed is not swept: avatars have no
pending-upload row.

**Organisations** have no upload: the mark is always
`<API_BASE_URL>/avatars/organization?seed=<org name>`, DiceBear's `blobs` style rendered by
the API, the one deliberately colourful element on screen (design system § 3.4).
Projects keep the colour + initials badge, from `/avatars/project?seed=<key>`.

## Upload

```
1. Browser → POST /v1/attachments/presign
              { filename, mime, size, sha256,
                issue [+ comment_id | work_item_id]  |  project,
                width?, height? }
   API      → upload permission; the comment or work item must be the caller's to edit
            → 100MB per file; 50 per issue, pending included
            → quota: storage_used_bytes + bytes of pending uploads + size ≤ the plan's quota
            → creates a pending attachments row (completed_at NULL)
            → returns { attachment, upload_url, upload_headers, expires_in: 900 }

2. Browser → PUT <upload_url> with every upload_headers entry    bytes go straight to storage

3. Browser → POST /v1/attachments/:id/complete
   API      → HEAD the object: does it exist, do the size and checksum match
            → marks the row complete, increments storage_used_bytes
            → writes an `attached` issue_activity row (not for a draft)
```

As built in 1f (25 Sep 2026):

- **The client hashes the file** (SHA-256, base64) and sends it with the exact size. Both
  are signed into the presigned `PUT` — `Content-Length` and `x-amz-checksum-sha256` —
  so storage refuses any other bytes, and the hash is kept as `attachments.checksum`.
- **Drafts.** A form whose parent does not exist yet — the create-issue dialog, a new
  comment, a new work item — presigns with `project` instead of `issue`. The draft is
  visible and servable to its uploader alone. The create request lists the drafts in
  `attachment_ids`; they join the new issue (and comment or work item) in its
  transaction, with `attached` history in its change group. A pending draft cannot be
  claimed (`attachment.upload_incomplete`), and someone else's never
  (`attachment.not_a_draft`).
- `attachments.sweep` runs hourly: pending rows older than an hour, unclaimed drafts older
  than two days and deleted rows lose their object and then their row, so an abandoned
  upload never permanently consumes quota. Deleting an object that is already gone
  succeeds, so a half-finished run simply repeats.

## Serving — the part that is easy to get wrong

### The trap

**Do not embed presigned URLs in markdown.** Markdown is stored permanently;
a presigned URL expires in minutes. Store one and every image in that comment
is broken forever after the TTL. This is the most common way this gets built
wrong.

### The design

Markdown stores a **stable application URL**. Authorisation happens at
request time, and the response is a redirect to a freshly minted presigned
URL.

```
Stored in the markdown:
    ![screenshot](https://files.nothingleft.dev/0193ab…/login-bug.png)

On each request:
    GET files.nothingleft.dev/<attachment_id>/<filename>
      → resolve session cookie or PAT to a Principal
      → may this principal read the issue this attachment belongs to?
      → 302 → https://<account>.r2.cloudflarestorage.com/…?X-Amz-Signature=…
               (5 minute TTL)
      → browser fetches the bytes directly from storage
```

### Why this shape

- **The private bucket stays fully private.** No public access, no "anyone
  with the link", including for fonts and other embedded assets. Only
  avatars live in the public bucket.
- **No proxy bandwidth.** Only a 302 leaves the API, so the backend instance
  stays small and cheap.
- **Stored markdown never rots.** The URL is permanent and portable.
- **Works in `<img>` tags.** Browsers follow redirects on image loads, and
  because `files.` and `app.` share the registrable domain
  `nothingleft.dev`, the `SameSite=Lax` session cookie is sent on the
  subresource request. **This is a second reason not to move any of these
  hosts to a different registrable domain.**
- **Bring-your-own storage is the same code path**, presigning against the
  customer's bucket instead.
- **Permission changes take effect immediately.** Revoke someone's project
  access and the next image request 403s — there is no long-lived URL
  outstanding.

### Caching

The 302 carries `Cache-Control: private, max-age=240`, just under the
presigned URL's 5-minute TTL. A page with twenty screenshots makes twenty
authorisation calls once, not on every scroll.

### Content handling

The presigned URL sets `response-content-disposition`:

- PNG, JPEG, GIF, WebP, AVIF and PDF → `inline`
- everything else → `attachment; filename="…"; filename*=UTF-8''…` — **SVG included**
  (decided 25 Sep 2026): an SVG is an image that can carry script, so it downloads

`response-content-type` is set from the stored type too, so what storage guessed never
matters.

So an uploaded `.html` or `.svg` can never execute against an application
origin. Serving from `files.nothingleft.dev` rather than `app.` is the second
layer of that protection.

### MCP

Agents cannot hold a cookie, so `get_attachment_url` returns a presigned URL
directly, with a short TTL, after the same permission check. Attachment
contents are never inlined into tool responses — an agent fetches the URL if
it needs the bytes.

## The files route, locally and in production

`GET {FILES_BASE_URL}/{id}/{filename}` is a route on the API, mounted at
`FILES_BASE_URL`'s path: at the root of `files.nothingleft.dev` in production, at
`/files` under `API_BASE_URL` when `FILES_BASE_URL` is unset (local). The session cookie
reaches it either way — `SESSION_COOKIE_DOMAIN=.nothingleft.dev` in production, and a
host-only `localhost` cookie ignores the port. The `filename` segment is for people
reading the URL; the id alone finds the file. A PAT is accepted too: an agent reads
`Location` instead of following it.

## Correction to earlier drafts

`files.nothingleft.dev` was initially described as a public R2 custom domain.
It is not. **It is a route on the API**, and the attachments bucket is
private. The subdomain exists to keep user-uploaded content off the
application origin, not to serve it publicly. `static.nothingleft.dev` is the
public R2 custom domain, and it serves avatars only.

## Inline vs listed attachments

An attachment referenced inline in the description or a
comment is **hidden from the attachments list by default**, since it is
already visible in context. The list shows a count of them —
*"Attachments 3 · Hidden files 3"* — with a toggle to reveal.

An attachment is considered inline when its ID appears in the markdown of the
issue or any of its live comments, computed on every read rather than stored: the API
answers it as `inline` on each attachment, so the web only counts.

## Images

- `width` and `height` are recorded on upload, so rendered markdown reserves
  the right space and the page does not reflow as images load.
- No thumbnail generation in v1. R2 egress is free, screenshots are small,
  and an image pipeline is a whole subsystem. Revisit if real usage shows it
  is needed.

## Bring your own storage

Org Admins and the Org Owner may connect their own S3-compatible bucket:
Cloudflare R2 or AWS S3. It replaces the **private** bucket for that
organisation; the public avatar bucket is never replaced.

Decided with the owner and built in 6c (API half 28 Sep 2026). The routes are under
`/v1/organizations/{slug}/storage` ([openapi.yaml](./openapi.yaml)); every one that touches
the connection is session only, and connect, rotate and disconnect need step-up (the 6b
password + code).

### Setup

The settings screen is a wizard, because the one thing a server-side test cannot see is
the bucket's CORS rule — and without it every browser upload fails.

1. **Permissions first.** Before any field, the screen shows what the key needs, ready to
   copy: for S3, the IAM policy `byoAccessPolicy(bucket)` in `packages/types` builds —
   `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*` and
   `s3:ListBucket` on the bucket, so a missing object reads as 404 rather than 403; for R2,
   an API token with *Object Read & Write* on that one bucket. **In bold: grant only these
   permissions, never full S3 access.** It asks the admin to create a dedicated user (or
   token) with that policy and paste its key here.
2. **The CORS rule.** `byoCorsRules(origin)` builds it for `cors_origin` (`APP_BASE_URL`):
   `PUT`, `GET` and `HEAD` with the `content-type` and `x-amz-checksum-sha256` headers.
3. **Credentials.** R2 takes the account ID (and jurisdiction: default, EU or FedRAMP); S3
   takes the region. **The endpoint is built from them, never typed**: a free-form URL
   would let an admin point the server at any address it can reach. `BYO_ALLOW_ANY_ENDPOINT`
   allows one in development and tests only, and production refuses to boot with it.
4. **Server round trip.** The API writes, reads back and deletes a small object at
   `api/{org_id}/_check/server-<uuid>`. A failure answers `422` naming the input to fix
   (`storage.check_wrong_secret` on `secret_access_key`, `storage.check_denied_delete`, …)
   and is saved as `failed` with `last_error` (`step.reason`), so the form keeps what was
   typed. A pass leaves the connection `pending`.
5. **Browser round trip.** The browser generates an 8 KB file, gets a presigned PUT and GET
   for `api/{org_id}/_check/<uuid>`, uploads it and fetches it back — both from the app's
   origin, so they prove the CORS rule. A network error on either is shown as the CORS step
   with the rule to paste. Then `verify` checks the file's size and hash, deletes it, and
   marks the connection **`verified`**.

### What verification changes

- **The quota lifts at once**, not on migration completion. A blocked user can unblock
  themselves in under a minute.
- **New uploads are presigned against the customer bucket** from that moment, at the same
  key they would have had on the platform. Files already on the platform stay there and
  keep serving until the migration moves them.
- **Coexistence.** `attachments.storage_target` and `storage_location_id` are per row, so platform and
  customer files coexist; the row picks the client (below).

### The migration — `storage.migrate`

An admin starts it (`POST …/storage/migration`); it is not automatic. A queued pg-boss job on
the `stately` queue, keyed `org:{id}`:

1. At the start, `total_files` / `total_bytes` are set to what is already moved plus what
   remains on the platform. Nothing new lands there, since uploads already go to the
   customer bucket.
2. In batches of 50, lowest id first: stream the platform object into the customer bucket
   under the same key, with its SHA-256 (the store refuses other bytes); HEAD it there for
   size and hash; then, in one transaction and only if the row is still a live platform
   file, switch `storage_target`, `storage_location_id` and `bucket`, release its bytes from `storage_used_bytes`
   and add to `migrated_files` / `migrated_bytes`. **After the commit the platform copy is
   deleted** (owner). A crash between the two leaves an unbilled stray on the platform,
   never a broken file. A row deleted mid-copy has its new copy deleted instead.
3. A run moves at most 500 files or five minutes, then queues the next run with the id it
   reached (pg-boss expires a job after 15 minutes). `updated_at` is its heartbeat.
4. A platform object that is already missing is skipped and logged; the totals stop
   counting it.
5. **Any other failure stops the run** with `migration_state = 'failed'` and
   `migration_error`. Every file keeps serving from wherever it is; *Retry* resumes with the
   files still on the platform. A run with no progress for 30 minutes is **stalled**: the web
   offers a retry, and the nightly `storage.reconcile` re-queues it.
6. An upload presigned before verification completes on the platform afterwards; its
   completion queues the migration again, which carries it across once the first
   migration is `done`.

### Serving, and how a row picks its client

One S3 adapter (`@lib/storage`) for every bucket: `storage.private` is the platform's,
`storage.connect()` builds a customer's. The service `@services/object-stores` picks by row:
a `platform` row uses the platform client; a `byo` row reads the organisation's connection
(one primary-key lookup, joined to its location) and is served only when that connection is
**verified and points at the row's storage location** — the provider, endpoint and bucket
recorded when the file was written (`org_storage_locations`,
[data-model.md](./data-model.md#org_storage_locations)). A bucket of the same name at another
endpoint — another R2 account, another jurisdiction — is a different location. The client is
built once per credentials: the cache key includes the sealed secret, whose fresh IV changes on
every connect or rotation, so no instance ever uses a stale key and nothing needs broadcasting.

Presigning is local, so the files route never calls the bucket. When it cannot serve, it
answers from the row, and the Attachment's `available` is false so the web draws a
placeholder rather than a broken image:

| The row's location | Files route | Upload |
|---|---|---|
| The verified connection's | `302` to a presigned GET on it | presigned against it |
| The connection's, but its key is failing | `409 storage.byo_unavailable` | refused, `409 storage.byo_unavailable` |
| Not the connection's, or no connection | `410 storage.byo_disconnected` | to the platform, quota-counted |

A 4xx, not a 5xx: a customer's revoked key is their state to fix, not our outage, and a 5xx
would reach error reporting on every image load.

### When the key stops working

A **circuit breaker**. The first refusal from the bucket — invalid key, wrong secret, no
bucket, access denied, wrong region — on a HEAD at upload completion, a delete in the sweep
or purge, a migration step or the nightly probe flips a verified connection to `failed`. Only
the call that flips it emails the Org Admins and Owner (`email.storage_byo_failed`) and emits
`byo_storage_failed`; everything after reads the state and stays quiet. Timeouts and
unreachable endpoints never trip it — they are retried.

While failed: files in the bucket answer `409`, uploads are refused (they do not quietly
fall back to the platform, which would hit the quota), the sweep and purge leave that
bucket's rows alone without reporting, and the nightly `storage.reconcile` probe clears the
state once the key works again.

**Rotating the key** is `PUT …/connection` again with the same provider, endpoint and
bucket. The round trip runs with the new key before anything is saved: a failure changes
nothing and the old key keeps serving; a pass saves it, marks the connection verified and
writes `storage_updated`. A different location — another provider, endpoint or bucket — is
refused (`storage.bucket_in_use`) while files live at the current one: disconnect first.

### Disconnecting

Explicit confirmation plus step-up; the Org Admins and Owner are emailed
(`email.storage_disconnected`) and `storage_disconnected` is written.

- The connection row, and with it the sealed secret, is deleted. **Its storage location is kept**:
  the files' rows point at it, so where their bytes are is never forgotten.
- **Files in the bucket stay there and keep their rows.** They stop serving (`410`) and the
  screen lists them under *earlier buckets*. **Connecting the same location again — the same
  provider, endpoint and bucket — serves them again.** A bucket of the same name anywhere else is
  another location: connecting it serves only what is uploaded there, and the earlier files stay
  unavailable.
- New uploads go to the platform again and count against the quota.
- A file deleted while disconnected loses its row; its object stays in the customer's
  bucket, which the application can no longer reach.

### Deleting from a customer's bucket

Amended by the owner on 28 Sep 2026 (previously: never, except `issues.purge`). **A
customer object goes the way a platform object goes, through the file's own lifecycle**, and
only through a verified connection to its location:

- a member's delete (the storage screen's delete included), then the hourly
  `attachments.sweep`;
- the sweep's pending uploads (after an hour) and unclaimed drafts (after two days);
- `issues.purge` and the articles purge, 14 days after the issue or article was deleted;
- the migration's own copy of a row deleted mid-copy, and the check objects.

**Never** on disconnect, never on organisation deletion (`org.delete` deletes the rows and
the connection and leaves every customer object where it is), never while disconnected.

### Credential handling

- The secret is sealed with AES-256-GCM under an HKDF subkey of `ENCRYPTION_MASTER_KEY`
  (purpose `byo_storage`, the row `org_storage_configs:{org_id}` as additional data),
  `@lib/crypto` `seal`.
- It is **never returned by any API, at any access level.** Settings show the access key ID
  and a fixed mask (`••••••••`) with no characters of the secret; the tests scan every
  response for it.
- Credentials, verification, migration and disconnect are UI-only: `x-mcp-exempt:
  byo_storage` ([mcp.md](./mcp.md#deliberately-ui-only)).

### Quota and the usage screen

Under a verified connection storage is unlimited ([limits-and-billing.md](./limits-and-billing.md#bring-your-own-storage)):
nothing in the customer's bucket counts, `storage_used_bytes` keeps counting only what is
still on the platform, the level stays `ok` and no storage email goes out. The usage screen
still shows how much the organisation holds in its own bucket (files and bytes, summed on
read) so the owner can keep an eye on it.

## CSV imports

Decided 10 Oct 2026 (6d). An import file is uploaded the way an attachment is — reserved with
its size and SHA-256 (`POST /v1/projects/{key}/imports`), `PUT` straight to a presigned URL,
then checked (`…/complete`) — but it is not an attachment: no `attachments` row, never in the
quota, and always in the **platform's** private bucket, even for an organisation with its own,
at `api/{org_id}/import/{import_id}/{uuid}`. At most 20 MB. It is deleted when its import
completes or fails, or by the hourly `transfers.sweep` once a day has passed with the import
never started.

## Organisation export

Decided 10 Oct 2026 (6d). `export.org` writes one `.zip` to a temporary file on the API host,
then stores it in the **platform's** private bucket at `api/{org_id}/export/{export_id}/{uuid}`
with its SHA-256 — outside the quota, and never in an organisation's own bucket, whose key it
could lose. The archive holds:

| Path | What |
|---|---|
| `manifest.json` | Format version, when, which organisation, a count per file, and every file that could not be included with why (`gone`, or `unreachable` for an own bucket that did not answer) |
| `organization.json` | Name, slug, plan, working day and week |
| `members.json` | Every member, past and present: username, name, email, role, joined, removed, deactivated, erased |
| `issues.json` | Every live issue as the API's `Issue`: keys, names, usernames, custom field values, tags |
| `tables/<table>.json` | Every organisation table as stored ([data-model.md](./data-model.md)), live rows only: projects and their members, statuses, priorities, types and work types, custom fields with options and scoping, work item attributes, tags, sprints and snapshots, boards and columns, issues with assignees, watchers, tags, links, field values and history, comments and reactions, work items and their values, articles and their tags, shared saved views, the audit log. Search vectors, secrets, sessions, tokens, storage credentials, notifications, preferences, recent searches and private saved views are never written |
| `files.json` | Every file of a live issue, comment, work item or article, with where it sits in the archive (`path`, null when missing) |
| `files/<id>/<filename>` | The files themselves, stored uncompressed, read one at a time from wherever they live — the platform or the organisation's own bucket |

The platform bucket failing fails the export (pg-boss retries it); an own bucket failing only
lists its files as missing. The archive is downloaded through `GET …/exports/{id}/download`, a
`302` to a five-minute presigned link, and deleted by `transfers.sweep` 7 days after it was
built. `org.delete` deletes archives and import files before the organisation's rows.
