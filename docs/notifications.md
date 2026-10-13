# Notifications

Two categories, governed by entirely different rules.

| | Transactional | Activity |
|---|---|---|
| Examples | Password reset, invitation, quota warning | Assigned, mentioned, commented |
| Email default | **Always sent.** No opt-out. | **Off.** Opt-in per kind. |
| Preference table | Not consulted | `notification_preferences` |
| Unsubscribe link | No | Yes |
| In-app | Some | Always |

The rule behind the split: transactional mail is something the recipient
needs in order to use or secure their account. Activity mail is something
they might want. Sending the second kind by default produces unread mail,
real cost borne personally, and unsubscribes that also kill the first kind.

## Transactional email

Always sent. Not subject to preferences. No unsubscribe link. Every email the system sends,
with its catalogue key, subject, tokens and purpose, is listed in [emails.md](./emails.md).

### Account and security

| Event | Recipient |
|---|---|
| Email verification | The user |
| Password reset requested | The user |
| **Password changed** | The user |
| **Email address changed** | **Both** the old and the new address |
| **Two-factor enabled** | The user |
| **Two-factor disabled** | The user |
| **Two-factor recovery code used** | The user |
| Two-factor recovery codes replaced (6b) | The user |
| **Personal access token created** | The user |
| Account deactivation confirmed | The user |
| Account reactivated by the operator (6b) | The user |
| Account erasure confirmed | The user — sent by the operator by hand; erasure is manual in v1 (owner, 27 Sep 2026) |

The bolded ones were missing from the original list and all belong to the
same pattern: *someone did something security-relevant to your account, and
if it wasn't you, you need to know now.* GitHub, Google and Stripe all send
every one of these. They are the cheapest security control available.

### Organisation and membership

| Event | Recipient |
|---|---|
| Invitation to an organisation or project | The invitee |
| **Removed from an organisation** | The removed member |
| **Role changed to Org Admin or Project Admin** | The member |
| Ownership transfer initiated | Current owner and proposed owner |
| Ownership offer cancelled by the Owner, or declined (6b) | The other party |
| Ownership transfer completed | Both parties |
| Organisation deletion scheduled | All Org Admins |
| Organisation deletion reminder (a day before), cancelled, completed (6b) | All Org Admins |

As built in 6b (27 Sep 2026): "All Org Admins" is every live Org Admin and the Owner whose
account is neither deactivated nor erased, and the deletion date is written as a calendar date
in each recipient's own timezone. Every one of these follows a saved change and is sent best
effort: a mail outage never undoes the change.

### Limits and billing

| Event | Recipient |
|---|---|
| Storage at 95% | Org Admins |
| Storage at 100%, uploads blocked | Org Admins |

The two storage emails (built in 1f, 25 Sep 2026) go to every Org Admin and the Owner,
once per crossing: the 95% one from the upload whose completion crosses 95%, the 100% one
from the first upload refused for lack of space. Both name the two ways out — delete
files, or connect your own R2 or S3 bucket — and link organisation settings. A delete that
brings usage back under 95% re-arms them ([limits-and-billing.md § Storage](./limits-and-billing.md#storage)).
Subjects: *Your storage is almost full · Nothing Left*, *Your storage is full · Nothing Left*.
| 21st member added — seat notice | Org Admins |
| Future: any subscription, payment or plan change | Org Admins |

## Activity notifications

In-app always — there is no switch for it, so the preferences table has no `in_app`
column (decided 27 Sep 2026). **Email off by default**, opt-in per kind with
`off | instant | daily digest | weekly digest`.

| Kind | In-app | Email default | Notes |
|---|:-:|---|---|
| `assigned` | ✅ | off | You were assigned |
| `unassigned` | ✅ | off | |
| `mentioned` | ✅ | off | In an issue, comment, article or work item |
| `commented` | ✅ | off | On something you watch |
| `status_changed` | ✅ | off | |
| `resolved` | ✅ | off | An issue you created was resolved |
| `linked` | ✅ | off | Something you watch was linked |
| `due_soon` | ✅ | off | One day before the due date |
| `overdue` | ✅ | off | |
| `time_logged` | ✅ | off | On an issue assigned to you |
| `sprint_started` | ✅ | off | |
| `sprint_finished` | ✅ | off | |
| `article_published` | ✅ | off | In a project you are a member of |
| `article_updated` | ✅ | off | On an article you watch |
| `reaction` | ✅ | never | In-app only. Nobody needs an email about a 👍. Nothing produces it until comment reactions ship (3.38a, 6f) |

There is no `invited` kind (decided 27 Sep 2026): an invitation is transactional email, and a
kind nothing produces is how two documents drift.

### Recipients

Watchers are the default audience, not the only one. Per kind:

| Kind | Recipients | Produced by |
|---|---|---|
| `assigned`, `unassigned` | The (un)assigned user | `notify.fanout` |
| `mentioned` | The mentioned user, from the `mentions` table | `notify.fanout` |
| `commented`, `status_changed`, `linked`, `time_logged` | Watchers of the issue (`time_logged` additionally its assignees) | `notify.fanout` |
| `resolved` | The issue's creator, plus watchers — **instead of** `status_changed` for that change (decided 27 Sep 2026) | `notify.fanout` |
| `due_soon` | Assignees; the creator when unassigned | `notifications.due`, hourly: issues whose `due_date` is tomorrow in the recipient's timezone, once per issue |
| `overdue` | Assignees; the creator when unassigned | `notifications.due`, hourly: unresolved issues whose `due_date` passed in the recipient's timezone, once per issue |
| `sprint_started`, `sprint_finished` | Assignees of issues in the sprint | `notify.fanout` |
| `article_published` | Every member of the project | `notify.fanout` |
| `article_updated` | Watchers of the article | `notify.fanout` |
| `reaction` | The comment's author | `notify.fanout` |

The actor never receives a notification for their own action. A user in more
than one recipient set for one event gets one row. `due_soon` and `overdue`
are the only kinds not triggered by a write, which is why they need a
scheduled producer; it stamps nothing on the issue and instead checks the
`notifications` table for an existing row of that kind for that issue.

Who can receive anything at all is checked when a notification is written, and again every
time the inbox is read (decided 27 Sep 2026): a live member of the organisation, not
deactivated or erased, who can open the project (the owner and Org Admins open every
project) — and for an article, who can read it now: a published article is every project
member's; a draft is its author's while they are Contributor or above in the project, and
every Project Admin's and Org Admin's (*Read draft article*,
[permissions.md](./permissions.md#knowledge-base)). An author demoted to Observer loses the
entries about their draft; a Project Admin keeps another author's. A removed member, a deactivated or erased
account, and someone mentioned in a project they cannot open receive nothing. Nothing already
in an inbox reveals an issue its reader can no longer open: leave the project and those
entries disappear, rejoin and they return; a trashed issue's entries leave with it and come
back with a restore.

`mentioned` is the one most people eventually turn on. It still ships off, so
the default stays consistent and the choice stays theirs — but the
preferences screen marks it *most commonly enabled* rather than leaving
people to discover it.

## Notification centre

A dedicated inbox, not just a dropdown.

- Unread count in the app header.
- Filters by kind, and by project.
- **Grouped by issue** — twelve changes to one issue read as one entry that
  expands, never twelve rows.
- Mark read, mark all read, click through to the source.
- Read state is per user; nothing is ever deleted on the user's behalf.
- **Across every organisation** the reader belongs to (decided 27 Sep 2026): a mention in
  the other organisation is exactly what an inbox scoped to the current one would hide. Each
  entry names its organisation; the unread count comes in total and per organisation.
- The unread count counts **entries** — issues or articles with anything unread — not rows.

## Coalescing applies here too

Notification fan-out is **deferred past the 5-minute window used for activity coalescing**,
and reads the settled value. The owner set the deferral to **10 minutes after first touch**
(27 Sep 2026): by then every history row it reads is at least five minutes old and can no
longer be rewritten.

This is not a minor optimisation. Without it, assigning an issue to the wrong
person and correcting it thirty seconds later sends two emails, the first of
which is wrong. With it, one notification is sent, and it is correct.

For digests the effect is larger still: a day of thrashing on one issue
becomes one line.

Every issue kind is deferred — mentions and comments too, so a mention edited out or a
comment deleted inside the window never fires — and article publications and updates the
same way. Only `sprint_started` and `sprint_finished` go at once: a deliberate act that
coalescing never rewrites. Decided 27 Sep 2026.

## Digests

### Daily

- Sent at **9am in the recipient's own timezone** — which is why `timezone`
  is captured at first login.
- One per person **per organisation** — the subject names it: *Your day in ACME*.
- Holds the **unread** notifications of the kinds set to that digest since the previous one
  (at most a day, or a week, back): what was already read in the app is not mailed again.
- **Never sent when empty.** An empty digest is the single biggest cause of
  digest unsubscribes.
- Grouped by project, then by kind:

```
Nothing Left — your day

Acme Corporation
  Assigned to you (3)
    SH-622  Organization Onboarding                    Major · In Progress
    PP-641  Partner list icon missing                  Normal · Open
    SH-655  Sync fails on large uploads                Critical · Open
  Mentioned (1)
    SH-630  @alex can you confirm the field mapping?
  Due today (2)
  Overdue (1)
  Updates on issues you watch (12)  →  view in app

Internal Tools
  Assigned to you (1)
```

Counts link into the app rather than expanding inline. A digest that tries to
contain everything gets read by nobody. As built (6a): *Assigned to you*, *Mentioned*, *Due
tomorrow* and *Overdue* list up to five issues each, then *and N more →* the inbox; comments,
status changes, resolutions, links and time logged fold into one *Updates on issues you
watch (N) →* line; sprint and article kinds are one count line each.

### Weekly

Same shape, sent Monday at 9am local, for people whose projects move slowly.
Worth offering: the alternative for those users is `off`, and then they miss
things entirely.

### Overlap with MCP

The `standup-summary` MCP prompt produces essentially this content on demand.
That is a feature, not duplication — the digest is push, the prompt is pull,
and they read from the same query.

## Sender identity

```
From:     Nothing Left <noreply@notifications.nothingleft.dev>
Reply-To: admin@nothingleft.dev
```

The Reply-To is `SUPPORT_EMAIL` (production sets `admin@nothingleft.dev`; unset, mail has no
Reply-To). Emails that ask the reader to write in say *reply to this email*, so they never name an
address that differs between instances; the web app shows the same address from
`NEXT_PUBLIC_SUPPORT_EMAIL`.

A subdomain (`notifications.`) rather than the root domain is the right call
and worth stating explicitly: bulk and transactional mail sent from a
subdomain isolates its sending reputation. If a digest run ever gets marked
as spam, it damages `notifications.nothingleft.dev`, not
`nothingleft.dev` — so your personal and business mail on the root domain is
unaffected. This is standard practice and very hard to undo later.

### Subject lines

Given the product name, subjects must lead with the action. *"Nothing Left —
Reset your password"* reads oddly, even ominously, to someone who has never
heard of the product.

```
Reset your password · Nothing Left
You've been invited to Acme Corporation · Nothing Left
Your storage is almost full · Nothing Left
Your day in Acme Corporation · Nothing Left
```

The product name as a suffix, never a prefix. The first four words carry the
meaning.

### Deliverability requirements

- SPF, DKIM and DMARC configured on `notifications.nothingleft.dev` before
  the first email is sent.
- Plain-text alternative for every HTML email.
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers on every activity
  email, so one-click unsubscribe works in Gmail and Outlook.
- Transactional mail carries no unsubscribe link, because it cannot be
  unsubscribed from.
- As built: the plain text is the source and the HTML is generated from it, so every
  sentence has one copy, in `en.json`. With the chosen provider's credentials unset
  (`EMAIL_PROVIDER`: Resend, Zoho CPaaS or SMTP), every email is logged instead of sent:
  in development with its body and headers, elsewhere by subject key only, since bodies carry
  sign-in links. Production refuses to boot without them.

## Webhooks — v2

Moved out of 6a by the owner on 27 Sep 2026, to after v1.
The design below stands for when it is built.

Organisation-level outgoing webhooks, so teams can wire up Slack, Discord or
CI themselves rather than waiting for native integrations.

```
webhooks(id, org_id, project_id NULL, url, secret,
         events text[], is_active, last_delivery_at,
         failure_count, created_by, created_at)
webhook_deliveries(id, webhook_id, event, payload, response_status,
                   attempt, delivered_at)
```

- Payload signed with HMAC-SHA256 in an `X-Signature` header.
- Retried with exponential backoff, five attempts.
- Auto-disabled after 20 consecutive failures, with an email to Org Admins.
- Events mirror the activity kinds above, plus `issue.created` and
  `issue.deleted`.
- Delivery log visible in settings, with replay.

## Preferences

```
notification_preferences(
  user_id, kind,
  email   enum ('off' | 'instant' | 'daily_digest' | 'weekly_digest')
          default 'off',
  PRIMARY KEY (user_id, kind)
)
```

Rows are created lazily; an absent row means the defaults above. Preferences belong to the
account and apply in every organisation. The preferences screen groups kinds into Issues,
Comments, Agile and Knowledge base, with a "turn everything off" escape hatch at the top:
*Issues* — assigned, unassigned, status changed, resolved, linked, due soon, overdue, time
logged; *Comments* — mentioned, commented, reaction; *Agile* — sprint started, sprint
finished; *Knowledge base* — article published, article updated. The API sends each kind's
area, the options it offers (`reaction`: only off) and the *most commonly enabled* marker, so
the screen declares none of it.

## As built in 6a (API half, 27 Sep 2026)

Decided with the owner. Tables: [data-model.md § Notifications](./data-model.md#notifications).
Routes: `openapi.yaml` under `notifications`. Manual: [manual/notifications.md](./manual/notifications.md).

### The fan-out

- **What schedules it.** `recordFieldChanges` and `recordIssueEvent`, the one writer of issue
  history, note the issue they touched; article writes and article comments note the article;
  starting or finishing a sprint notes the sprint with the assignees of its issues at that
  moment — at *Finish*, before the carry-over moves them. When the request succeeds, each
  subject gets one `notify.fanout` job on a pg-boss queue with policy `stately` and a key per
  subject: one waiting and one running per issue, so every write inside the window shares one
  run, started 10 minutes after the first.
- **What it reads.** The issue's history rows at least five minutes old — settled, since
  coalescing only rewrites a row inside its window. A → B → A deleted its row, so a net-zero
  change notifies nobody; A → B → C is one row, so B never hears. Rows still inside the window
  queue the job again for when they settle.
- **Assignees net out over the batch.** Someone assigned and unassigned inside one settled
  batch hears nothing; the person finally assigned hears once. An issue created in the batch
  starts with nobody, so the people assigned at creation hear `assigned`.
- **Kinds from history.** `created` → `assigned` for the assignees set at creation and
  `mentioned` from the description; an `assignees` change → `assigned` / `unassigned`; a
  `status` change → `resolved` when it moves into a done or cancelled status, else
  `status_changed`; a `description` change → `mentioned`; `commented` → `mentioned` for those it
  names and `commented` for the other watchers (a deleted comment notifies nobody);
  `comment_edited` → `mentioned` for anyone newly named; `linked` → the watchers of each end,
  with the other end's key in `other_issue` only for a watcher who can open its project when the
  row is written, and `null` (read as *an issue in another project*) for everyone else (decided
  1 Oct 2026; the row is not rewritten if access changes later);
  `time_logged` with time added → watchers and assignees, and `mentioned` from its note. Tags,
  files, sprint moves and the other fields notify nobody.
- **Articles.** Published articles only: a draft is readable by its author and the project's
  admins, so it notifies nobody. Published inside the window → `article_published` to the
  project's explicit members; changed inside it → `article_updated` to its watchers; and
  `mentioned` from the body and from comments. A comment on an article notifies only those it
  mentions — the recipient table names issue watchers for `commented`.
- **One row per person per event.** Each row carries a `dedupe_key` (`a:<history row>`,
  `m:comment:42`, `due_soon:<issue>` …) unique per person, so a retried run writes nothing
  twice. Someone in several recipient sets for one event gets the most specific kind:
  assigned, then unassigned, then mentioned, then resolved.

### `notifications.due`

Hourly at :10 UTC. Open, live issues in unarchived projects due within three days either side
of today; recipients are the assignees, or the creator when there are none. In each
recipient's timezone and **from 9am there**, so an instant email never arrives at midnight:
`due_soon` when the due date is tomorrow, `overdue` when it passed within the last three days,
so a long-overdue issue never floods in. Once per issue per person; nothing is stamped on the
issue.

### Email

- **Instant**: one email per person per fan-out run, each change a line with a link to its
  issue. The subject leads with the action: *Casey Kim assigned PP-12 to you · Nothing Left*
  for one change, *3 updates on PP-12 · Nothing Left* for several, *2 of your issues need
  attention · Nothing Left* for the due producer's batch.
- **Digest**: `email.digest` hourly at :05 UTC for whoever it is 9am for (and Monday, for the
  weekly), claimed in `notification_digests` so a restart inside the hour cannot send twice.
- **Unsubscribe.** A signed token — HMAC-SHA256 under `EMAIL_LINK_SECRET` over the account and
  what it turns off — rather than `one_time_tokens`: an unsubscribe link must keep working for
  as long as the email exists and more than once, and a row per email sent would outgrow
  `notifications`. Rotating the secret breaks every link already sent. One click on an instant
  email turns **that email's kinds** off; on a digest, every kind on that cadence. Nothing else
  changes. `List-Unsubscribe` points at `POST /v1/notifications/unsubscribe` (RFC 8058
  one-click); the link in the body opens the web page `/unsubscribe?token=`, which asks before
  it acts, so a link scanner unsubscribes nobody.

### Retention

`notifications.purge`, nightly at 03:15 UTC: read rows 30 days after they were read, unread
rows 90 days after they were written.

### Access

Reading the inbox, its unread count and one's preferences is self-service
([permissions.md § Self-service](./permissions.md#self-service)); a token needs `issues:read`.
Marking read and changing preferences need `issues:write`, as star and watch do.

An entry from another organisation than the session's current one is expanded and marked read
by naming its organisation — `org` on `POST /v1/notifications/read` and `?org=` on the two
subject lists — and the subject is then found among the reader's own organisations and the
projects they can open there (decided 27 Sep 2026, for 6a-ui). `GET /v1/notifications/facets`
gives the inbox's pickers every organisation the reader belongs to and every project with
something in their inbox. The
unsubscribe routes need no sign-in: the token is the credential, and it can only turn email off.
