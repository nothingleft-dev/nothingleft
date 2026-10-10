# Tags

Tags belong to the whole organisation: one vocabulary for every project, shared by issues and
knowledge base articles. `rca` on a failed payment and `rca` on the write-up afterwards are the
same tag, and `tag: rca` finds both. Adding tags to an issue is described in
[Issues](./issues.md#tags), and to an article in [Knowledge base](./knowledge-base.md).

This page is about looking after the vocabulary itself.

## Seeing every tag

The tag list counts each tag across the whole organisation, split by kind:
`rca — 3 issues · 12 articles`. Tags nobody uses any more are listed too, with nothing beside
them, so they can be tidied away. Search by name narrows the list.

Project Admins of any project, Org Admins and the Owner can open it. Everyone else still sees
tags, with counts over what they can read, wherever they pick one.

## Renaming

Renaming a tag renames it everywhere, in every project, on issues and articles alike. Its
address follows the new name — `Needs Review` becomes `needs-review`, and renamed to
`Awaiting QA` it becomes `awaiting-qa`. Saved views that search for it with `tag:` are
updated to the new name, so they keep finding the same issues. A view that only says
`#Needs-Review` is left as written, because that shorthand also matches statuses, priorities,
types and sprints of that name.

A name another tag already has is refused, since two tags cannot share one address: merge
them instead.

## Recolouring

Pick a colour from the same grid statuses and types use. The tag changes colour everywhere.

## Merging

Merging folds one or more tags into another. Every issue and article that had any of them now
has the one you keep — once, even if it had several — and the others are deleted. Saved views
that searched for a merged tag search for the one you kept.

Use it when the same idea has grown two names: `ui-bug`, `bug-ui` and `frontend-bug` become
`ui-bug`. A merge cannot be undone.

## Deleting

Deleting a tag takes it off every issue and article in the organisation and removes it. The
issues and articles are otherwise untouched. A saved view that searched for it is left as
written and will say the tag no longer exists, so you can edit it. A delete cannot be undone.

## Who can do what

| | Project Admin (of any project) | Org Admin | Owner |
|---|:-:|:-:|:-:|
| See every tag with its counts | ✅ | ✅ | ✅ |
| Rename or recolour a tag | ✅ | ✅ | ✅ |
| Merge or delete a tag | ❌ | ✅ | ✅ |

Merging and deleting sit with Org Admins because they change every project at once. Each
rename, merge and delete is written to the organisation's audit log, with the names before
and after; a new colour is not.

## Asking an agent

An agent connected over [MCP](./mcp.md) can do the same: *"rename the tag needs-review to
Awaiting QA"* is `rename_tag`, *"make rca red"* is `recolor_tag`. `merge_tags` and
`delete_tag` first tell you how many issues and articles would change and wait for you to
agree. Its access token needs the **admin:project** scope to rename and recolour, and
**admin:org** to merge and delete.
