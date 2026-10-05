# Onboarding

Three entry paths. Every one of them ends with the user inside a project,
looking at something actionable.

## Path A — invited, no account yet

1. **Click the invite link.** The landing page states what is being joined
   before asking for anything: organisation name, project name if
   project-scoped, who invited them, and the role they will receive. A link
   that asks for a password before saying what it's for gets abandoned.
2. **Choose a sign-in method** — Google, GitHub, or email + password.
3. **Email verification:**
   - An **email invitation** already proves control of that address, so the
     account is created pre-verified and the flow continues uninterrupted.
   - A **share link** proves nothing, so email + password sign-ups must
     verify before the membership is granted. OAuth sign-ups are verified by
     the provider and continue immediately.
4. **Profile step** — everything pre-filled, nothing mandatory beyond a name. It
   runs *after* the invitation is accepted, because a username belongs to an
   organisation and there is none to belong to until then:
   - **Name** — from the provider, or the email local-part.
   - **Avatar** — a manual upload wins; otherwise provider avatar → Gravatar
     (free, no API key, derived from the email hash) → a DiceBear initials
     avatar. GitHub and Google both return an avatar URL. Full chain in
     [file-storage.md § Avatars](./file-storage.md#avatars).
   - **Username in this organisation** — pre-filled from the email
     local-part, with a suffix if taken, editable.
   - **Timezone** — detected from the browser and shown for confirmation,
     not silently assumed.
   - Password, if they chose that method.
5. **Land directly in the project** they were invited to, or the
   organisation's project list for an org-scoped invite.

No second confirmation is asked for on this path. The primary button said *Join
Acme Corporation*, so the decision was made before the account existed; a card
asking it again would be a dialog about something already answered. Path B's card
exists for the opposite case — somebody who was already signed in and may have
opened the link out of curiosity.

## Path B — invited, account already exists

1. Click the link; sign in if not already.
2. **An explicit confirmation card**, not an automatic join:

   > **Join Acme Corporation?**
   > Alex Lee invited you to the project *Partner Portal* as a
   > **Contributor**.
   > `[ Accept ]` `[ Decline ]`

   The explicit step matters because share links get pasted into group chats.
   Auto-joining on click means anyone who opens a link out of curiosity
   becomes a member, and Org Admins discover it later.
3. **Confirmation**, then a button into the project.

No profile step — they already have one. If they have no username in this
organisation yet, one is generated silently; the confirmation states it and says
where to change it.

## Path C — self sign-up

1. **Sign up** — Google, GitHub, or email + password.
2. **Profile**, pre-filled as in Path A: name, avatar, timezone detected.
   Email + password sign-ups verify their email here; OAuth continues.
   **This is a hard gate**: an unverified account cannot create or join an
   organisation, so it never owns data a provider link could strand
   (auth-and-tenancy.md § Flows).
3. **Create your organisation.** Name, with the slug derived automatically
   and editable. Copy explains it plainly: *an organisation holds your
   projects and your team*.
4. **Create your first project.** Name, with the key derived from the
   initials (`Partner Portal` → `PP`) and editable. **Not skippable** — an
   organisation with no project is a dead end, and the empty state that
   follows would be the user's first impression.
5. **Invite people.** Email chips, or copy a share link. **Skippable**, and
   the skip is prominent — a solo user trying the product should not be made
   to feel the product is broken without a team.
6. **Land on the project's issue list.**

## The frame

Decided 23 Sep 2026. Every screen in all three paths sits in one frame: a step rail
on the left naming what is coming, the current step on the right. It is the same
shape whichever way somebody arrives, and it answers "how much more of this is
there" before they start rather than after. The rail is built per path — the three
step lists are in
[frontend-guide.md § Onboarding and invitations](./frontend-guide.md#onboarding-and-invitations),
which owns how it is built; the visual treatment is in `design/DESIGN-SYSTEM.md § 8d`.

Nothing in the rail is a link. Steps are reached by finishing the one before, or by
the Back button, so the rail cannot be used to skip the one step that is not
skippable.

## The first empty state

This screen is the one every user sees and the one that decides whether they
come back. It offers three things, in this order:

1. **Create your first issue** — primary action, opens the composer.
2. **Connect an LLM** — the MCP setup: generate a token, copy the config
   block for Claude Desktop or Claude Code, one command to verify.
3. **Import from CSV** — for people arriving with existing work.

Built in 2b (decided 26 Sep 2026): **Connect an agent** opens a dialog that creates the
token (named *Claude Code*, scopes `issues:read`, `issues:write`, `comments:write`,
`time:write` ticked, admin scopes left for the person to add), then shows the config with
the token filled in, with one Copy button, for the agent picked from a dropdown (default
Claude Code over HTTP; also Claude Code through the stdio shim, Claude Desktop, Codex,
Cursor, VS Code with Copilot, Antigravity, Windsurf and Gemini CLI). The MCP URL is the
web app's `NEXT_PUBLIC_API_BASE_URL` plus `/mcp`. The verify step is the client's own
check — `claude mcp list` for Claude Code — then asking *"Who am I in Nothing Left?"*. The dialog watches the
token's `last_used_at` and flips from *Waiting for the first call* to *Connected* when it
arrives, so the person sees it work without leaving the page. The token is shown only
there; Settings → Access tokens revokes it.

The second one is deliberately placed level with the first. For an MCP-first
product, this is the moment the difference becomes visible, and burying it in
settings means most users never find the reason the product exists.

No seeded demo data. Fake issues in a real project are noise the user has to
clean up, and they make an empty product look busy rather than ready.

## Returning-user landing

After onboarding, signing in lands on the last project viewed, or:

- **One organisation, one project** → that project's issue list.
- **One organisation, several projects** → the project list.
- **Several organisations** → the organisation switcher, defaulting to the
  most recently used.
- **No organisations** (every membership removed) → *"You're not a member of
  any organisation"*, with options to create one or enter an invite link.
  Never a blank screen or an error.

The server decides: `GET /v1/me/landing` answers `project`, `project_list`,
`org_switcher` or `no_org` with the slug and key to route to. The last project
counts only while it is still readable and not archived; the web app records
it with `PATCH /v1/me/preferences { last_project_key }` on every project
visit. With several organisations the switcher defaults to the session's
current one, else the most recently joined (decided 24 Sep 2026, 1c).

Web decisions (24 Sep 2026, 1c web half): the landing is the app's `/` route,
and signing in with no `next=` goes there. `project` opens the project's issue
list; `project_list` opens `/projects`. `org_switcher` renders a page listing
the organisations with the preferred one marked; choosing one switches the
session and opens `/dashboard`, the same place the sidebar switcher goes.
`no_org` renders the sentence above inside the shell with two actions —
*Create an organisation* (the welcome flow's organisation step) and a field for
an invitation link. Every other route still sends a member of no organisation to
`/welcome`, which is where a brand-new account belongs.

## Progressive disclosure

Nothing is configured during onboarding beyond what is needed to get in.
Statuses, priorities, types, custom fields, sprints, boards and work types
are all seeded with sensible defaults and discovered later. The
configuration-first onboarding — pick your workflow, define your fields,
choose your columns — is precisely what makes enterprise trackers exhausting
to adopt.

## What must never happen

| | Why |
|---|---|
| Asking for a credit card | There is no paid plan. |
| A mandatory product tour | Tours are skipped; empty states are read. |
| Asking for a team size or role at sign-up | Sales questions in a free product. |
| Creating an organisation silently on the user's behalf | Names and slugs are permanent enough to deserve a choice. |
| Landing on an empty dashboard with no suggested action | The most common way a free trial dies. |
