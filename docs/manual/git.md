# Development: GitHub and GitLab

Connect GitHub or GitLab and an issue shows the branches, commits and pull requests that mention
it, with their review and CI state. Nothing changes in how you work at the provider: name the
issue in a branch, a commit message or a pull request, and it is linked.

Everything here is optional. A project with no linked repository shows nothing about git at all.

## Connecting

An Org Admin connects an account once for the whole organisation.

- **GitHub**: install the app on your GitHub organisation or account and choose which repositories
  it may read. The installation is the connection; uninstalling it at GitHub disconnects it.
- **GitLab**: paste a group or project access token with the `api` scope and the **Maintainer**
  role. The server adds a webhook to each repository you link, which needs both; a token without
  `api` is refused when you connect. Each webhook gets its own secret, so there is nothing to copy. A self-managed GitLab works the same way,
  at its own address.
- **Manual mode** (GitHub without the app, for example on a self-hosted install that has not
  registered one): add a webhook to each repository yourself, with the address and secret shown
  once when you connect. An optional token lets the server read a pull request's commits and
  recent history.

The free plan connects 2 accounts per organisation. See [Limits and billing](./limits-and-billing.md).

A connection reads, never writes: it does not comment on pull requests, set statuses or push.

### When a connection needs attention

The Org Admins get an email when a connection stops working: deliveries failing their signature
check, deliveries failing to apply, a token refused, the app suspended or uninstalled. An access
token that expires within 7 days (a GitLab token, or a GitHub token in manual mode) gets one email
ahead of time, and another when it expires. What is
already linked stays; new activity stops arriving until the connection is fixed.

## Linking repositories to a project

A Project Admin links the repositories whose work belongs to the project. Two settings belong to
the repository, shared by every project it is linked to:

- **Merged into**: the branches a merge into counts as merged, `main` by default (the repository's
  default branch). Patterns work: `release/*`.
- **Every project**: let the repository reference issues of every project, for a repository many
  teams share.

Because these two settings reach every project the repository serves, turning *Every project* on
or off, or changing *Merged into* for a repository another project also uses, is for an Org Admin.

Linking can read in recent history: the open pull requests and those updated in the last 90 days,
and the branches whose names mention an issue. The free plan links 10 repositories per project.

## Referencing an issue

Write the issue's key anywhere the provider shows text:

| Where | Example |
| --- | --- |
| A branch name | `feat/ACME-12-login-redirect` |
| A commit message | `ACME-12: keep the return path` |
| A pull request's title or description | `Fixes ACME-12` |
| A pull request's commits | Any commit in it naming the issue |
| A link to the issue | `https://work.example.com/issue/ACME-12` |

Keys are matched whole, in any case: `acme-12` counts, `ACME-120` does not count for ACME-12, and
`xACME-12` counts for nothing. Keys inside code blocks in a description do not count.

**Closing words**: `Fixes`, `Fixed`, `Fix`, `Closes`, `Closed`, `Close`, `Resolves`, `Resolved`,
`Resolve`, `Implements`, `Implemented`, `Implement` before a key (or a list: `Fixes ACME-12, ACME-14 and
ACME-15`) mark the pull request or commit as one that **closes** the issue. Without one it only
**mentions** it. The difference matters to [automations](./automations.md): *Close on merge*
acts only on pull requests that close the issue.

A repository references only the issues of the projects it is linked to (or every project, if it
is set so). A key of another project, or of another organisation, links nothing.

## What an issue shows

The **Development** panel lists, per repository:

- **Pull requests** with their state (open, draft, merged, closed), review (approved, changes
  requested, review requested), CI (passing, failing, running) and whether each closes the issue.
  Their commits are inside them.
- **Branches** that have no open pull request of their own.
- **Commits** that belong to none of the pull requests shown.

The issue also carries a **badge** summing it up - *Merged*, *CI failing*, *Changes requested*,
*Approved*, *In review*, *Draft*, *Branch active*, *Reverted* - in lists and on board cards.
Search by it with `development: {CI failing}`; see [Search](./search.md).

Changes show in the issue's history from *Nothing Left Bot*: a pull request linked or unlinked,
and its state, review or CI changing (once per five minutes, as the net change).

### Linking and unlinking by hand

A Contributor can link a pull request that never names the issue, by pasting its address. It must
belong to a repository the project can reference. Any link can be removed; the same reference
never brings it back, but a new one does (a later commit naming the issue, say).

## Who wrote it

Authors show as members when the server can tell who they are: by their GitHub account if they sign
in with GitHub, by a commit email they have verified, or by an identity they claimed. Otherwise
the provider's login shows, marked *Not linked to a member*.

To have your work show as yours, add your **git identities** in your account settings:

- **A login** at GitHub or GitLab counts at once. An Org Admin can remove a login that is not
  yours; a verified email only you can remove.
- **An email** your commits are written with counts once you follow the link sent to it. Your
  account's own verified address needs no link.

Claiming one updates what that login or address already wrote, in every organisation you belong
to. Identities are used for attribution only, never to sign in.

## Notifications

Two kinds, in-app and off by email until you turn them on: **Pull request merged** for the
assignees and watchers of a linked issue (never the person who merged it), and **CI failing** for
its assignees. See [Notifications](./notifications.md).

## When nothing shows up

1. **Is the repository linked to the issue's project?** Repositories feed only the projects they
   are linked to.
2. **Does the text name the key exactly?** `ACME-12`, not `ACME 12` or `#12`.
3. **Did the delivery arrive?** An Org Admin sees every delivery in the connection's log, with
   its status: done, ignored and why, or failed and why. A failed one can be replayed.
4. **Did the provider send it?** A delivery the provider never sent is not in the log. Redeliver
   it from the provider's webhook settings; the nightly check also re-reads open pull requests.
5. **Is the connection healthy?** A token that expired or an uninstalled app stops deliveries.

## Asking an agent

`get_issue_development` answers *is ACME-12 merged?*, and `get_pull_request`, `link_pull_request`,
`list_repositories`, `list_git_events` and the other development tools do the rest through
[MCP](./mcp.md).
