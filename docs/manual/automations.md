# Automations

An automation moves an issue's status for you when something happens in git, or when the last
open subtask of an issue is resolved. *Close on merge* is the common one: merge the pull request
that fixes ACME-12 and ACME-12 is Fixed, with a line in its history that says why.

Automations belong to a project. Project Admins create and change them; everyone who can read
the project sees them and what they did. They need a GitHub or GitLab repository linked to the
project for the git triggers; *Resolve parent* works without one.

## What can fire a rule

| Trigger | When |
| --- | --- |
| Branch created | A branch whose name mentions the issue is created, or its first push arrives |
| Commit pushed | A commit whose message mentions the issue is pushed |
| Pull request opened | A pull request that mentions the issue is opened or reopened, starts mentioning it while open, or is linked to it by hand while open |
| Pull request ready for review | A draft pull request linked to the issue is marked ready |
| Pull request merged | A pull request linked to the issue is merged |
| Pull request closed | A pull request linked to the issue is closed without merging |
| Revert merged | A revert of the issue's work is merged |
| Subtasks resolved | Someone resolves the last open subtask of the issue |

Each rule does one thing: it sets the issue's status.

## Conditions

A rule can ask more before it acts. It checks the issue as it is when the event arrives, not as
it was when the event was sent.

- **Status category** - only issues that are, say, not started yet.
- **Issue type** - only bugs.
- **Closes the issue** - the pull request or commit says `Fixes ACME-12` or `Closes ACME-12`,
  not just `ACME-12`. *Pull request merged* acts only on these unless you say otherwise.
- **Into these branches** - a merge into `main` or `release/*`. Left out, the repository's merge
  branches count (its default branch, unless the repository says otherwise).
- **No other pull request still open** - when ACME-12 has two open pull requests, the first merge
  leaves it alone. A pull request closed without merging counts as abandoned, not as unfinished
  work, so it never holds the issue open. On by default for *Pull request merged*.
- **No other open pull requests** - a pull request closed without merging moves the issue back
  only if nothing else is still open for it. On by default for *Pull request closed*.
- **Draft or not**, **to the default branch**, and **at least this many subtasks**.

## Templates

Five ready-made rules, offered and never switched on for you. Each fills in the first fitting
status of your project:

| Template | Does |
| --- | --- |
| Start work on branch | A new branch for an issue not yet started moves it to your first *started* status (In Progress) |
| Review on pull request | A pull request marked ready for review moves the issue to *In Review*, if your project has that status |
| Close on merge | Merging the pull request that closes the issue, once none of its other pull requests is still open, moves it to your first *done* status (Fixed) |
| Reopen on revert | A merged revert moves a done issue to *Reopened* |
| Resolve parent when subtasks are done | Resolving the last open subtask moves the parent to your first *done* status |

## The order rules run in

Rules for the same trigger run in their order, top first. The first one that changes the issue
ends it: two rules never fight over one issue. A rule that would set the status the issue already
has does nothing.

**A change an automation makes never fires another rule.** If *Close on merge* resolves the last
subtask of ACME-10, ACME-10 stays as it is; if Alex Lee resolves that subtask by hand, *Resolve
parent* runs.

## What you see afterwards

- **In the issue's history**, the change is made by *Nothing Left Bot* and names the rule and its
  cause: *Nothing Left Bot · Close on merge · Status: In Review → Fixed, because acme/web#42 was
  merged by @alex-lee*. *Updated by* on the issue still names the last person who changed it.
- **In the run log**, every time a rule looked at an issue: what it changed, or why it left the
  issue alone (*already in that status*, *a condition did not hold*, *the project is archived*,
  *its status no longer exists*). Kept for 90 days.
- **In notifications**, the usual *status changed* or *resolved*, except for the person whose git
  work set it off: merge the pull request yourself and you are not told about the change it
  caused. See [Notifications](./notifications.md).

## Testing a rule

A dry run on one issue says what the rule would do to it now - *would move ACME-12 from In
Review to Fixed*, or why it would leave it alone - and changes nothing.

## When things change around a rule

- **You rename a status**: every rule that sets it follows the new name.
- **You archive or delete the status a rule sets**: the rule is marked *status missing* and skips
  until you point it at another status.
- **The project is archived**: rules skip, and the run log says so.
- **A webhook delivery is replayed**: rules run only when the replay asks for them, and only for
  what the replay itself changes - a pull request already recorded as merged does not count as
  merged again, while commits it carries do. Reading
  in a repository's history when it is first linked never runs them.

## Limits

The free plan allows 10 automations per project. See [Limits and billing](./limits-and-billing.md).

## Asking an agent

`list_automations`, `create_automation`, `update_automation`, `delete_automation`,
`test_automation` and `list_automation_runs` do all of this through [MCP](./mcp.md); the
`why-did-it-change` prompt explains an issue's recent changes, automated ones included.
