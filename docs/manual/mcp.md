# Connecting an AI agent

Nothing Left speaks the Model Context Protocol (MCP), so an AI agent such as
Claude can read and change your organisation's projects and people with the same
permissions you have. This page connects Claude Code and Claude Desktop.

The agent acts **as you**. It can never do more than your role allows, and a
token can narrow that further. Everything it changes appears in the activity
log under your name.

The quickest way in is the **Connect an agent** card on an empty project: it creates
the token and gives you the command to paste, then says *Connected* when your agent's
first call arrives. The steps below do the same by hand.

## 1. Create a personal access token

1. Open **Settings → Access tokens** and choose **New token**. Your email address
   must be verified first; the link is in the email we sent when you signed up.
2. Name it after where it will live, e.g. `Claude Code on my laptop`.
3. Pick the scopes the agent needs:

   | Scope            | Lets the agent                                     |
   | ---------------- | -------------------------------------------------- |
   | `issues:read`    | Read projects, issues, members, and search         |
   | `issues:write`   | Create and change issues, tags, links, files and shared saved views |
   | `comments:write` | Comment                                            |
   | `time:write`     | Log time                                           |
   | `admin:project`  | Change project settings, statuses and types, and project members' roles |
   | `admin:org`      | Create projects, invite and remove people, change organisation roles and settings, read the audit log |

   Start with `issues:read`. You can create another token later; tokens are
   never edited.

4. Choose **Create token** and copy it. It starts with `nl_pat_` and is shown
   **once**.

Treat the token like a password. Revoke it from the same screen when you stop
using it; the list shows when each token was last used, to within five minutes.

A token limited to certain projects lists them after its scopes. If every one of those
projects is deleted, it shows **no projects** and reaches nothing; it never falls back to
every project. Create a new token for the projects you want.

## 2. Connect Claude Code

Over HTTP, which needs nothing installed:

```sh
claude mcp add --transport http nothingleft https://api.nothingleft.dev/mcp \
  --header "Authorization: Bearer nl_pat_…"
```

Or through the stdio shim, which runs on your machine with Node.js 20 or later:

```sh
claude mcp add nothingleft \
  -e NOTHINGLEFT_TOKEN=nl_pat_… \
  -- npx -y @nothingleft/mcp
```

Run `claude mcp list` to check it connected, then ask Claude _"Who am I in
Nothing Left?"_. It should call `whoami` and answer with your name, your token's
scopes and your organisations.

## 3. Connect Claude Desktop

Claude Desktop starts local servers over stdio, so it uses the shim. Open
**Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "nothingleft": {
      "command": "npx",
      "args": ["-y", "@nothingleft/mcp"],
      "env": { "NOTHINGLEFT_TOKEN": "nl_pat_…" }
    }
  }
}
```

Restart Claude Desktop. Nothing Left appears in the tools menu.

The shim reads two settings:

| Variable              | Meaning                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `NOTHINGLEFT_TOKEN`   | Your personal access token. Required                                                              |
| `NOTHINGLEFT_MCP_URL` | The endpoint. Default `https://api.nothingleft.dev/mcp`; change it only for a self-hosted install |

## Other agents

Every agent below reaches `https://api.nothingleft.dev/mcp` with your token as an
`Authorization: Bearer nl_pat_…` header; the **Connect an agent** dialog writes the exact
config for each.

| Agent | Where the config goes |
| --- | --- |
| Codex (OpenAI) | `~/.codex/config.toml`, a `[mcp_servers.nothingleft]` table with `url` and `http_headers` |
| Cursor | `~/.cursor/mcp.json`, `url` and `headers` |
| VS Code (Copilot) | `.vscode/mcp.json`, a `servers` entry of `type: "http"` |
| Antigravity | Manage MCP Servers → View raw config, `serverUrl` and `headers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json`, `serverUrl` and `headers` |
| Gemini CLI | `~/.gemini/settings.json`, `httpUrl` and `headers` |

ChatGPT's connectors need OAuth rather than a token, which Nothing Left does not offer yet.

## What the agent can do

Everything you can do in the app except handle credentials. The full list, with every
argument, is the [tool reference](./mcp-tools.md).

| Area | Tools |
| --- | --- |
| Finding your way | `whoami`, `list_orgs`, `get_org`, `list_projects`, `get_project`, `describe_project_schema` |
| Searching | `search` (issues and articles in two groups, like the search box), `search_issues` (the same query language as the search bar), `suggest_query` |
| Issues | `get_issue`, `get_issue_description`, `create_issue`, `update_issue`, `bulk_update_issues`, `delete_issue`, `restore_issue`, `get_issue_activity` |
| Custom fields | `list_custom_fields`, `create_custom_field`, `update_custom_field`, `delete_custom_field`, `set_field_values`; values are also `custom_fields` on `create_issue`, `update_issue` and `bulk_update_issues` |
| Links | `link_issues`, `unlink_issues` |
| Knowledge base | `list_articles`, `get_article`, `search_articles`, `create_article`, `update_article`, `delete_article`, `restore_article` |
| Comments | `list_comments`, `add_comment`, `update_comment`, `delete_comment` - on an issue or an article |
| Tags | `list_tags`, with how many issues and articles carry each; tags are added and removed with `create_issue`, `update_issue`, `create_article` and `update_article`; `rename_tag` and `recolor_tag` for a Project Admin, `merge_tags` and `delete_tag` for an Org Admin ([Tags](./tags.md)) |
| Time | `log_time`, `list_work_items`, `update_work_item`, `delete_work_item` |
| Files | `list_attachments`, `get_attachment_url`, `upload_attachment`, `complete_upload`, `delete_attachment` - on an issue or an article; `list_files` - the organisation's files by size, for an Org Admin |
| Saved views | `list_views`, `get_view`, `create_view`, `update_view`, `delete_view` |
| Sprints | `list_sprints`, `get_sprint`, `create_sprint`, `update_sprint`, `start_sprint`, `finish_sprint`, `delete_sprint` |
| Backlog | `get_backlog`, `move_to_sprint`, `reorder_backlog`; story points and the sprint are also fields of `create_issue`, `update_issue` and `bulk_update_issues` |
| Boards | `get_board`, `create_board`, `update_board`, `delete_board` |
| Reports | `run_report` - any of the nine [reports](./reports.md), with the table and series its chart is drawn from; time logged by work type, person, issue or project is `report: time` |
| Notifications | `list_notifications` (your inbox, one row per issue), `mark_notifications_read`, `get_notification_preferences`, `set_notification_preferences`; see [Notifications](./notifications.md) |
| Import and export | `start_csv_import`, `get_import_status` - issues from a CSV file, with a dry run first; `request_org_export`, `get_export_status` - the whole organisation as one download ([Import and export](./import-export.md)) |
| Development | `get_issue_development` - an issue's branches, commits and pull requests, *is it merged?*; `get_pull_request` - one pull request with its checks; `link_pull_request`, `unlink_pull_request` - by hand, for one that never names the issue; `list_git_connections`, `refresh_git_connection`, `remove_git_connection` - the organisation's GitHub and GitLab connections, for an Org Admin; `list_repositories`, `link_repository`, `update_repository_link`, `unlink_repository` - which repositories feed a project's issues, for a Project Admin; `resync_repository`, `list_git_events`, `replay_git_event` - the webhook delivery log and its repairs, for an Org Admin; `list_git_identities`, `claim_git_identity`, `remove_git_identity` - the logins and commit emails that make what you wrote show as yours. Connecting an account carries a token, so it is done in organisation settings |
| Automations | `list_automations`, `create_automation`, `update_automation`, `delete_automation` - the rules that move an issue's status when a branch, commit or pull request happens, or the last subtask is resolved, for a Project Admin; `test_automation` - a dry run on one issue; `list_automation_runs` - what each rule did, and why it left an issue alone ([Automations](./automations.md)) |
| Settings | `create_project`, `update_project`, `update_project_schema`, `create_org`, `update_org_settings`, `get_org_activity`, `update_profile` |
| People | `list_members`, `get_member`, `invite_member`, `create_invite_link`, `manage_roles`, `remove_member`, `list_invitations`, `get_invitation`, `revoke_invitation`, `rotate_invite_link` |

The agent names things the way you do - `ACME-12`, `@alex`, `Alex Lee`, `In Progress`,
`My open bugs` - never by an internal number. The exceptions are a comment and a piece of
logged time, which have no name: the agent uses the number it was shown (`Comment 482`,
`#7`).

A sprint in a few sentences - *"plan September 2026 in ACME for 1–30 Sep, put ACME-12 and
ACME-14 in it with ACME-14 on top, start it, and show me the board"* - is `create_sprint`,
`move_to_sprint`, `start_sprint` and `get_board`. When it ends, *"finish it and move what is
left to October 2026"* is one `finish_sprint`: an unfinished issue always goes somewhere you
name - the backlog or a planned sprint - and the answer lists every one that moved.

Custom fields in a sentence - *"add a Severity select to ACME for Bugs with Low, High and
Critical, set ACME-12 and ACME-14 to Critical, and show me the critical bugs by launch date"* - is
`create_custom_field`, `set_field_values` and `search_issues` with
`severity: Critical sort by: launch`. The agent names fields by name or by their search slug,
options by name and people as you would; see [Custom fields](./custom-fields.md).

The knowledge base in a sentence - *"write a Runbooks page in ACME with two children, publish
the first, tag both payment-outage, and link ACME-12"* - is three `create_article` calls (the
body mentions `ACME-12`, so ACME-12 lists the article under *Referenced by*) and an
`update_article` to publish. *"What happened last time payments broke?"* is one `search` for
`tag: payment-outage`: the outage issues and the write-up come back side by side. Articles are
named by their project and slug or title (`ACME`, `restoring-a-failed-sync`); see
[Knowledge base](./knowledge-base.md).

Reports in a sentence - *"how much of last week went on testing in ACME, and how is the
September 2026 burndown looking?"* - is two `run_report` calls: `report: time` with
`period: Last week`, `group_by: work_type` and `projects: ["ACME"]`, then `report: burndown`
with `project: ACME` and `sprint: September 2026`. The agent reads the same numbers the chart
shows, and an empty report tells it which filter to drop; see [Reports](./reports.md).

Your inbox in a sentence - *"what's waiting on me in ACME? Mark ACME-12 read, and email me
mentions straight away but everything else once a day"* - is `list_notifications` with
`project: ACME` and `unread_only: true`, `mark_notifications_read` with `issues: ["ACME-12"]`,
and `set_notification_preferences` with `instant: ["mentioned"]` and
`everything_else: daily_digest`. Reading the inbox marks nothing read. A token needs
`issues:read` to read notifications and `issues:write` to mark them or change preferences.

A triage in a sentence - *"find the unassigned critical bugs in ACME, read the newest,
tag it needs-repro, give it to Casey and log 20 minutes"* - is four calls:
`search_issues`, `get_issue`, `update_issue` (tag and assignee together) and `log_time`.

### Attaching context

Clients that support MCP resources can attach these directly, for example with `@` in
Claude Code:

| Resource | What it attaches |
| --- | --- |
| `issue://ACME-12` | The issue, with its whole description and latest comments |
| `project://ACME` | The project, today's figures, its active sprint, and its statuses, priorities, types, custom fields, sprints, boards, people and tags |
| `view://My open bugs` | A saved view's query and its first 50 issues |
| `sprint://ACME/september-2026` | A sprint: dates, days left, goal, progress, the daily burndown and its issues |
| `board://ACME/acme` | A board on its active sprint: columns with counts and limits, cards by swimlane |
| `article://ACME/restoring-a-failed-sync` | A knowledge base article, its whole body, tags and latest comments |

Add `?org=acme` when the same key exists in two of your organisations.

### Ready-made prompts

| Prompt | Does |
| --- | --- |
| `triage-issue` | Proposes type, priority, tags and assignee for an issue, with reasons, and applies them once you agree |
| `find-duplicates` | Looks for existing issues like one you are about to file |
| `standup-summary` | What you (or someone) did since yesterday: done, in progress, blocked, time logged - and for you, what is waiting on you from your unread notifications |
| `write-release-notes` | Release notes from the issues resolved in a project over a period |
| `estimate-backlog` | Suggests estimates and story points for unestimated issues from how long similar ones took |
| `sprint-report` | How a sprint is going: done against committed, what was added after it started, the burndown trend and the issues at risk |
| `document-this` | Turns one or more resolved issues into a draft knowledge base article - a runbook, a root-cause write-up or a how-to - and creates it once you agree |
| `why-did-it-change` | Explains an issue's recent changes as a timeline: who or which automation changed what, and what fired it |

In Claude Code they appear as slash commands, e.g. `/mcp__nothingleft__triage-issue ACME-12`.

### Files

An agent that can run commands on your machine, such as Claude Code, uploads a file in
three steps: `upload_attachment` reserves it and answers with a `curl` command, the agent
runs the command, and `complete_upload` attaches the file. The file goes straight from
your disk to storage and never through the conversation. Text the agent has in hand - a
log excerpt, a note - it attaches directly. Claude Desktop cannot run commands, so it can
attach text but not files from disk.

An Org Admin can ask what takes up the organisation's storage: `list_files` lists every
file largest first, with the issue or article it belongs to, and `delete_attachment`
removes one. Connecting your own storage bucket stays in the web app - an agent never
handles its keys ([Storage](./storage.md)).

### Importing a spreadsheet

Ask *"import backlog.csv into ACME"* and the agent hands the file to `start_csv_import` -
as text when it is small, or with the same `curl` step as other files. It answers with the
columns it found and a suggested mapping, then a **dry run**: how many rows would become
issues and, for each one that would not, the row number and why (*"Unknown status Doing"*,
with the statuses ACME has). Nothing is created until the agent calls it again with
`dry_run: false`; `get_import_status` follows the import and lists the rows it skipped.
Importing needs a Project Admin of the project.

## Good to know

**Several organisations.** If you belong to more than one, the agent may need to
say which. When a project key such as `ACME` exists in two of your organisations,
the tool answers with both organisation slugs and the agent asks again with one
of them.

**Deleting and access changes ask you first.** Deleting an issue, an article, a comment, logged
time, a file, a saved view, a planned sprint, a board or a custom field; changing a custom field
or a project's statuses, priorities or types; changing a role, removing a member, revoking an
invitation or replacing a share link - each one stops and asks you in your agent app. A dialog
says what will happen - _remove_member will remove @casey from ACME: 3 open issues reassigned to
@alex … Go ahead?_ - with a **Go ahead** box. Nothing changes unless you tick it and accept, and
the agent cannot answer for you. If your agent app cannot show this question, the tool refuses
and asks you to make the change in the web app instead. Claude Code also asks you before running
a tool that changes something, unless you have allowed it.

**What people write is treated as data.** When the agent reads an issue, a comment, logged time,
an article, a project description or a long-text custom field, the text arrives marked with who
wrote it, and the agent is told not to follow instructions inside it. That helps, but it is no
guarantee: read what the agent proposes before you accept a change.

**Refusals are real.** If your role does not allow an action, the tool says so and
nothing changes; ask an admin for a role rather than working around it. If only the
token stands in the way, the answer names the scope it lacks - _This access token does
not have the time:write scope_ - so create a token that includes it.

**Rate limits.** A token may make 600 requests a minute; one tool call uses two to
four of them.

**Credentials stay in the app.** Creating and revoking tokens, signing devices
out, passwords, two-factor authentication, transferring ownership and deleting
an organisation are never available to an agent. A token can still list your
tokens and signed-in devices.
