# Knowledge base

Every project has a private knowledge base: runbooks, decisions, onboarding notes, write-ups
of what went wrong. Articles are markdown, written with the same editor as issues, and only
the project's members can read them. Everything here is also available to an AI agent through
the [MCP tools](./mcp.md).

## Articles form a tree

An article can sit under another, up to three levels deep. There are no separate categories:
an article with articles under it *is* a category, and it can carry its own overview text.

```
Payments
   Architecture overview
   Runbooks
      Restoring a failed sync
      Rotating keys
```

The tree sits beside every page of the knowledge base, with your starred articles above it and
the tags in use below. Fold an article to hide what is under it; the knowledge base remembers
what you folded, on any device.

Drag an article by its grip to reorder it among its neighbours or to move it under another one:
drop it on the top or bottom edge of an article to place it beside that one, or on the middle to
put it inside. From the keyboard, focus an article's title and press `Alt` with `↑` or `↓` to move
it among its neighbours, `→` to put it under the one above, and `←` to move it up a level. A move
that would go deeper than three levels is refused where you made it. Moving an article never
changes its address.

## Writing an article

**New article** (the `+` beside _Knowledge base_, or the `+` on an article to write one under it)
asks for the title first, since the address is made from it, then where to start: a **Runbook**, a
**Decision record**, an **Onboarding guide** or a blank page. The new article is a draft and opens in
the editor. A knowledge base with no articles offers the same starters.

Press `e` or the pencil to edit; click the title to rename it. Headings in the text make a table of
contents beside the article on a wide screen.

## Addresses

Each article has a short address in its project, made from its title when you create it —
_Restoring a failed sync_ becomes `restoring-a-failed-sync`. If the project already has one,
the new article gets a number: `overview-2`. Renaming an article keeps its address, so links
to it keep working; you can change the address yourself, as long as no other article in the
project uses it.

An article's page is `/projects/ACME/articles/restoring-a-failed-sync`, and an agent attaches
it as `article://ACME/restoring-a-failed-sync`.

## Drafts and published articles

A new article is a **draft**: only you and the project's admins can see it. **Publish** it and
every member of the project can read it, Observers included. You can return a published
article to draft at any time; it remembers when it was last published.

If a published article sits under a draft someone else is still writing, readers who cannot
see the draft find the article one level up, under the nearest article they can see.

## Who can do what

| Capability | Observer | Contributor | Project Admin and up |
| --- | :-: | :-: | :-: |
| Read published articles | ✅ | ✅ | ✅ |
| Read drafts | ❌ | their own | ✅ |
| Create, edit, publish, move articles | ❌ | ✅ | ✅ |
| Delete articles | ❌ | their own | ✅ |
| Comment, tag | ❌ | ✅ | ✅ |
| Star and watch | ✅ | ✅ | ✅ |

Nobody outside the project can read its knowledge base, and there is no public or anonymous
access. In an archived project the knowledge base is read-only.

## Deleting and restoring

Deleting an article that has articles under it asks what should happen to them:

- **Move them up** — they take its place, one level higher, in the same order.
- **Delete them too** — the whole branch goes. A Contributor can do this only when every
  article in the branch is their own.

A draft someone else is still writing underneath is never deleted by you: it moves up a level.

A deleted article can be restored for 14 days from **Deleted articles**, at the bottom of the
knowledge base's side panel (it appears when there is something you may restore), and anything deleted along with it comes back
with it — restoring a branch needs the same rights as deleting it. If its address has been taken
in the meantime it gets a number; if the article it sat under is gone, or the branch would now
sit more than three levels deep, it comes back at the top level. After 14 days it is removed for good, with its
comments and files.

There is no version history: the article shows who changed it last, and when.

## Tags

Articles use the same tags as issues — one list for the whole organisation. That is the point:
tag the outage issues and the write-up afterwards `payment-outage`, and one search finds both.
Tags show as chips under the title; the knowledge base lists the tags in use, with how many
articles carry each, so you can filter with one click. When you tag an article, tags already
used on articles are offered first, but any tag can be used.

## Searching

The knowledge base has its own search, over titles and article text, with filters in the same
style as the issue search ([Search](./search.md)):

| Filter | Example |
| --- | --- |
| Tag | `tag: rca`, `tag: rca, incident`, `tag: -draft-notes` |
| Status | `status: draft`, `#published` |
| Who | `created by: me`, `updated by: @alex` |
| When | `updated: {minus 30d} .. Today`, `created: {Last month}` |
| Where | `parent: {Runbooks}` (everything under it), `parent: {No parent}` (the top level) |
| Presence | `has: tag` |
| Order | `sort by: updated desc` |

Words that are not filters search the text; the best matches come first. A name that matches
nothing — `status: archived` — is an error that lists what would work. Issue filters such as
`priority:` do not apply to articles.

Clicking a tag in the side panel filters by it; clicking it again clears the filter. **Knowledge
base** in the main menu searches every project you belong to, one section per project.

The search box at the top of the app shows **issues and articles in separate groups**. When a
query only makes sense for one of them — `priority: High` for issues, `status: draft` for
articles — the other group says so instead of showing results.

## Linking issues and articles

Write an issue key such as `ACME-12` anywhere in an article and it becomes a link to the issue,
struck through once the issue is resolved. The issue in turn lists the article under
**Referenced by**, so whoever opens `ACME-12` finds the runbook or write-up that mentions it —
even if the article was written before the issue existed. A key inside a code block is not a
reference.

`@username` mentions work as they do in issues.

## Comments and files

Articles have comments, with the same editing and deleting rules as comments on issues, and
files: drop or paste them into the editor, or attach them to a comment. An article can hold 50
files; they count toward the organisation's storage like any other attachment.

## Starring and watching

Star an article to keep it in your sidebar. Starring also watches it; you watch an article
automatically when you create it, edit it or comment on it.
