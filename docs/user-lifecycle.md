# User Lifecycle

How accounts, memberships, removal and erasure work — and how attribution
survives all of them.

## The core rule

> **An organisation can remove someone from the organisation.
> An organisation can never deactivate or delete an account.**

Accounts are global and organisation-independent. Only the account holder, or
the platform operator, can deactivate an account. Every confusing scenario in
this area dissolves once that separation is held firm.

A second rule follows from it:

> **`users` rows are never hard-deleted.**

This is the advantage SQL gives over an embedded-document model. The foreign
key still resolves, so a name never has to be denormalised into a comment and
can never be lost. Attribution on a four-year-old issue reads exactly as it
did the day it was written.

## The three distinct actions

| Action | Who can do it | Scope | Effect |
|---|---|---|---|
| **Remove from organisation** | Org Admin, Org Owner | One organisation | `org_members.removed_at` set. No access to that org. **Account untouched.** Name and avatar still render everywhere, forever. |
| **Deactivate account** | The user; the platform operator | Global | Cannot sign in anywhere. Row intact, attribution intact, until erased six months later. |
| **Erase account** | The platform operator, on an emailed request from the person or their Org Admin (GDPR); automatic six months after a deactivation | Global | Row **kept**. PII scrubbed: name → `Deleted user`, email → hashed, avatar → null. Requests are rare and done by hand. The automatic run is a nightly job. |

The unpleasant "Deleted user" label that other trackers show everywhere
appears **only in case 3**. Case 3 happens on request, or six months after a deactivation. Case 1 is the everyday
action, and it keeps the person's real name permanently.

There is deliberately **no org-level "deactivate" or "suspend"** state. Large
enterprises ask for it; small teams never use it; and it doubles the state
space of every permission check. Removal is the only org-level action.

## Removing someone from an organisation

The dialog states every consequence and asks about the ones that are
genuinely a choice:

```
Removing Alex Lee from Acme Corporation

  Open issues assigned           12   → reassign to [ ▾ ]   ( ) leave unassigned
  Resolved issues assigned       84   → unchanged
  Issues created                147   → unchanged
  Comments                      612   → unchanged
  Time logged                  340h   → unchanged
  Saved views                     6   → delete   ( ) transfer to [ ▾ ]
  Active sessions                 3   → access revoked
  Access tokens                   5   → access revoked
```

### The API behind the dialog

Decided 25 Sep 2026, 1g. `GET /v1/organizations/{slug}/members/{username}/removal`
returns the counts, and `DELETE /v1/organizations/{slug}/members/{username}` carries
both choices as query parameters (a DELETE body is dropped by some proxies). Both need *Remove a member from the org*.

```
RemovalPreview {
  member, open_assigned, resolved_assigned, created, comments,
  time_logged_minutes, saved_views, sessions, access_tokens,
  reassign_candidates: MemberRef[]
}
DELETE …/members/alex?reassign_to=casey&transfer_views_to=casey
```

- Counts cover **live issues only**. A trashed issue keeps its assignee and is not
  reassigned; restored, it shows the *Former member* chip.
- `comments` counts live comments; `time_logged_minutes` sums the work items they
  authored; `saved_views` counts the views they own, of every visibility.
- `sessions` counts every live session of the account, and `access_tokens` every live
  token that reaches the organisation. All of them lose it at once: see
  [auth-and-tenancy.md § Removal and credentials](./auth-and-tenancy.md#removal-and-credentials)
  for why that is not the same as deleting them.
- `reassign_candidates` are the active members assignable in **every** project that holds
  one of their open issues, so the picker offers nobody the request would refuse. Empty
  when there are no open issues.
- An absent `reassign_to` leaves the open issues unassigned; an absent
  `transfer_views_to` deletes the views. The dialog always asks both questions, so the
  defaults only speak for API callers (owner, 26 Sep 2026: query parameters over a
  DELETE body).
- With several assignees, the removed person is replaced by the target (once, if the
  target is already there); *leave unassigned* only takes them out of the set.
- A transferred view whose name the target can already see gets the next free numeric
  suffix (`Bugs 2`), the way usernames do. Its visibility is unchanged.
- Everything — reassignments, views, the soft delete, project memberships — commits in
  one transaction.

### Rules

- **Only unresolved issues are reassigned.** An issue is reassignable when
  its status category is not `done` or `cancelled`. Resolved history is never
  rewritten.
- Every reassignment writes an ordinary history row, by whoever removed them:
  `Assignee: Alex Lee → Casey Morgan`. The change is visible, never silent; no
  reason is stored on it (owner, 25 Sep 2026, 1g).
- **`created_by` is never reassigned.** Authorship is a historical fact, not
  a pointer to a current owner.
- Comments, time entries, attachments and activity rows are untouched.
- Saved views — private and shared alike — are deleted or transferred, one
  choice covering both.
- Sessions and personal access tokens lose the organisation immediately: a
  session pointing at it forgets it, and a token restricted to its projects is
  revoked. Both are user-level, so nothing that reaches the person's other
  organisations is touched ([auth-and-tenancy.md § Removal and credentials](./auth-and-tenancy.md#removal-and-credentials)).
- Their project memberships in the organisation are deleted; re-adding them
  restores the organisation membership, not project access
  ([data-model.md § project_members](./data-model.md#project_members)).
- The Org Owner cannot be removed; ownership is transferred first.
- The seat stops counting toward the 20-member free limit.
- `org_members` is **soft-deleted** (`removed_at`), never hard-deleted.

### Why `org_members` is soft-deleted

Two reasons, both load-bearing:

1. **The username stays reserved.** If handles were freed on removal, a later
   member could claim `@alex`, and every historical `@alex` in old
   comments would silently refer to a different person. Keeping the row
   prevents reuse.
2. **Re-adding restores the same membership** — same username, same history,
   same join date.

## Rendering a former member

A removed member renders with their **real name and avatar**, plus a quiet
*Former member* chip on hover.

Not struck through. Not greyed into illegibility. Not "Deleted user".

They no longer appear in assignee pickers, mention autocomplete or member
lists, but they remain fully searchable — `created by: @alex` still works,
because the audit trail is the point.

## Usernames are per-organisation

```
users(email UNIQUE, …)                    -- no username column
org_members(org_id, user_id, username, …, UNIQUE (org_id, username))
```

This follows **Slack's model**: one account identified by email, with a
handle per workspace. Proven at very large scale.

- The username defaults to the email local-part (a `+tag` dropped), with a
  numeric suffix when taken (`alex`, `alex2`), and only the user can change
  it. It is 1–39 characters of `a-z A-Z 0-9 . _ -`, alphanumeric at both ends,
  stored as typed and unique case-insensitively; a leading `@` is accepted and
  dropped. `parseUsername` and `usernameFromEmail` in `packages/format` are the
  one implementation. Decided 23 Sep 2026.
- `@alex` always resolves within the organisation of the issue it appears
  in. Every issue is org-scoped, so resolution is never ambiguous.
- The query language (`assignee: @alex`) and MCP are always in an org
  context, so neither needs to change.
- The profile shows one handle per organisation:
  *"Your handle in Acme Corporation: @alex"*.

### Why not a single global username

A global handle produces a land-grab: `alex` gets claimed by a stranger and
everyone ends up as `alex-lee-2`. Per-org handles cost one oddity — a
person in three organisations has three handles — which nobody notices,
because you are always looking at one organisation at a time.

### Mentions resolve by ID, not by handle

`mentions` rows are written at save time carrying the **user ID**. Rendering
resolves through that table, never by re-parsing `@handle` out of the
markdown. Combined with reserved usernames, a mention written in 2026 still
names the right person in 2030.

## Shared email addresses and personal accounts

The scenarios that look alarming, resolved by the core rule:

| Scenario | Outcome |
|---|---|
| `foo@gmail.com` is removed from Org A | Account untouched. They can still sign in. |
| …and they are also in Org B | Org B membership entirely unaffected. Org A's admin never had power over it. |
| …and Org A was their only organisation | They sign in and land on *"You're not a member of any organisation"* — create one, or accept an invite. |
| A client creates an org, invites people, then removes them all | Same. Everyone keeps their account and any other memberships. |
| The client leaves entirely | Ownership must be transferred first, or the organisation deleted. |
| Someone later invites `foo@gmail.com` to Org C | Works immediately. Same account, new membership, fresh per-org username. |
| The same person has a work email **and** a personal Gmail | Two separate accounts. That is correct — they are two identities, and the product should not try to be clever about merging them. |

The one genuine risk in this space is account **takeover**, and it is handled
elsewhere: an OAuth login links to an existing account only when the provider
asserts the email is verified. See
[auth-and-tenancy.md](./auth-and-tenancy.md).

## Account deactivation

Performed by the user in their profile, or by the platform operator.

- Cannot sign in. All sessions and tokens revoked.
- Memberships retained, so reactivation restores everything, until the account is erased.
- Attribution unchanged — the name still renders.
- Org admins see the member as *Inactive* and may remove them normally.

**As built in 6b** (API half, 27 Sep 2026, decided with the owner):

- **By the holder:** `POST /v1/me/deactivate` with the step-up confirmation
  ([auth-and-tenancy.md § Step-up confirmation](./auth-and-tenancy.md#step-up-confirmation)).
  **By the operator:** `bun run --cwd apps/api account deactivate <email>` — a script calling
  the same service, never a route.
- **An Owner is refused** (`409 account.owns_organization`, the slugs in `valid_values`) while
  they own any organisation not yet deleted, one whose deletion is scheduled included: the
  Owner must stay reachable to cancel it. Transfer ownership or let the deletion finish first.
- **What it changes, in one transaction:** `users.deactivated_at` is stamped; every session is
  deleted (and dropped from the cache after commit); every PAT gets `revoked_at`; every unused
  one-time token the account holds or offered is deleted, which cancels ownership transfers to
  or from it. Then a confirmation email. Memberships, project roles, assignments, watches,
  notifications and preferences are untouched; the fan-out and the digests already skip a
  deactivated recipient, and the storage and deletion emails to admins skip one too.
- **Six-month erasure** (owner, 10 Oct 2026): six months after `deactivated_at`, the account is erased
  by the erasure rules below. Reactivation is possible only before that; once erased, the email is
  hashed and the account cannot come back. A nightly job, `accounts.erase`, runs
  it, as `issues.purge` does for deleted issues.
- **Rendering.** Every `MemberRef` carries `deactivated`: the real name and avatar, greyed
  out — never *Deleted user*. A deactivated member is offered in no assignee, watcher, mention
  or reassign picker, and cannot be newly assigned; what they already hold stays.
- **Reactivation is the operator's** (owner, 27 Sep 2026): `bun run --cwd apps/api account
  reactivate <email>`, on an emailed request. It clears `deactivated_at` and emails the
  account; memberships come straight back, while sessions and tokens do not — the person
  signs in again and makes new tokens. There is no self-service reactivation: the account
  would need to record who deactivated it, so that an operator's deactivation could not be
  undone by the account itself.

## Account erasure

On an explicit erasure request.

**Manual, and not built in v1** (owner, 27 Sep 2026). The person — or an Org Admin on their
behalf — emails the platform operator, who performs the erasure by hand. There is no route and no
button; the operator runs it by script. A deactivated account is erased the same way six months
after deactivation, by the nightly job above. What an erasure must do, once it is done, is below.

- The `users` row is **kept**, so every foreign key still resolves.
- `name` → `Deleted user`, `email` → an irreversible hash (so the address
  cannot be re-registered onto the corpse of the old account), `avatar_url` →
  null, `password_hash` → null, provider IDs → null.
- Comment and description bodies are **not** rewritten. If someone needs
  their words removed, that is a separate, manual request — silently editing
  historical records would make the audit trail untrustworthy. (Requirement 1.15's
  "anonymise authored content" means the attribution, not the text — owner, 27 Sep 2026.)
- `org_activity` is not rewritten either: an old entry naming their email stays, as the audit
  trail (owner, 27 Sep 2026).
- The last sign-in IP address and country, invitation IP addresses and recent searches are cleared.
- `deleted_at` is stamped so the state is explicit rather than inferred.

## What happens to their work

| Artefact | On org removal | On erasure |
|---|---|---|
| Issues created | Kept, attributed by name | Kept, attributed to `Deleted user` |
| Issues assigned (open) | Reassigned, with an activity row | Unchanged |
| Issues assigned (resolved) | Unchanged | Unchanged |
| Comments | Kept | Kept, attributed to `Deleted user` |
| Time entries | Kept, `author` unchanged | Kept |
| Attachments | Kept | Kept |
| Activity rows | Kept | Kept |
| Saved views | Deleted or transferred | Deleted |
| Sessions, PATs | Revoked | Revoked |
| Notifications | Stop: nothing new is written, and that organisation's entries leave their inbox | Stop: nothing new is written or emailed |
| Org membership | Soft-deleted | Soft-deleted |
