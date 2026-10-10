# Authentication, Authorisation and Tenancy

## Summary

**There is no JWT anywhere in this system.**

| Client | Credential |
|---|---|
| Browser | Opaque session ID in an httpOnly cookie, resolved server-side |
| MCP / scripts | Opaque Personal Access Token in an `Authorization` header |

Both resolve, through one middleware, to the same `Principal`.

### Why not JWT

JWTs solve a problem this system does not have (stateless verification across
independent services) while creating problems it does have:

| | JWT | Opaque server-side session |
|---|---|---|
| Revocation | Needs a denylist, i.e. state — the thing JWT was meant to avoid | Delete the row. Instant. |
| "Sign out everywhere" | Requires rotating a global secret | One `DELETE`. |
| Readable in the browser | Claims are base64, trivially inspected | Nothing to read — it is 32 random bytes |
| Size | Grows with claims, rides on every request | 32 bytes |
| Key rotation | Real operational work | None |
| Cost | — | One lookup per request, cached in Redis for ~60s |

With a single API, the trade is entirely in favour of sessions. Revisit only
if the architecture ever becomes genuinely multi-service.

## Browser sessions

### The cookie

```
Set-Cookie: sid=<32 random bytes, base64url>;
            HttpOnly; Secure; SameSite=Lax;
            Domain=.nothingleft.dev; Path=/; Max-Age=2592000
```

- **httpOnly** — JavaScript cannot read it. This is the protection against
  XSS token theft; a JWT in `localStorage` has none.
- **SameSite=Lax** works because `work.nothingleft.dev` and `api.nothingleft.dev` share
  the registrable domain. No `SameSite=None` weakening.
- The cookie holds an opaque identifier. There are no claims in it.

### The session row

```
sessions(
  id,
  token_hash UNIQUE,   -- SHA-256 of the cookie value; the raw value is never stored
  user_id,
  current_org_id NULL, -- → organizations, ON DELETE SET NULL
  user_agent NULL,
  ip NULL,
  country_code NULL,
  created_at,
  last_seen_at,
  expires_at
)
```

### Rolling expiry

30-day expiry, refreshed forward whenever the session is used and
`last_seen_at` is more than 24 hours old. An active user never logs in again.
This is deliberate: being logged out of a tracker you use daily is pure
friction with no security benefit for this threat model.

### Session cache

A resolved session is cached in Redis for 60 seconds (`SESSION_CACHE_TTL_SECONDS`):
`sess:<token hash>` holds it and `sessid:<id>` points back to it. Invalidating a session —
revoking it, or refreshing it after an organisation switch — first writes a
`sessrevoked:<id>` tombstone for the same 60 seconds, then deletes both entries. A lookup
that read the row before a revocation checks for the tombstone after writing the cache and
removes its own entry, so a revoked session never outlives its row; a live one is read from
the database until the tombstone lapses (decided 1 Oct 2026).

### Active sessions UI

Profile → **Active sessions** lists every session with device, approximate
location, and last-seen time. Individual revoke, plus "Sign out everywhere".
Instant, because sessions are server-side.

### CSRF

`SameSite=Lax` blocks cross-site form posts. Additionally, every mutating
request must carry an `Origin` header matching an allowed origin. Requests
authenticated by PAT are exempt from the origin check — they are not
browser-driven and carry no ambient cookie.

## Login methods

### One `users` table

There is no separate identities table. OAuth providers exist only to prove
control of an email address.

```
users(
  id, email UNIQUE, email_verified_at NULL,
  name, avatar_url NULL,
  password_hash NULL,     -- argon2id; null for OAuth-only accounts
  google_id NULL UNIQUE,
  github_id NULL UNIQUE,
  timezone,               -- IANA, e.g. Asia/Kolkata; default 'UTC'
  country_code NULL,      -- ISO 3166-1 alpha-2
  last_login_at NULL, last_login_ip NULL,
  deactivated_at NULL, deleted_at NULL,
  created_at, updated_at
)
```

Adding a fourth provider is one nullable column. If that ever becomes
frequent, it can be normalised later without a user-facing change.

**There is no `username` column.** Usernames are per-organisation and live on
`org_members`, following Slack's model — one account, a handle per
workspace. See [user-lifecycle.md](./user-lifecycle.md).

**Why keep `google_id` and `github_id` at all**, when the match is on email?
They are not the lookup key. They exist for one specific failure: a user
signs up with `foo@gmail.com` via Google, then changes their Google account's
primary email. Matching on email alone would miss them and silently create a
second account with their history stranded on the first. The provider ID is
stable across that change. `UNIQUE` stops two accounts claiming the same
provider identity.

**`users` rows are never hard-deleted.** `deactivated_at` and `deleted_at`
express the two terminal states, and every foreign key keeps resolving, so
attribution on old issues never degrades.

### The one security rule that must not be skipped

**Only link an OAuth login to an existing account if the provider asserts the
email is verified.**

- Google: `email_verified === true` — read from the OpenID userinfo endpoint,
  which carries the same claim as the ID token, so the API never decodes a JWT.
- GitHub: fetch `GET /user/emails` and use the primary email **only if**
  `verified === true`. GitHub's `/user` endpoint returns an unverified email.

Without this check, anyone who creates a provider account using your email
address takes over your account. It is cheap now and unpleasant to retrofit
after an incident.

### Flows

**Email + password signup** — email, password (min 8 chars, checked against
a breached-password list), name. Verification email; unverified accounts may
log in but cannot be invited, invite others, create an access token or start
an email change until verified (`auth.email_unverified`).

**Eight characters, and no composition rules.** Decided 22 Sep 2026. Length plus a
breach check is what NIST 800-63B asks for; "one uppercase, one symbol" rules push
people toward `Passw0rd!`, which is both weaker and more irritating than four words.
The sign-up form shows an advisory strength meter (`passwordStrength` in
`packages/types`, shared so the API and the browser rate a password identically), but
the only rules the API refuses on are the minimum length and the breach list.

**Password reset** — single-use token, 1 hour expiry, invalidates all existing
sessions on success. Completing a reset, or changing the password in settings,
also deletes the account's other unused reset links, so an older email cannot
change the password again.

**OAuth (Google, GitHub)** — standard authorization-code flow with PKCE and a
state parameter.

1. Provider returns profile.
2. Reject immediately if the email is not verified by the provider.
3. Match on `google_id`/`github_id` → log in.
4. Else match on `email` → link the provider ID to the existing user, log in.
   If that user is already linked to a *different* identity at the same
   provider, refuse (`auth.oauth_account_conflict`) rather than relink.
5. Else create the user, capturing **name, email, avatar**. The account is
   created verified; the provider just proved the address.

**Linking to an unverified account drops its password.** Decided 23 Sep 2026.
If step 4 lands on an account whose `email_verified_at` is null, whoever set
its password never proved they own the address — the classic pre-registration
hijack. In one transaction the link sets `email_verified_at`, clears
`password_hash`, turns two-factor off (clears `totp_secret_ciphertext`,
`totp_enabled_at` and `totp_last_used_step`, and deletes the unused recovery
codes), deletes every session, revokes every personal access token and deletes
every unused one-time link, a pending email change included — nothing the
account wrote is deleted. A second sign-in step already in progress cannot
finish either: the code step refuses an account with no password
(`two_factor.challenge_expired`). An unverified account cannot create a token or
start an email change, so there is normally nothing to revoke; the sweep covers
anything older than that rule (decided 1 Oct 2026). Verifying by the emailed
link revokes nothing: it cannot tell the owner from a squatter. A legitimate
owner who simply never clicked the link loses nothing they cannot recover with
a password reset.

The user is told twice: the callback answers with
`notice: { kind: "unverified_account_linked", account_created_at }`, which the
callback page shows once before continuing (with a link to set a new
password), and the address receives an explanation email. A second rule,
enforced from 0c, keeps the stakes near zero: **an unverified account cannot
create or join an organisation**, so the account being linked never holds
projects or issues — if a squatter made it, it is an empty shell; if the owner
made it, they had not got far enough to lose anything.

**Mechanics.** `POST /v1/auth/oauth/{provider}/start` stores the PKCE
verifier in Redis under a fresh `state` (10 minutes) and binds that state to
the browser with an httpOnly `oauth_state` cookie scoped to `/v1/auth/oauth`.
The provider redirects to the web app's `/auth/{provider}/callback`, which
posts `code`, `state` and the browser's timezone to
`POST /v1/auth/oauth/{provider}/callback`. The state must match the cookie
and is spent on first use, so a callback URL cannot be replayed or completed
in another browser (login CSRF). The redirect URI is always
`APP_BASE_URL/auth/{provider}/callback`; register exactly that with each
provider, once for local and once for production. A provider without
`*_CLIENT_ID` / `*_CLIENT_SECRET` answers `auth.oauth_not_configured`.
Name falls back to the GitHub login, then the email local-part.

**A provider-only account sets a password through the reset link.** Decided
23 Sep 2026. It has no current password to type, so Settings → Security offers
"Email me a link to set one", which is the ordinary password-reset flow sent to
the address the provider already verified. Like any reset it signs out every
session. Changing the email address needs a password, so it waits until one is
set. `Me` carries `email_verified_at`, `has_password` and `linked_providers`
so the UI can tell which of these to show.

**First login capture** — beyond name/email/avatar:

- `timezone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`, posted
  by the browser. This is the device's actual timezone: exact, free, no lookup.
- Fallback when the browser value is unavailable: the `x-vercel-ip-timezone`
  and `x-vercel-ip-country` headers Vercel provides at no cost (Cloudflare's
  `CF-IPCountry` on the marketing side).
- **No third-party IP-geolocation service.** It would cost money and be less
  accurate than the two signals above.
- `last_login_ip` and `country_code` are recorded for the sessions list.
- The user can change their timezone in their profile at any time; the stored
  value always wins over any inferred one.

## Two-factor authentication

TOTP, via any standard authenticator app — Google Authenticator, 1Password,
Authy. Optional, per user, enabled from the profile.

### Setup

1. Server generates a secret, returns a QR code and the secret in text form.
2. User scans it and **enters a current code to prove it works** before 2FA
   is enabled. Without this step, a mis-scanned QR locks them out instantly.
3. **Ten single-use recovery codes** are generated and shown once.

Recovery codes are mandatory, not an optional extra screen. There is no
support team to appeal to — without them, a lost phone is a permanently lost
account.

### Storage

```
users(…, totp_secret_ciphertext NULL, totp_enabled_at NULL)
totp_recovery_codes(id, user_id, code_hash, used_at NULL, created_at)
```

The secret is encrypted with AES-256-GCM under `ENCRYPTION_MASTER_KEY` and
never returned by any API after setup. Recovery codes are stored hashed and
marked used rather than deleted, so the activity is auditable.

### When it applies

**Password sign-in only.** A Google or GitHub sign-in skips the second
factor.

The honest trade-off: this means anyone who controls the user's Google or
GitHub account can reach their account here without the second factor. That
is acceptable, and deliberate — Google and GitHub both enforce their own 2FA,
usually stronger than ours, and requiring a second factor on top of an
already-2FA'd provider login is friction users route around by disabling it
entirely.

### Other rules

- Disabling 2FA requires the current password **and** a valid code.
- Using a recovery code sends a transactional email — that event usually
  means either a new phone or an intruder.
- Enabling and disabling both send transactional email.
- No "trusted device" or "remember this browser" concept. No unknown-device
  detection. Both add state and neither earns it at this scale.
- No organisation-level "require 2FA" policy. That is an enterprise feature.

### As built in 6b (API half, 27 Sep 2026)

Decided with the owner. Schema in [data-model.md § Two-factor authentication](./data-model.md#two-factor-authentication).

- **Setup.** `POST /v1/me/two-factor/setup` returns the base32 secret and an `otpauth://` URI
  (issuer *Nothing Left*, label the email); the web app draws the QR code from the URI. The
  secret is sealed at once and never returned again; calling setup again replaces a pending
  one. `POST /v1/me/two-factor/confirm` takes a current code **and the password** — without the
  password, a stolen session could turn two-factor on and lock the owner out — and answers the
  ten recovery codes, once. An account with no password cannot set it up
  (`auth.no_password_set`): two-factor guards password sign-in, and it has none.
- **Codes.** SHA1, 6 digits, 30 seconds, one step of drift either side. A code whose step is at
  or before the last one accepted is refused, so a code works once. A recovery code is accepted
  wherever a code is, case, spaces and dashes ignored, and each use is emailed with the count
  left.
- **Sign-in.** The right password on an account with two-factor on answers **202** with
  `{ two_factor_required: true, expires_at }` and no session. The hand-off is an opaque
  challenge — 32 random bytes, kept in Redis as `tfa:<sha256>` for 5 minutes — carried in an
  httpOnly `tfa` cookie scoped to `/v1/auth/two-factor`, the same pattern as `oauth_state`. No
  claims travel anywhere. `POST /v1/auth/two-factor` with `code` or `recovery_code` spends the
  challenge and sets the session. Five wrong codes end the challenge (the password is asked
  again), and five wrong codes or passwords on the account's confirmation steps pause them for
  15 minutes (`auth.account_locked`), counted per account in Redis. While the pause runs, the
  right password on the sign-in form already answers `429 auth.account_locked`, so nobody types
  a code only to learn it was paused. Changing the password and the email address answer
  `auth.wrong_password` for a wrong current password too. Google and GitHub sign-in
  never ask.
- **Disabling** needs the password and a code (TOTP or recovery). **Regenerating** the codes
  (`POST /v1/me/two-factor/recovery-codes`) needs the same, invalidates every unused old code
  and emails the account. `GET /v1/me` reports `two_factor: { enabled, enabled_at,
  recovery_codes_remaining }`.
- **Session only.** Every two-factor, deactivation, organisation-deletion and ownership route
  refuses a PAT with `403 auth.session_required`: a compromised token must not reach them
  (mcp.md § Deliberately UI-only).

### Step-up confirmation

Decided with the owner, 27 Sep 2026. Deactivating an account, disabling two-factor,
regenerating recovery codes, scheduling an organisation's deletion and offering its ownership
all take `{ current_password, code? }`:

- an account **with a password** gives it (`auth.password_required`,
  `auth.wrong_password` — "That password is incorrect.", never the sign-in form's "email or
  password", since only a password was asked for), and a code when two-factor is on
  (`two_factor.code_required`);
- an account **without one** (Google or GitHub only) proves itself by a session created in the
  last 10 minutes — the UI asks it to sign in with its provider again — else
  `403 auth.recent_sign_in_required`. No emailed link: that would be a second flow and a new
  token purpose for the rare account that needs it.

Cancelling a deletion, cancelling or declining a transfer, and accepting one need no step-up:
they undo, or they are the other party's own decision behind a link to their inbox.

## Personal Access Tokens

For MCP clients, scripts and CI.

```
personal_access_tokens(
  id, user_id, name,
  token_hash UNIQUE,      -- SHA-256; the raw token is shown exactly once
  token_prefix,           -- first 8 chars, for display: nl_pat_a1b2…
  scopes[],
  restricted,             -- false = all projects the user can access
  expires_at NULL,        -- null = no expiry
  last_used_at NULL,
  created_at, revoked_at NULL
)

personal_access_token_projects(   -- the projects a restricted token may reach
  token_id,               -- → personal_access_tokens, ON DELETE CASCADE
  project_id, org_id,     -- → projects (id, org_id), ON DELETE CASCADE
  PRIMARY KEY (token_id, project_id)
)
```

- Format `nl_pat_<43 chars base62>`. The prefix makes them greppable in
  secret scanners.
- Generated in Settings → Access tokens. Shown once, never retrievable.
- **Managed from a browser session only** (decided 1 Oct 2026). Creating or revoking a token,
  and revoking a session, answers `403 auth.session_required` to a PAT of any scope, so a
  narrow or stolen token can neither mint a wider one nor sign its owner out. Listing tokens
  and sessions stays open to a PAT.
- Creating one needs a verified email address (`403 auth.email_unverified`), as creating or
  joining an organisation does.
- **A PAT can never exceed its owner's permissions.** Every request
  re-evaluates the user's current roles; revoking someone's project access
  immediately constrains their tokens.
- Scopes: `issues:read`, `issues:write`, `comments:write`, `time:write`,
  `admin:project`, `admin:org`. Destructive MCP tools additionally ask the person
  through their client (mcp.md § Design rules 7); nothing in a call's arguments
  stands for that answer. A request refused only for a missing scope answers
  `403 token.scope_missing` with the scope named (permissions.md rule 4).
- `last_used_at` is surfaced so stale tokens are visible and revocable.
- **A restricted token stays restricted.** `restricted` is the mode and the junction is the
  list, so deleting a token's last project leaves it reaching no project — the API lists it with
  `project_keys: []` — and it never becomes unrestricted. `project_keys` omitted, null or empty at
  creation makes an unrestricted token (1 Oct 2026;
  [data-model.md § Tables defined in other documents](./data-model.md#tables-defined-in-other-documents)).

OAuth 2.1 for remote MCP (per the MCP specification) is a post-v1 addition.
PATs cover both the stdio and HTTP transports today with far less machinery.

## Roles

Five roles. **Hardcoded enums. There is no role management screen.**

| Role | Scope | Capabilities |
|---|---|---|
| **Org Owner** | Organisation | Everything. Billing, delete the organisation, transfer ownership. Exactly one per org, transferable. Stored as `organizations.owner_user_id`. |
| **Org Admin** | Organisation | Manage members, create/archive projects, org settings, storage configuration. Implicit Project Admin on every project. Cannot delete the org or transfer ownership. |
| **Project Admin** | Project | Project settings, statuses/priorities/types, custom fields, work types, sprints, boards, members and their project roles, delete issues. |
| **Contributor** | Project | Create and edit issues, comment, log time, manage tags, attach files. Cannot change project configuration. |
| **Observer** | Project | Read-only. Can view issues, comments, reports, and attachments. Cannot comment. |

Org role (`org_admin | member`) and project role
(`project_admin | contributor | observer`) are independent columns. An Org
Admin may be a plain Contributor on a project for day-to-day work; the
implicit elevation still applies when they need it.

Permission checks live in the service layer, in one module, so the REST API
and the MCP server cannot diverge.

### No org-level deactivation

An organisation can **remove** someone from the organisation. It can never
deactivate or delete an account — accounts are global and org-independent,
and only the account holder or the platform operator can deactivate one.

A suspend-but-keep-the-seat state was considered and rejected: large
enterprises ask for it, small teams never use it, and it doubles the state
space of every permission check. Removal is the only org-level action.

Full detail, including what happens to a removed member's issues, comments
and saved views, is in [user-lifecycle.md](./user-lifecycle.md).

## Invitations

Two kinds, one table.

```
invitations(
  id, org_id,
  project_id NULL,            -- null = organisation-level invite
  kind: 'email' | 'link',
  email NULL,                 -- set for kind='email'
  token_hash,
  token NULL,                 -- share links only; see data-model.md#invitations
  org_role, project_role NULL, -- the roles granted on acceptance
  max_uses NULL,              -- null = unlimited
  use_count,
  expires_at NULL,            -- null = never expires
  allowed_email_domain NULL,  -- e.g. 'nothingleft.dev'
  created_by, created_at, revoked_at NULL
)
invitation_uses(invitation_id, user_id, used_at, ip NULL)
```

### Email invite

Single-use, addressed to one email, 14-day expiry. Always sends an email —
this is transactional mail and is not subject to notification preferences.

### Share link

Multi-use by default.

- **Default: no expiry, unlimited uses, revocable.** Expiry is friction with
  little benefit when revocation is one click; a link that silently stops
  working is a worse experience than one that is explicitly revoked.
- Optional per link: `max_uses`, `expires_at`, `allowed_email_domain`.
- **Rotate** regenerates the token, invalidating the old URL while keeping
  the same configured roles. **Revoke** kills it outright.
- Scope is either organisation or project. **Accepting a project link joins
  the organisation and the project in one step** — the recipient never has to
  be invited twice.
- Each acceptance is recorded in `invitation_uses`, so a Project Admin can
  see exactly who joined through which link and when.
- If accepting would exceed the 20-member free limit, the join still succeeds
  and the seat notice is shown to org admins (see `limits-and-billing.md`).

### Rules decided in 0c

Decided 23 Sep 2026, implemented in the 0c API.

- **Who may invite.** Organisation invitations (email or link) need an Org
  Admin. A Project Admin may invite to their own project by email or link —
  accepting brings the person into the organisation as a `member` — because
  that is what project links already did. Only an Org Admin may bake in
  `org_role: org_admin`. An organisation invitation carries no project role.
- **Accepting.** An email invitation is for its address only
  (`invitation.email_mismatch`); a share link needs a verified account
  (`auth.email_unverified`) and, when set, an address in
  `allowed_email_domain`. Accepting an email invitation verifies an
  unverified account, because holding the token proves the inbox. Accepting
  what the caller already has changes nothing and answers
  `already_member: true`; a link never lowers or raises an existing member's
  org role. A former member is restored, keeping their username. A session is
  switched into the organisation joined, as it is into one just created.
- **Signing up from an invitation.** `POST /v1/auth/sign-up` takes an optional
  `invitation_token`. A live email invitation to that exact address creates the
  account verified and sends no verification email; any other token keeps the
  verification email, whose link carries `next=/invite/<token>` so the flow
  resumes after the click. The UI then calls accept.
- **Re-inviting** an address revokes its still-pending invitation to the same
  scope, so only the newest email works.
- **Declining** revokes an email invitation addressed to the caller, so it
  cannot be accepted later; a share link is left alone for everyone else.
- **Tokens travel in request bodies** (`/v1/invitations/preview | accept |
  decline`), never in an API path, so they stay out of access logs. The web
  URL is `/invite/<token>`.
- **Links keep their raw token** so an admin can copy one again
  ([data-model.md § invitations](./data-model.md#invitations)).

### Removal and credentials

Sessions and PATs are user-level, and removal from one organisation must not
reach the person's others (user-lifecycle.md § Shared email addresses).
Decided 23 Sep 2026, removal therefore:

- clears `sessions.current_org_id` wherever it points at that organisation, and
  drops those sessions from the Redis cache — no session is deleted;
- revokes the restricted PATs whose projects all lie inside that organisation;
- leaves unrestricted PATs alone: permissions are re-evaluated on every request,
  so they lose that organisation at once while still reaching the others.

**Deactivation and organisation deletion** (6b, 27 Sep 2026) follow from the same shape:

- **Deactivating an account** deletes every session (and its cache entry), revokes every PAT
  and deletes every unused one-time token it holds or offered. Every lookup already refuses a
  deactivated user, so a session or token that slipped through would still answer `401`.
- **Deleting an organisation** does what removal does, for everyone at once, when `org.delete`
  stamps `deleted_at`: sessions pointing at it forget it, and PATs confined to its projects are
  revoked. Nothing changes at scheduling — during the grace period everyone keeps working.

## Current organisation

Web routes carry no organisation segment (`/projects/PP/issues`), and project keys
are unique per organisation, not globally. So a request for `PP-123` needs
an organisation before it can be resolved. Decided 21 Sep 2026:

**Session principals.** `sessions.current_org_id` holds the organisation the
user is working in. `POST /v1/me/current-organization { slug }` switches it;
the org switcher calls that and refetches. A new session starts in the
sole membership, else the organisation the user most recently worked in (the
newest other session's), else the oldest membership; an account with none
starts in none (decided 23 Sep 2026, 0c). Creating or joining an organisation
switches the session into it. `GET /v1/me` names it as
`current_organization_slug`. A link pasted to someone in a
different organisation lands on `404`, which is the correct answer under
rule 4 of [permissions.md](./permissions.md). This is the server-side
equivalent of a claim in a token, without the token.

**PAT principals.** A token is user-level and reaches every organisation the
user belongs to (a restricted token's project list narrows it; there is no
org-scoped token, so an agent never juggles credentials). The organisation is
resolved per request:

1. `X-Organization: <slug>` header, when sent. MCP tools expose it as an
   optional `org` argument.
2. Otherwise, if the user belongs to exactly one organisation, that one.
3. Otherwise, if the project key in the request (`PP-123`, `project: PP`) is
   unique across the user's organisations, the one that owns it.
4. Otherwise `400` with `error.code = organization_ambiguous` and
   `valid_values` listing the candidate slugs, so the retry can succeed.

Endpoints that are not project-shaped (`list_orgs`, `whoami`, creating an
organisation) need no resolution.

## Tenancy isolation

App-layer scoping, enforced structurally.

1. Every tenant-owned table carries `org_id`.
2. Every repository method takes a `TenantContext` — it is not optional and
   not defaulted. There is no way to call a repository without stating which
   organisation you are acting within.
3. An ESLint rule bans raw `db.select` / `db.insert` / `db.update` outside
   `packages/db`.
4. Every repository method has an integration test asserting that data from
   another organisation is not returned. A query that leaks across tenants is
   a failing test, not a code-review judgement call.

PostgreSQL row-level security was considered and rejected for v1: it
complicates migrations and connection pooling for defence-in-depth against a
class of bug the tests above already catch. It remains addable later without
schema changes, since `org_id` is already everywhere.
