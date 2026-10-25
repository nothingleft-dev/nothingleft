# Notifications

Your inbox tells you when something needs you: an issue assigned to you, a mention, a comment
on something you watch, a due date coming up. Email is off until you turn it on, kind by kind.
Everything here is also available to an AI agent through the [MCP tools](./mcp.md).

## What you are told about

| Kind | You hear it when |
| --- | --- |
| Assigned / Unassigned | Someone assigns an issue to you, or takes you off one |
| Mentioned | Someone writes `@you` in an issue, a comment, logged time or a knowledge base article |
| Comments | Someone comments on an issue you watch |
| Status changes | An issue you watch changes status |
| Resolved | An issue you created or watch is resolved - this replaces the status change |
| Links | An issue you watch is linked to another |
| Due tomorrow / Overdue | An issue assigned to you - or that you created, when nobody is assigned - is due tomorrow, or its due date has passed |
| Time logged | Someone logs time on an issue you watch or are assigned to |
| Sprint started / finished | A sprint with an issue assigned to you starts or finishes |
| Article published / updated | An article is published in a project you are a member of, or an article you watch changes |
| Pull request merged | A pull request linked to an issue you watch or are assigned to is merged |
| CI failing | Checks start failing on a pull request linked to an issue assigned to you |

You watch an issue automatically when you create it, are assigned to it or comment on it, and
you can watch any issue yourself. See [Issues](./issues.md).

A few rules hold for every kind:

- **Never about your own actions.** Assigning yourself tells nobody. The same goes for what
  your git work sets off: merge a pull request and you are not told it was merged, nor that an
  [automation](./automations.md) then resolved the issue. Everyone else is.
- **Only what you can open.** You are never told about an issue in a project you are not in.
  If you leave a project, what you were told about it leaves your inbox too, and comes back if
  you rejoin. A deleted issue leaves with it, and returns if it is restored. An article taken
  back to draft stays in the inbox of the people who can read the draft: its author while they
  can still edit in the project, and the project's admins.
  When something you watch is linked to an issue in a project you cannot open, the
  notification says *an issue in another project* instead of its key.
- **Once per thing that happened.** If you are mentioned in a comment on an issue you watch,
  you get one notification - the mention - not two.
- **Due dates in your timezone.** *Due tomorrow* and *Overdue* arrive once per issue, from 9am
  where you are, using the timezone in your profile.

### Why notifications wait ten minutes

A change reaches you ten minutes after it was first made. People correct themselves:
assigning an issue to the wrong person and fixing it a minute later sends **one**
notification, to the right person. A change that is undone inside the window - a status set
and set back - tells nobody at all, and a mention deleted before the ten minutes are up is
never sent. Starting and finishing a sprint are the exception: they arrive straight away.

## The inbox

The inbox is one list for every organisation you belong to, so a mention in ACME reaches you
even while you are working in another organisation. Each entry shows which organisation it is
from.

Open it from **Inbox** in the sidebar or the inbox icon at the top of every page.

- **One entry per issue.** Twelve changes to ACME-12 are one entry with twelve lines, newest
  first, not twelve rows. The arrow beside an entry opens its lines in place; **Show all**
  lists every one when there are more than ten. Articles are entries too, and a sprint starting
  or finishing is an entry of its own.
- **Opening marks read.** Click a line to go to what it is about and mark that notification
  read; click the entry's title to open the issue or article and mark the whole entry read. An
  entry from another organisation switches you into that organisation first.
- **Filter** by kind (only mentions, say), by project, by organisation when you belong to more
  than one, or to what is unread. The address keeps your filters, so a bookmark reopens them.
- **Mark read** one notification or a whole entry with the tick that appears on hover, or
  everything at once with **Mark all read**. With a kind, project or organisation chosen it
  reads **Mark all matching read** and marks only what matches.
- The number in the header counts **entries** with anything unread. Your dashboard shows the
  newest five under *Inbox*.
- *Due tomorrow* and *Overdue* lines have no person beside them: nobody did anything, the date
  arrived. Someone who has since left the organisation keeps their name, marked *Former member*.

Nothing is ever deleted for you. Read notifications are cleared after 30 days, and unread ones
after 90.

## Email

Every email is **off** until you choose otherwise, in **Settings → Notifications**. For each
kind you pick one of:

| Option | You get |
| --- | --- |
| Off | Nothing by email; the inbox still shows it |
| Instant | An email as soon as the notification arrives (after the ten minutes above). Several changes to one issue at once come as one email |
| Daily digest | One email at 9am your time with everything unread from the last day |
| Weekly digest | The same, on Mondays at 9am |

The kinds are grouped into Issues, Comments, Agile, Knowledge base and Development, and every change saves
as you make it. **Mentioned** is marked *most commonly enabled*: it is the one most people turn
on. **Reactions** are in-app only. *Turn everything off* at the top switches every email off in
one go, and *Undo* in the message that follows puts your choices back. Your choices apply in
every organisation you belong to. Digests use the time zone in your profile
(**Settings → Profile**).

### The digest

A digest comes from one organisation at a time - *Your day in ACME · Nothing Left* - and is
grouped by project, then by kind. Issues assigned to you, mentions and due dates are listed
one by one; comments, status changes and the rest on issues you watch are a single count with
a link to your inbox. Anything you already read in the app is left out, and **a digest with
nothing in it is never sent**.

### Unsubscribing

Every activity email has an unsubscribe link at the bottom, and your email program's own
*Unsubscribe* button works too. It turns off only the kind of email you clicked it in - or,
from a digest, that digest - and nothing else. The link opens a page that says what it will
turn off and waits for you to press **Turn these emails off**, so a mail scanner that follows
links never unsubscribes you; you do not need to be signed in. You can turn it back on in
**Settings → Notifications** at any time.

Emails about your account - password resets, security alerts, invitations, storage warnings -
are not notifications. They are always sent and have no unsubscribe link.

## Asking an agent

*"What's waiting on me in ACME? Mark ACME-12 read, and email me mentions straight away but
everything else once a day"* is three tool calls: `list_notifications`,
`mark_notifications_read` and `set_notification_preferences`. Reading your inbox never marks
anything read. The agent's token needs **issues:read** to read notifications and
**issues:write** to mark them read or change your email choices. The `standup-summary` prompt
also lists what is waiting on you.
