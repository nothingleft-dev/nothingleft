# Knowledge Base

A private, per-project documentation space — product docs, internal runbooks,
decisions, onboarding notes. A wiki, deliberately much smaller than most.

Markdown-only, like everything else, which makes it the single highest-value
surface for the MCP server: an agent that can read a project's documentation
before touching its issues gives markedly better answers.

## Structure — a tree, not categories

**Articles form a tree via `parent_id`. A "category" is simply an article
that has children.**

This departs from the obvious design (a separate `categories` table that
articles are assigned to). Documentation tools that start near that model tend
to end up here, for reasons that show up quickly:

| | Separate categories | Article tree |
|---|---|---|
| Concepts to learn | 2 | 1 |
| Nesting when docs grow | Needs a second mechanism | Already works |
| A category with a useful overview page | Impossible — categories hold no content | It is just the parent article |
| Deleting a category | Orphans its articles; needs a policy | Cascades or reparents, obviously |
| Reordering / reparenting | Two different operations | One drag |

Maximum depth **3**, matching the issue hierarchy. Deeper than that and
nobody finds anything.

```
📄 Partner Portal                     ← acts as a category
   📄 Architecture overview
   📄 API reference
      📄 Authentication
      📄 Webhooks
   📄 Runbooks
      📄 Restoring a failed sync
```

## Data model

```
articles(
  id, org_id, project_id,
  parent_id → articles NULL,
  title, slug,
  body_md            text,
  status: 'draft' | 'published',
  position           int,              -- order among siblings
  created_by, updated_by,
  published_at NULL,
  search_tsv         tsvector GENERATED ALWAYS AS (…) STORED,
  created_at, updated_at, deleted_at NULL,
  UNIQUE (project_id, lower(slug)) WHERE deleted_at IS NULL
)

article_stars(article_id, user_id, created_at)
article_watchers(article_id, user_id, source, created_at)
```

Comments reuse the `comments` table with a nullable `article_id`
(`issue_id` XOR `article_id`), so mentions, reactions, editing and
permissions all behave identically to issue comments without a second
implementation.

Attachments reuse the `attachments` table with a nullable `article_id`, so
private serving, quota accounting and BYO storage all apply unchanged.

## Tags

The tree is **one** hierarchy. Tags are the cross-cutting facet it cannot
express: *"show me every RCA we've written"*, *"every DevOps runbook"*,
*"everything about the payment outage"* — questions whose answers live in
different branches.

**Articles reuse the organisation-level `tags` table**, the same one issues
use.

```
article_tags(article_id, org_id, tag_id, added_at,
             PRIMARY KEY (article_id, tag_id))
```

One vocabulary, one slug rule, one colour palette, one management screen. The
alternative — a separate `article_labels` table — produces two tag systems
that drift, so that `incident` on an issue and `Incident` on an article are
unrelated strings.

Sharing the table unlocks the case that motivates the feature:

```
tag: payment-outage
  → the outage issues   AND   the RCA article
```

One tag, the full story: what broke, and what was written about it
afterwards.

### Behaviour

- Tag autocomplete **ranks** by usage in the current context — article tags
  surface first when tagging an article — but never restricts. A tag used on
  both is the point, not a mistake.
- The tag management screen shows usage counts split by type:
  `rca — 3 issues · 12 articles`.
- The KB sidebar lists tags in use, with counts, as one-click filters.
- Deleting or merging a tag affects both entity types, which is why those
  operations sit at Org Admin level.

## Knowledge base search

Articles get their own `search_tsv` and GIN index, and their own search box
with filters:

```
tag: rca
tag: rca, incident          -- OR within an attribute
tag: -draft-notes           -- negation
created by: @alex
updated: {minus 30d} .. Today
status: draft
parent: {Runbooks}
free text across title and body
```

**Implementation note:** this reuses the `packages/query` tokenizer and
parser with a **second, reduced attribute registry** — not a second parser.
One grammar engine, two vocabularies. Articles stay out of the issue query
language, where `priority:`, `assignee:` and `sprint:` are meaningless, without
paying for a separate implementation.

The global search bar returns **issues and articles in separate groups**, so
one result list never mixes two kinds of thing.

## No versioning

**Articles are not versioned.** There is no `article_versions` table, no
diff, and no restore. The feature carries a table that grows without bound, a diff UI, a restore path
and a retention argument — for a document set that a handful of people edit.

`updated_at` and `updated_by` record the last edit. The edit before it is not
kept.

## Slugs

The slug is unique **per project**, not per parent:
`UNIQUE (project_id, lower(slug)) WHERE deleted_at IS NULL`.

The MCP resource is `article://PROJ/<slug>`, one segment, so a per-parent
slug could not resolve. A flat namespace also means reparenting an article —
one drag in the sidebar — never changes its URL. A collision on create takes
a numeric suffix (`overview-2`), and the partial constraint stops a deleted
article squatting its slug.

**Renaming keeps the slug** (owner, 26 Sep 2026): links and `article://` URIs
outlive a new title. Only an explicit slug change moves it, and a clash there is
refused, not suffixed. Slugs are ASCII letters, digits and hyphens, at most 80
characters (`articleSlug` in `packages/format`).

## Drafts

- A draft is visible only to its author and to Project Admins.
- Published articles are visible to every project member, including
  Observers.
- Unpublishing returns an article to draft; `published_at` keeps the latest
  publish.
- A published article beneath a draft the reader cannot see sits, for that
  reader, under the nearest ancestor they can read — or at the top level
  (owner, 26 Sep 2026). Nothing refuses the combination.

## Deleting

Soft delete, restorable for 14 days. Deleting an article with children needs
a choice (owner, 26 Sep 2026): **move them up** into its place under its
parent, or **delete them too** — the whole branch, which needs the right to
delete every article in it. Restoring brings back what was deleted with it, and
needs the right to delete every article coming back; a slug taken meanwhile takes a
numeric suffix, and a parent that is gone — or one the branch would now sit more than
three levels under — returns it to the top level. A draft the deleting person cannot
see is neither counted nor deleted: it moves up into the deleted article's place.

## Privacy

**The knowledge base is private to project members.** There is no public
publishing, no share-with-anyone link, and no anonymous access. Articles are
served through the same permission module as issues, and an article in a
project the caller cannot read returns `404`, not `403`.

Attachments inside articles use the same authorised-redirect serving as issue
attachments — see [file-storage.md](./file-storage.md).

## Search

Articles get their own `search_tsv` and their own GIN index.

- The knowledge base has a dedicated search over titles and bodies.
- The global search bar returns **issues and articles in separate groups**,
  so one result list never mixes two different kinds of thing.
- Articles are deliberately **not** folded into the issue query language.
  That grammar is issue-shaped — `priority:`, `assignee:`, `sprint:` are
  meaningless for a document — and bolting articles into it would make both
  worse. They get their own attribute registry on the same parser instead.

## Cross-linking

- `PROJ-123` in an article body auto-links to the issue.
- The issue shows a *Referenced by* list of the articles whose body mentions
  its key. Kept in `article_issue_refs` when an article
  is saved, keyed by the text of the key — data-model.md § Knowledge base.
- `@username` mentions work exactly as they do in issues, resolved within
  the project's organisation.

## MCP

The knowledge base is where MCP earns the most, because project
documentation is precisely the context an agent lacks.

| Tool | Purpose |
|---|---|
| `list_articles` | The tree for a project, titles and slugs; `deleted: true` for what can be restored |
| `get_article` | One article as markdown, cut at 8 KB and paged with `offset` |
| `search_articles` | Full-text over titles and bodies, plus `tag:`, `status:`, `created by:`, `updated by:`, `created:`, `updated:`, `parent:`, `has:` |
| `create_article` | Title, body, parent, place, status, tags |
| `update_article` | Partial update, including publish, move, `add_tags` / `remove_tags`, star and watch |
| `delete_article` | `children` (`move_up` or `delete`) for an article with sub-articles; asks you to confirm first |
| `restore_article` | Within 14 days |
| `search` | Issues and articles in two groups |

As built (3.5): the planned `add_article_tags` / `remove_article_tags` are folded into
`update_article`, as 2b folded issue tags into `update_issue` — see mcp.md § Built in 3.5.

Resource: `article://PROJ/<slug>`.

Prompt: `document-this` — turns a resolved issue or a cluster of issues into
a draft article, which is one of the few genuinely good uses of an LLM in a
tracker.

## UI

- **Sidebar tree** with drag to reorder and reparent, collapse state
  remembered per user.
- Same markdown editor as issues, with the `Visual | Markdown` toggle.
- Table of contents generated from headings, pinned on wide screens.
- Breadcrumb reflecting the tree path.
- *Last updated by X, 3 days ago*.
- Star an article; starred articles appear in the sidebar.
- Tags shown as removable chips beneath the article title, matching issues.
- Sidebar tag cloud with counts, as one-click filters.
- Empty state offers a small set of starters — Runbook, Decision record,
  Onboarding guide — rather than a blank page.

As built in 3.5 (27 Sep 2026): the rail, the tree's drag and keyboard moves, where deleted articles live
(a _Deleted articles_ entry at the foot of the rail, shown when there is something to restore) and the
rest of the page are in [ui-conventions.md § Knowledge base](./ui-conventions.md#knowledge-base); how the
web code fits together is in [frontend-guide.md § Knowledge base](./frontend-guide.md#knowledge-base).

## Explicitly not included

| | Why |
|---|---|
| Public / anonymous publishing | This is an internal knowledge base. Public docs are a different product. |
| Version history, diffs, restore | An unbounded table, a diff UI and a restore path, for a document set a handful of people edit. |
| Real-time collaborative editing | Same reasoning as issues: polling, optimistic updates, and last-write-wins with a version conflict warning. |
| Page templates beyond the starters | Templates become a management surface of their own. |
| Approval workflows | Draft and published are the only two states. |
