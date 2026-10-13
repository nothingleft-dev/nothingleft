# Getting started

Four short steps take you from sign-up to your first issue. Joining someone else's
organisation from an invitation is shorter still.

## What you need

An email address, or a Google or GitHub account. There is no card to enter and no tour.

## 1. Sign up

On **Create your account**, choose **Google** or **GitHub**, or fill in your **Full name**,
**Work email** and **Password** and choose **Create account**.

- **Google or GitHub** sign-ups are verified by the provider, so you carry straight on.
- **Email and password** sign-ups must confirm the address first. We email you a link that
  works for 24 hours. Until you open it, the next steps show **Confirm your email first**,
  with **Check verification** and **Resend email**. An unverified account cannot create or
  join an organisation. If you mistyped the address, sign up again with the right one.

The rail on the left names the four steps that follow; **Back** returns to an earlier one.

## 2. Check your details

Your name comes from the provider or your sign-up form. Your time zone is detected from the
browser and shown for you to confirm; dates and times are displayed in it. A photo is
optional - your Gravatar or your initials stand in until you upload one.

## 3. Create your organisation

An organisation holds your projects and your team. Give it an **Organisation name**, such as
`Acme Corporation`. The **Organisation ID** is derived from the name as you type
(`acme-corporation`) and you can edit it: lowercase letters, numbers and hyphens. It is the
organisation's address, the `acme` in `X-Organization: acme` when you call the API.

## 4. Create your first project

This step cannot be skipped: an organisation with no project has nowhere to put work.

Give the project a **Project name**. The **Project key** is derived from its initials -
`Partner Portal` becomes `PP` - and every issue key starts with it: `PP-1`, `PP-2`. A key is
2–10 letters or digits. You can change it until the project's first issue exists; after that
it is fixed, because every key already handed out would stop working. If the key is taken,
the form suggests a free one.

## 5. Invite people

Anyone you add joins the organisation and the new project in one step. There are two ways:

| Way           | How it works                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| By email      | Type addresses, pick a **Role in this project** and a **Role in the organisation**, and choose **Send invitations** |
| By share link | Copy a link that anyone can use to join. You can revoke it at any time                                              |

Organisation roles are **Org Admin** and **Member**; project roles are **Project Admin**,
**Contributor** and **Observer**. What each can do is in [Permissions](./permissions.md).

This step is optional. Choose **Skip for now** to work alone and invite people later, or
**Finish** once you have sent your invitations.

## Your first project

You land on the project's issue list. It is empty on purpose: there is no demo data, so
everything you see is yours. Two cards offer a way in.

**Create your first issue.** Choose **Create issue**, or press `c`. A title is enough; you need
to be a Contributor or above. The project already has everything an issue needs:

| What       | A new project starts with                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Statuses   | Submitted, **Open**, In Progress, Reopened, Can't Reproduce, Duplicate, Fixed, Won't fix, Obsolete, Closed |
| Priorities | Show-stopper, Critical, Major, **Normal**, Minor                                                           |
| Types      | **Bug**, Feature, Task, Epic                                                                               |
| Work types | **Development**, Documentation, Implementation, Investigation, Maintenance, Observation, Testing           |
| Board      | One board named after the project, with _To do_, _In progress_ and _Done_ columns and a row per epic       |

Defaults are in bold. A Project Admin can change every list and the board; see
[Issues](./issues.md#project-settings-statuses-priorities-types-work-types).

**Connect an LLM.** Choose **Connect an agent** to let an AI agent file, triage and comment on
issues as you. The dialog creates an access token named _Claude Code_ with the `issues:read`,
`issues:write`, `comments:write` and `time:write` scopes, then shows the config for the agent
you pick, token filled in, with one **Copy** button. When the agent makes its first call, the
dialog changes from _Waiting for the first call_ to _Connected_. The token is shown only in that
dialog; revoke it under **Settings → Access tokens**. You need a verified email address first.
The full setup is in [Connecting an AI agent](./mcp.md).

## Joining from an invitation

If someone invited you, open their link instead of signing up. The page says what you are
joining before it asks for anything: the organisation, the project if there is one, who
invited you and the role you will get.

### You have no account yet

1. Sign up with Google, GitHub, or your email and a password. The button reads
   **Join Acme Corporation**, so pressing it is your answer; nothing asks again.
2. An **email invitation** already proves the address is yours, so the account is verified at
   once. A **share link** proves nothing: with an email and password, confirm the address
   before you join. Google and GitHub sign-ups carry on.
3. Check your profile: name, photo, time zone, and your **username in this organisation**. It
   is pre-filled from your email address, with a suffix if it is taken, and you can edit it.
4. You land in the project you were invited to, or the organisation's project list.

### You already have an account

1. Open the link and sign in if you are not already.
2. A card asks **Join Acme Corporation?** and names the project, who invited you and your
   role. Choose **Accept** or **Decline**. Nothing happens to your account until you accept,
   and a share link needs a confirmed email address first.
3. The confirmation has a button into the project. If you had no username in this
   organisation, one is generated for you; the confirmation names it and says where to change
   it.

Declining an email invitation uses it up. If that was a mistake, ask for another.

## During the beta

There is no subscription charge while Nothing Left is in beta, for teams of any size. The
first 20 members of every organisation stay free permanently, and any future charge for more
seats comes with advance notice. Each organisation has 5 GB of file storage; connecting your
own bucket lifts that limit. The details are in [Limits and billing](./limits-and-billing.md).

## What's next

| Page                                          | Covers                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| [Issues](./issues.md)                         | Fields, keys, comments, links, time and files             |
| [Searching for issues](./search.md)           | The query language and saved views                        |
| [Sprints, backlog and boards](./agile.md)     | Planning sprints, ordering the backlog, working the board |
| [Knowledge base](./knowledge-base.md)         | Runbooks and notes beside the issues they explain         |
| [Connecting an AI agent](./mcp.md)            | Tokens, scopes and every agent's config                   |
| [Limits and billing](./limits-and-billing.md) | Seats, storage and what the beta includes                 |
