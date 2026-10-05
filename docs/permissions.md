# Permissions

Five roles, hardcoded. There is no role management screen and no permission
schemes. This table is the authority — the REST API, the MCP server and every
UI affordance read from one permission module built directly from it.

## Roles

| Role | Scope | Assigned via |
|---|---|---|
| **Org Owner** | Organisation | `organizations.owner_user_id`. Exactly one, transferable. |
| **Org Admin** | Organisation | `org_members.role = 'org_admin'` |
| **Project Admin** | Project | `project_members.role = 'project_admin'` |
| **Contributor** | Project | `project_members.role = 'contributor'` |
| **Observer** | Project | `project_members.role = 'observer'` |

Org role and project role are independent columns. **An Org Admin has
implicit Project Admin on every project in the organisation**, so the columns
below are cumulative left to right.

## Matrix

Legend: ✅ allowed · **own** only own records · ❌ denied

### Organisation

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Read organisation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update organisation settings | ❌ | ❌ | ❌ | ✅ | ✅ |
| View member list | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invite to organisation | ❌ | ❌ | ❌ | ✅ | ✅ |
| Create / revoke org invite links | ❌ | ❌ | ❌ | ✅ | ✅ |
| Change a member's org role | ❌ | ❌ | ❌ | ✅ | ✅ |
| Remove a member from the org | ❌ | ❌ | ❌ | ✅ | ✅ |
| View storage usage | ❌ | ❌ | ❌ | ✅ | ✅ |
| Configure BYO storage | ❌ | ❌ | ❌ | ✅ | ✅ |
| View organisation audit log | ❌ | ❌ | ❌ | ✅ | ✅ |
| Export organisation data | ❌ | ❌ | ❌ | ✅ | ✅ |
| Transfer ownership | ❌ | ❌ | ❌ | ❌ | ✅ |
| Delete organisation | ❌ | ❌ | ❌ | ❌ | ✅ |

Creating an organisation requires only an authenticated account.

How the storage rows apply (decided 28 Sep 2026, 6c):

- *View storage usage* is the storage screen and `list_files`: the organisation's figures
  and every file by size. A token needs `admin:org`. Every member still sees the usage meter
  on the Organization.
- Deleting from that screen is the Attachments row *Delete attachment* on each file; an Org
  Admin holds it everywhere through implicit Project Admin, except in an archived project and
  on a file of a deleted issue or article.
- *Configure BYO storage* is connecting, rotating the key, the browser check, verifying,
  starting or retrying the migration, and disconnecting. **Session only** (a token answers
  `403 auth.session_required`), and connect, rotate and disconnect confirm with step-up.

### Project

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Read project | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create project | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update project (name, description, lead, avatar) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage statuses, priorities, types, work types | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage custom fields | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage project members and their roles | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create / revoke project invite links | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage sprints and boards | ❌ | ❌ | ✅ | ✅ | ✅ |
| Archive project | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete project | ❌ | ❌ | ❌ | ✅ | ✅ |

How the agile row applies (decided 26 Sep 2026, Phase 3): *Manage sprints and boards* is
creating, renaming, starting, finishing and deleting sprints, and creating, changing and
deleting boards; a token needs `admin:project`. **Planning is an issue edit**: putting an issue
into a sprint or the backlog, and reordering the backlog, is *Update issue fields*
(Contributor and up, `issues:write`). Reading sprints, the backlog and boards is *Read
project*. Nothing agile is writable in an archived project.

How the custom-field row applies (decided 26 Sep 2026, Phase 4): *Manage custom fields* is
creating, changing, archiving and deleting fields and their options, and choosing a duration field
as the project's Estimation or Spent time is *Update project*; a token needs `admin:project`.
**Setting a value is an issue edit** — *Update issue fields*, Contributor and up, `issues:write`.
Reading fields is *Read project*. Work item attributes and their values are managed under *Manage
statuses, priorities, types, work types*; choosing a value when logging time follows the time
tracking rows. Nothing is writable in an archived project.

### Issues

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Read issue | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create issue | ❌ | ✅ | ✅ | ✅ | ✅ |
| Update issue fields | ❌ | ✅ | ✅ | ✅ | ✅ |
| Change status | ❌ | ✅ | ✅ | ✅ | ✅ |
| Assign / unassign | ❌ | ✅ | ✅ | ✅ | ✅ |
| Link and unlink issues | ❌ | ✅ | ✅ | ✅ | ✅ |
| Set parent / subtask | ❌ | ✅ | ✅ | ✅ | ✅ |
| Bulk update | ❌ | ✅ | ✅ | ✅ | ✅ |
| Move issue to another project | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete issue | ❌ | ❌ | ✅ | ✅ | ✅ |
| Star, watch, vote | ✅ | ✅ | ✅ | ✅ | ✅ |
| View watchers and voters | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add or remove other watchers | ❌ | ✅ | ✅ | ✅ | ✅ |

Observers may star, watch and vote: those are personal signals that change no
shared data. Everything that alters an issue is denied.

A link is checked on the issue it is made from; the other end needs only
*Read issue* for the caller, and may be in another project (decided 24 Sep
2026, 1d). A subtask link is *Set parent / subtask*, since it writes
`parent_id`.

### Comments

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Read comment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit comment | ❌ | **own** | ✅ | ✅ | ✅ |
| Delete comment | ❌ | **own** | ✅ | ✅ | ✅ |
| React to comment | ❌ | ✅ | ✅ | ✅ | ✅ |

There is no per-comment visibility and no permission groups. Comment
visibility always follows issue visibility.

Ticking a task-list checkbox in rendered markdown is an edit of that text
(owner decision, 24 Sep 2026, 1d): in a description it needs *Update issue
fields*; in a comment, *Edit comment* — so a Contributor ticks only their own
comments' boxes.

### Attachments

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Download attachment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload attachment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete attachment | ❌ | **own** | ✅ | ✅ | ✅ |

Attachments are never edited, only replaced — which is a delete plus an
upload, and is governed by those two rows.

How the rows apply (decided 25 Sep 2026, 1f):

- **Download** is anyone who can read the issue, on every request: the file URL checks
  again each time, so losing access takes effect on the next image load. Someone who
  cannot read the issue gets `404`, never `403`.
- **Upload** onto a comment or a work item also needs the right to edit it — own for a
  Contributor — and, for a work item, time tracking on. Nobody uploads to an archived project.
- **Own** is the uploader (`created_by`).
- A **draft** (uploaded before its issue, comment or work item exists) and a **pending
  upload** belong to the uploader alone: nobody else can see, serve, claim or delete them.
- Claiming drafts with `attachment_ids` needs *Upload attachment* in the project.
- A token needs `issues:write` to upload or delete, and `issues:read` to download.

### Time tracking

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Read work items | ✅ | ✅ | ✅ | ✅ | ✅ |
| Log own time | ❌ | ✅ | ✅ | ✅ | ✅ |
| Log time on someone else's behalf | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit work item | ❌ | **own** | ✅ | ✅ | ✅ |
| Delete work item | ❌ | **own** | ✅ | ✅ | ✅ |

How the rows apply (decided 25 Sep 2026, 1e):

- **Own** is the work item's `author`, not whoever recorded it: time a Project Admin logs
  on a Contributor's behalf is that Contributor's to edit and delete.
- An **author** other than yourself may be anyone who could log their own time in the
  project — Contributor and above there, or an organisation admin — never an Observer.
  Only Project Admin and above may change a work item's author.
- With the project's **time tracking off**, or the project archived, no one may log, edit
  or delete; reading is unaffected. The switch itself is *Update project*.
- A token needs `time:write` to log, edit or delete, and `issues:read` to read.

### Tags

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Apply / remove tags on an issue | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create a new tag | ❌ | ✅ | ✅ | ✅ | ✅ |
| Rename or recolour a tag | ❌ | ❌ | ✅ | ✅ | ✅ |
| Merge or delete a tag | ❌ | ❌ | ❌ | ✅ | ✅ |

Tags are organisation-level and shared by issues **and** knowledge base
articles, so destructive tag operations affect every project and both entity
types, and sit at org level. Creating one is deliberately open — an agent
tagging freely is a feature, and the slug rule prevents near-duplicates.

### Knowledge base

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Read published article | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read draft article | ❌ | **own** | ✅ | ✅ | ✅ |
| Create article | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit article | ❌ | ✅ | ✅ | ✅ | ✅ |
| Publish or unpublish article | ❌ | ✅ | ✅ | ✅ | ✅ |
| Reorder or reparent articles | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete article | ❌ | **own** | ✅ | ✅ | ✅ |
| Comment on article | ❌ | ✅ | ✅ | ✅ | ✅ |
| Apply / remove tags on an article | ❌ | ✅ | ✅ | ✅ | ✅ |
| Star or watch an article | ✅ | ✅ | ✅ | ✅ | ✅ |

The knowledge base is **private to project members**. There is no public
publishing and no anonymous access.

How the rows apply (decided 26 Sep 2026, Phase 3.5):

- **Own** is the article's author (`created_by`). *Read draft article* is own for a
  Contributor: someone else's draft is `404`, as absent, not `403`.
- *Edit*, *Publish or unpublish* and *Reorder or reparent* apply to any article the caller can
  read; a PATCH is checked cell by cell for the keys it carries.
- **Deleting an article with children** asks for a choice. *Move them up* is also *Reorder or
  reparent*; *delete them too* needs *Delete article* on every article in the branch — a
  Contributor may do it only when all of it is theirs. A draft the caller cannot read is not
  counted as a child and never blocks a delete: it moves up into the deleted article's place.
  Restoring is *Delete article* again, on every article coming back with it.
- *Read draft article* for one's **own** drafts is Contributor and up: an author demoted to
  Observer no longer sees their drafts in the tree, in search, in tag counts or in *Referenced by*.
- Commenting is *Comment on article*; editing and deleting a comment follow the Comments rows
  (own for a Contributor). Files follow the Attachments rows.
- Star and watch are personal signals, like issues' — Observers included.
- A token reads with `issues:read`; writes, tags, star and watch need `issues:write`;
  comments need `comments:write`. Nothing is writable in an archived project.

### Saved views and reports

| Capability | Observer | Contributor | Project Admin | Org Admin | Org Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| Run a search | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create a private saved view | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create a project- or org-visible saved view | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit or delete a shared saved view | ❌ | **own** | ✅ | ✅ | ✅ |
| View reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export report to CSV | ✅ | ✅ | ✅ | ✅ | ✅ |

A report never reveals an issue the caller could not open directly. Scoping
is applied before aggregation, never after.

How the report rows apply (decided 27 Sep 2026, Phase 5): every report is *View reports* and
its CSV *Export report to CSV* — every role, and a token needs `issues:read` (without it,
`403 token.scope_missing`). A report is scoped before it aggregates, to the caller's readable
projects narrowed by a token's project list; a project named in a report that the caller cannot
read is `404`. Time and the timesheet show anyone's logged time on an issue the caller can read,
as *Read work items* does.

How the saved-view rows apply (decided 24 Sep 2026, 1c):

- A **private** view is visible to and editable by its owner only.
- A **project** view is visible to everyone who can read that project. Its
  cells are checked in that project: a Contributor there may create one and
  edit or delete their own; the project's Project Admin may edit anyone's.
- An **org** view is visible to every member. Creating one needs Contributor
  in at least one project (the cell is checked at the caller's strongest
  project role); an Org Admin or the owner may edit anyone's.
- Changing a view's visibility or project is checked as creating it anew.
- Search, the list, CSV export and the figures behind the dashboard all run
  the one scoped query (search-query-language.md § Implementation).

### Self-service

Available to every authenticated account regardless of role:

- Update own profile — name, avatar, timezone, per-org username
- Change own password and email
- Enable, disable and reset own 2FA
- Create, view and revoke own personal access tokens
- View and revoke own sessions
- Manage own notification preferences
- Read own notifications and mark them read
- Deactivate own account
- Accept or decline an ownership transfer offered to oneself

Erasing an account is not self-service: the person or an Org Admin emails the platform
operator, who does it by hand (owner, 27 Sep 2026; user-lifecycle.md § Account erasure).

How the security rows apply (decided 27 Sep 2026, 6b; tokens and sessions added 1 Oct 2026):
two-factor, deactivation, creating and revoking personal access tokens, revoking sessions, and
the Owner's *Transfer ownership* and *Delete organisation* are **browser sessions only** — a PAT
of any scope answers `403 auth.session_required` — and the destructive ones take the step-up
confirmation (auth-and-tenancy.md § Step-up confirmation). Listing tokens and sessions stays
open to a PAT. Creating a token and starting an email change also need a verified email address
(`auth.email_unverified`), as creating or joining an organisation does. *Transfer ownership* covers
offering, reading and cancelling the pending offer; *Delete organisation* covers scheduling and
cancelling. Accepting or declining needs only to be signed in as the person the offer names
(`ownership_transfer.wrong_account` otherwise). An Owner whose organisation is not yet deleted
cannot deactivate their account.

How the notification rows apply (decided 27 Sep 2026, 6a): every account reads its own inbox,
unread count and preferences, and marks its own notifications read, whatever its roles; a
token needs `issues:read` to read them and `issues:write` to mark read or change preferences,
as star and watch do (`SELF_SERVICE_SCOPES` in the permission module, every cell tested). The
inbox itself only ever shows a notification about something its reader can open now — a
project left or an issue trashed takes its entries with it (rule 4). An article's entries
follow *Read draft article*: while it is a draft they show to its author only while they are
Contributor or above in that project, to Project Admins and up always, and never to an
Observer (decided 1 Oct 2026). The one-click unsubscribe
link needs no sign-in: its signed token can only turn email off.

## Rules that bind the whole table

1. **A PAT can never exceed its owner's live permissions.** Roles are
   re-evaluated on every request, so revoking project access immediately
   constrains every token that user holds.
2. **Scopes narrow, never widen.** A token scoped to `issues:read` cannot
   write even if its owner is an Org Owner.
3. **One implementation.** The REST API and the MCP server call the same
   permission module. They cannot diverge.
4. **Denials are indistinguishable from absence.** A resource the caller
   cannot read returns `404`, not `403` — otherwise the API confirms the
   existence of issues in projects the caller has no access to. Issue history
   follows it: a `linked` or `unlinked` entry naming an issue in a project the
   caller cannot read keeps its link type and reads `issue: null` — redacted
   rather than dropped, so counts and paging do not change (decided 1 Oct 2026).
   **A missing scope is the one named denial** (decided 26 Sep 2026, 2b): when the
   owner's role grants the capability and only the token's scopes refuse it, the answer
   is `403 token.scope_missing` naming the scope, even for a read — the owner can see the
   resource anyway, so nothing is disclosed. A project outside a restricted token's projects
   stays `404`, and a role that does not grant it stays `forbidden`.
   `missingScope()` in the permission module decides it, and every scoped cell has a test.
5. **Every capability in this table has a test.** A permission matrix that
   is not executable is a permission matrix that drifts.

## Deliberately not implemented

| Concept | Why not |
|---|---|
| Read / Update Issue Private Fields | No private-field concept. Field visibility follows issue visibility. |
| Apply Commands Silently | No command syntax, and silent changes undermine the activity log. |
| Global Create / Update / Delete User | No admin console. Accounts are self-service; the platform operator acts out of band. |
| Permission schemes and custom roles | Five fixed roles. Configurable permissions are the main source of weight in a tracker. |
| Per-comment visibility groups | Comment visibility follows issue visibility. |
