import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import {
  ARTICLE_STATUSES,
  type Article,
  type ArticleComment,
  type ArticleNode,
  type ArticleSummary,
  type GlobalSearchResult,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import {
  authorsOf,
  code,
  date,
  errorMarkdown,
  facts,
  handle,
  instant,
  join,
  more,
  person,
  table,
  untrusted,
} from '../render.ts';
import { DESCRIPTION_PAGE, commentBlock } from '../render-issue.ts';

type Scope = { org?: string };
const scope = (org: string | undefined): Scope => (org ? { org } : {});
const projectKey = (key: string) => key.trim().toUpperCase();

export const article = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .describe(
    'An article of the project by slug or exact title, e.g. "restoring-a-failed-sync"; list_articles shows them.',
  );
const status = z
  .enum(ARTICLE_STATUSES)
  .describe('"draft" (only you and Project Admins see it) or "published" (every project member).');
const anchor = (side: string) =>
  article.describe(`Place it immediately ${side} this sibling (slug or title). Without before or after it goes last.`);

export const articleUrl = (appBaseUrl: string, project: string, slug: string) =>
  `${appBaseUrl}/projects/${project}/articles/${slug}`;

async function tree(ctx: ToolContext, key: string, org: string | undefined, deleted = false) {
  return ctx.memo(`articles:${org ?? ''}:${key}:${deleted}`, async () => {
    const { data } = await ctx.api.get<ArticleNode[]>(path`/v1/projects/${key}/articles`, {
      ...scope(org),
      query: deleted ? { deleted: true } : {},
    });
    return data;
  });
}

/** An article by slug or title, as the caller can see it; a title several articles share lists their slugs. */
export async function articleSlug(
  ctx: ToolContext,
  key: string,
  name: string,
  org: string | undefined,
  options: { deleted?: boolean; field?: string } = {},
): Promise<string> {
  const nodes = await tree(ctx, key, org, options.deleted);
  const needle = name.trim().toLowerCase();
  const bySlug = nodes.find(n => n.slug.toLowerCase() === needle);
  if (bySlug) return bySlug.slug;
  const byTitle = [...new Map(nodes.filter(n => n.title.toLowerCase() === needle).map(n => [n.slug, n])).values()];
  if (byTitle.length === 1) return byTitle[0]!.slug;
  const field = options.field ?? 'article';
  if (byTitle.length > 1) {
    throw ToolError.local(
      'article.ambiguous',
      { project: key, name },
      { field, valid_values: byTitle.map(n => n.slug) },
    );
  }
  throw ToolError.local(
    'article.not_found',
    { project: key, slug: name },
    { field, valid_values: nodes.slice(0, 50).map(n => n.slug) },
  );
}

const statusLabel = (s: string) => (s === 'published' ? 'Published' : 'Draft');

function articleFacts(a: Article): string {
  return facts([
    ['Status', statusLabel(a.status)],
    ['Path', a.path.length ? a.path.map(p => p.title).join(' › ') : 'Top level'],
    ['Tags', a.tags.length ? a.tags.map(tag => tag.name).join(', ') : null],
    ['Sub-articles', a.child_count ? String(a.child_count) : null],
    ['Created', `${instant(a.created_at)} by ${person(a.created_by)}`],
    ['Updated', `${instant(a.updated_at)} by ${person(a.updated_by)}`],
    ['Published', a.published_at ? instant(a.published_at) : null],
    ['Comments', a.comment_count ? String(a.comment_count) : null],
    ['Files', a.attachment_count ? String(a.attachment_count) : null],
    ['You', [a.me.starred ? 'starred' : null, a.me.watching ? 'watching' : null].filter(Boolean).join(', ') || null],
    ['Deleted', a.deleted_at ? `${instant(a.deleted_at)} — restorable until ${instant(a.restorable_until)}` : null],
  ]);
}

const heading = (a: Article, appBaseUrl: string, verb?: string) =>
  `${verb ? `${verb} ` : ''}**${a.title}** — ${a.project.key}/${code(a.slug)}\n${articleUrl(appBaseUrl, a.project.key, a.slug)}`;

type ShownArticle = Pick<Article, 'slug' | 'project' | 'updated_by' | 'updated_at'>;

/** A body cut at `length` characters, with the marker that says how to read on. */
function bodyPage(text: string, a: ShownArticle, offset: number, length: number): string {
  const page = text.slice(offset, offset + length);
  const end = offset + page.length;
  const framed = page
    ? untrusted(
        { author: handle(a.updated_by.username), date: date(a.updated_at), place: `${a.project.key}/${a.slug}` },
        page,
      )
    : null;
  if (offset === 0 && end >= text.length) return framed ?? '';
  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
  const marker =
    end < text.length
      ? `[truncated — ${kb(text.length - end)} remaining. Call get_article with project: "${a.project.key}", article: "${a.slug}", offset: ${end}]`
      : `[end of article — characters ${offset + 1}–${end} of ${text.length}]`;
  return join(framed, marker);
}

/** Shared with the `article://` resource, which shows the whole body. */
export async function renderArticle(
  ctx: ToolContext,
  key: string,
  slug: string,
  opts: { org?: string | undefined; offset?: number; length: number; comments: number },
): Promise<string> {
  const s = scope(opts.org);
  const { data: a } = await ctx.api.get<Article>(path`/v1/projects/${key}/articles/${slug}`, s);
  const comments =
    opts.comments > 0 && a.comment_count > 0
      ? (
          await ctx.api.get<ArticleComment[]>(path`/v1/projects/${key}/articles/${slug}/comments`, {
            ...s,
            query: { limit: 200 },
          })
        ).data.slice(-opts.comments)
      : [];
  const offset = opts.offset ?? 0;
  return join(
    offset === 0 ? heading(a, ctx.appBaseUrl) : `**${a.title}** — ${a.project.key}/${code(a.slug)}`,
    offset === 0 ? articleFacts(a) : null,
    '---',
    a.body_md ? bodyPage(a.body_md, a, offset, opts.length) : '_No text yet._',
    comments.length
      ? join(
          `---\n\n**Latest comments**${a.comment_count > comments.length ? ` (${a.comment_count - comments.length} earlier — list_comments)` : ''}`,
          ...comments.map(c => commentBlock(c, `${a.project.key}/${a.slug}`)),
        )
      : null,
  );
}

async function answer(ctx: ToolContext, key: string, slug: string, org: string | undefined, verb: string) {
  const { data } = await ctx.api.get<Article>(path`/v1/projects/${key}/articles/${slug}`, scope(org));
  return { markdown: join(heading(data, ctx.appBaseUrl, verb), articleFacts(data)) };
}

const summaryTable = (rows: ArticleSummary[]) =>
  untrusted(
    { author: authorsOf(rows.map(r => r.updated_by)), place: 'the knowledge base search' },
    table(
      ['Project', 'Article', 'Title', 'Status', 'Tags', 'Updated', 'Excerpt'],
      rows.map(r => [
        r.project.key,
        r.slug,
        r.title,
        statusLabel(r.status),
        r.tags.map(tag => tag.name).join(', '),
        date(r.updated_at),
        r.excerpt.slice(0, 160),
      ]),
    ),
  );

export const listArticles = defineTool({
  name: 'list_articles',
  title: 'List articles',
  description:
    "A project's knowledge base as a tree: titles and slugs, drafts marked. An article with sub-articles acts as a category. `deleted: true` lists what you could restore instead.",
  input: z.strictObject({
    project: arg.project,
    deleted: z.boolean().optional().describe('List the deleted articles you could restore, with their deadlines.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}/articles'],
  async run(ctx, args) {
    const key = projectKey(args.project);
    const nodes = await tree(ctx, key, args.org, args.deleted);
    if (args.deleted) {
      return {
        markdown: join(
          `**${key}** — ${nodes.length} deleted ${nodes.length === 1 ? 'article' : 'articles'} you could restore`,
          nodes.length
            ? table(
                ['Article', 'Title', 'Deleted', 'Restorable until'],
                nodes.map(n => [n.slug, n.title, instant(n.deleted_at), instant(n.restorable_until)]),
              )
            : null,
        ),
      };
    }
    const lines = nodes.map(
      n =>
        `${'  '.repeat(n.depth - 1)}- **${n.title}** ${code(n.slug)}${n.status === 'draft' ? ' · Draft' : ''}${n.starred ? ' · ★' : ''}`,
    );
    return {
      markdown: join(
        `**${key}** knowledge base — ${nodes.length} ${nodes.length === 1 ? 'article' : 'articles'}`,
        lines.length ? lines.join('\n') : '_No articles yet._',
        lines.length ? 'get_article reads one; article://PROJ/<slug> attaches it.' : null,
      ),
    };
  },
});

export const getArticle = defineTool({
  name: 'get_article',
  title: 'Get article',
  description: `One knowledge base article as markdown: status, path, tags, the latest comments and the body (cut at ${DESCRIPTION_PAGE / 1024} KB with a marker; call again with offset to read on). Issue keys in it are references you can open with get_issue.`,
  input: z.strictObject({
    project: arg.project,
    article,
    offset: z.number().int().min(0).optional().describe('Character of the body to start from, as the marker says.'),
    length: z
      .number()
      .int()
      .min(1)
      .max(32_768)
      .optional()
      .describe(`Characters of the body to return. Default ${DESCRIPTION_PAGE}.`),
    comments: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('How many of the latest comments to show, 0–20. Default 3.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: [
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}',
    'GET /v1/projects/{key}/articles/{slug}/comments',
  ],
  async run(ctx, args) {
    const key = projectKey(args.project);
    const slug = await articleSlug(ctx, key, args.article, args.org);
    return {
      markdown: await renderArticle(ctx, key, slug, {
        org: args.org,
        offset: args.offset ?? 0,
        length: args.length ?? DESCRIPTION_PAGE,
        comments: args.offset ? 0 : (args.comments ?? 3),
      }),
    };
  },
});

export const searchArticles = defineTool({
  name: 'search_articles',
  title: 'Search articles',
  description:
    'Full-text search over knowledge base titles and bodies, with filters: `tag: rca, incident`, `status: draft`, `created by: me`, `updated by: @casey`, `updated: {minus 30d} .. Today`, `parent: {Runbooks}` (everything beneath it; `{No parent}` is the top level), `has: tag`, `sort by: updated desc`, and free words. Tags are shared with issues. Returns a table with an excerpt of each.',
  input: z.strictObject({
    query: z.string().max(2000).describe('The article query, e.g. `tag: rca payment timeout`. Empty lists everything.'),
    project: arg.project.optional().describe('Only this project, e.g. "PP". Default: every project you can read.'),
    sort: z.string().max(200).optional().describe('`created` or `updated`, with asc or desc.'),
    limit: arg.limit,
    offset: arg.offset,
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/articles'],
  async run(ctx, args) {
    const res = await ctx.api.get<ArticleSummary[]>('/v1/articles', {
      ...scope(args.org),
      query: {
        q: args.query,
        project: args.project ? projectKey(args.project) : undefined,
        sort: args.sort,
        limit: args.limit ?? arg.DEFAULT_LIMIT,
        offset: args.offset ?? 0,
      },
    });
    const total = res.pagination?.total ?? res.data.length;
    return {
      markdown: join(
        `**${total} ${total === 1 ? 'article' : 'articles'}** for ${code(args.query || ' ')}`,
        res.data.length ? summaryTable(res.data) : null,
        more(res.pagination, res.data.length),
      ),
    };
  },
});

export const search = defineTool({
  name: 'search',
  title: 'Search everything',
  description:
    "Issues and knowledge base articles in two groups for one query - the app's search box. One tag reaches both: `tag: payment-outage` finds the outage issues and the RCA written afterwards. Each group reads the query in its own language; one that cannot (e.g. `priority:` for articles) says why and shows nothing.",
  input: z.strictObject({
    query: z.string().max(2000).describe('Words, a tag, or either query language.'),
    project: arg.project.optional().describe('Only this project. Default: every project you can read.'),
    limit: z.number().int().min(1).max(50).optional().describe('Rows per group, 1–50. Default 10.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/search'],
  async run(ctx, args) {
    const { data } = await ctx.api.get<GlobalSearchResult>('/v1/search', {
      ...scope(args.org),
      query: { q: args.query, project: args.project ? projectKey(args.project) : undefined, limit: args.limit ?? 10 },
    });
    const refusal = (e: GlobalSearchResult['issues']['error']) =>
      e
        ? errorMarkdown({
            code: e.code,
            message: e.message,
            ...(e.field ? { field: e.field } : {}),
            ...(e.valid_values ? { valid_values: e.valid_values } : {}),
          })
        : null;
    return {
      markdown: join(
        `**Issues** — ${data.issues.total}`,
        refusal(data.issues.error) ??
          (data.issues.items.length
            ? table(
                ['Key', 'Title', 'Status', 'Type'],
                data.issues.items.map(i => [i.key, i.title, i.status.name, i.type.name]),
              )
            : null),
        data.issues.total > data.issues.items.length ? 'search_issues pages the rest.' : null,
        `**Articles** — ${data.articles.total}`,
        refusal(data.articles.error) ?? (data.articles.items.length ? summaryTable(data.articles.items) : null),
        data.articles.total > data.articles.items.length ? 'search_articles pages the rest.' : null,
      ),
    };
  },
});

export const createArticle = defineTool({
  name: 'create_article',
  title: 'Create article',
  description:
    'Writes a knowledge base article in one call: title, markdown body, parent (up to three levels deep), place among its siblings, status and tags (new names are created). A draft by default. Mention issues by key (PP-12) and they list it under Referenced by; @username mentions notify. Returns the article.',
  input: z.strictObject({
    project: arg.project,
    title: z.string().trim().min(1).max(500),
    body: arg.markdown('The article').optional(),
    parent: article.optional().describe('The article to put it under (slug or title). Default: the top level.'),
    status: status.optional(),
    tags: arg.tagList('Tags').optional(),
    before: anchor('before').optional(),
    after: anchor('after').optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/articles', 'GET /v1/projects/{key}/articles/{slug}'],
  async run(ctx, args) {
    const key = projectKey(args.project);
    const { data } = await ctx.api.send<Article>('POST', path`/v1/projects/${key}/articles`, {
      ...scope(args.org),
      body: {
        title: args.title,
        ...(args.body !== undefined ? { body_md: args.body } : {}),
        ...(args.parent ? { parent: args.parent } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...(args.tags?.length ? { tags: args.tags } : {}),
        ...(args.before ? { before: args.before } : {}),
        ...(args.after ? { after: args.after } : {}),
      },
    });
    return { markdown: join(heading(data, ctx.appBaseUrl, 'Created'), articleFacts(data)) };
  },
});

export const updateArticle = defineTool({
  name: 'update_article',
  title: 'Update article',
  description:
    'Changes one article: only what you pass changes. Title, body (replaced whole), slug, publish or return to draft, move under another parent (null: top level) or before / after a sibling, add or remove tags, and your own star and watch. Renaming keeps the slug. Returns the article.',
  input: z.strictObject({
    project: arg.project,
    article,
    title: z.string().trim().min(1).max(500).optional(),
    body: arg.markdown('The new body, replacing the old').optional(),
    slug: z.string().trim().min(1).max(80).optional().describe('A new address; letters, digits and dashes.'),
    status: status.optional(),
    parent: article
      .nullable()
      .optional()
      .describe('Move it under this article (slug or title); null moves it to the top level.'),
    before: anchor('before').optional(),
    after: anchor('after').optional(),
    add_tags: arg.tagList('Tags to add').optional(),
    remove_tags: arg.tagList('Tags to remove').optional(),
    star: z.boolean().optional().describe('true to star it, false to unstar.'),
    watch: z.boolean().optional().describe('true to watch it, false to stop.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: [
    'GET /v1/projects/{key}/articles',
    'PATCH /v1/projects/{key}/articles/{slug}',
    'POST /v1/projects/{key}/articles/{slug}/tags',
    'DELETE /v1/projects/{key}/articles/{slug}/tags/{tag}',
    'PUT /v1/projects/{key}/articles/{slug}/star',
    'DELETE /v1/projects/{key}/articles/{slug}/star',
    'PUT /v1/projects/{key}/articles/{slug}/watch',
    'DELETE /v1/projects/{key}/articles/{slug}/watch',
    'GET /v1/projects/{key}/articles/{slug}',
  ],
  async run(ctx, args) {
    const key = projectKey(args.project);
    const s = scope(args.org);
    let slug = await articleSlug(ctx, key, args.article, args.org);
    const fields: Record<string, unknown> = {};
    if (args.title !== undefined) fields['title'] = args.title;
    if (args.body !== undefined) fields['body_md'] = args.body;
    for (const f of ['slug', 'status', 'parent', 'before', 'after'] as const) {
      if (args[f] !== undefined) fields[f] = args[f];
    }
    const steps: [string, () => Promise<unknown>][] = [];
    if (Object.keys(fields).length) {
      steps.push([
        'fields',
        async () => {
          const { data } = await ctx.api.send<Article>('PATCH', path`/v1/projects/${key}/articles/${slug}`, {
            ...s,
            body: fields,
          });
          slug = data.slug;
        },
      ]);
    }
    if (args.add_tags?.length) {
      const tags = args.add_tags;
      steps.push([
        'tags added',
        () => ctx.api.send('POST', path`/v1/projects/${key}/articles/${slug}/tags`, { ...s, body: { tags } }),
      ]);
    }
    for (const tag of args.remove_tags ?? []) {
      steps.push([
        `tag ${tag} removed`,
        () => ctx.api.send('DELETE', path`/v1/projects/${key}/articles/${slug}/tags/${tag}`, s),
      ]);
    }
    for (const signal of ['star', 'watch'] as const) {
      const on = args[signal];
      if (on === undefined) continue;
      steps.push([
        `${signal} ${on ? 'on' : 'off'}`,
        () => ctx.api.send(on ? 'PUT' : 'DELETE', path`/v1/projects/${key}/articles/${slug}/${signal}`, s),
      ]);
    }
    if (!steps.length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_article' });
    const applied: string[] = [];
    for (const [label, step] of steps) {
      try {
        await step();
      } catch (error) {
        if (error instanceof ToolError && applied.length) {
          const hint = t('error.mcp.partially_applied', { tool: 'update_article', applied: applied.join(', ') });
          throw new ToolError({ ...error.body, hints: [...(error.body.hints ?? []), hint] });
        }
        throw error;
      }
      applied.push(label);
    }
    return answer(ctx, key, slug, args.org, 'Updated');
  },
});

export const deleteArticle = defineTool({
  name: 'delete_article',
  title: 'Delete article',
  description:
    'Deletes an article, restorable for 14 days (restore_article). One with sub-articles needs `children`: "move_up" puts them in its place, "delete" deletes them with it. Contributors may delete only their own. Asks you to confirm before acting.',
  input: z.strictObject({
    project: arg.project,
    article,
    children: z
      .enum(['move_up', 'delete'])
      .optional()
      .describe('For an article with sub-articles: move them up a level, or delete them too.'),
    org: arg.org,
  }),
  kind: 'destructive',
  endpoints: [
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}',
    'DELETE /v1/projects/{key}/articles/{slug}',
  ],
  async describeAction(ctx, args) {
    const key = projectKey(args.project);
    const slug = await articleSlug(ctx, key, args.article, args.org);
    const { data } = await ctx.api.get<Article>(path`/v1/projects/${key}/articles/${slug}`, scope(args.org));
    const message =
      data.child_count === 0
        ? 'mcp.action.article_delete'
        : args.children === 'delete'
          ? 'mcp.action.article_delete_subtree'
          : args.children === 'move_up'
            ? 'mcp.action.article_delete_move_up'
            : 'mcp.action.article_delete_choose';
    return t(message, { title: data.title, project: key, slug, count: data.child_count });
  },
  async run(ctx, args) {
    const key = projectKey(args.project);
    const slug = await articleSlug(ctx, key, args.article, args.org);
    const { data } = await ctx.api.send<Article>('DELETE', path`/v1/projects/${key}/articles/${slug}`, {
      ...scope(args.org),
      query: args.children ? { children: args.children } : {},
    });
    return {
      markdown: `Deleted **${data.title}** (${key}/${code(data.slug)}) — restorable until ${instant(data.restorable_until)} with restore_article.`,
    };
  },
});

export const restoreArticle = defineTool({
  name: 'restore_article',
  title: 'Restore article',
  description:
    'Brings back a deleted article within 14 days, with any sub-articles deleted along with it. A slug taken since gets a number; a parent that is gone puts it at the top level.',
  input: z.strictObject({
    project: arg.project,
    article: article.describe('The deleted article by slug or title; list_articles with deleted: true shows them.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: [
    'GET /v1/projects/{key}/articles',
    'POST /v1/projects/{key}/articles/{slug}/restore',
    'GET /v1/projects/{key}/articles/{slug}',
  ],
  async run(ctx, args) {
    const key = projectKey(args.project);
    const slug = await articleSlug(ctx, key, args.article, args.org, { deleted: true });
    const { data } = await ctx.api.send<Article>(
      'POST',
      path`/v1/projects/${key}/articles/${slug}/restore`,
      scope(args.org),
    );
    return { markdown: join(heading(data, ctx.appBaseUrl, 'Restored'), articleFacts(data)) };
  },
});

export const referencedByLines = (rows: ArticleSummary[]) =>
  rows.length
    ? `**Referenced by**\n${rows.map(r => `- ${r.project.key}/${code(r.slug)} ${r.title}${r.status === 'draft' ? ' (draft)' : ''}`).join('\n')}`
    : null;

export const articleTarget = {
  project: arg.project.optional().describe('With article: its project key, e.g. "PP".'),
  article: article.optional().describe('Instead of issue: a knowledge base article by slug or title, with project.'),
};

/** The REST prefix for "an issue, or an article of a project", and how to name it in answers. */
export async function commentTarget(
  ctx: ToolContext,
  args: {
    issue?: string | undefined;
    project?: string | undefined;
    article?: string | undefined;
    org?: string | undefined;
  },
): Promise<{ base: string; label: string; kind: 'issue' | 'article' }> {
  if (args.article !== undefined && args.project !== undefined && args.issue === undefined) {
    const key = projectKey(args.project);
    const slug = await articleSlug(ctx, key, args.article, args.org);
    return { base: path`/v1/projects/${key}/articles/${slug}`, label: `${key}/${slug}`, kind: 'article' };
  }
  if (args.issue !== undefined && args.article === undefined) {
    const key = args.issue.trim().toUpperCase();
    return { base: path`/v1/issues/${key}`, label: key, kind: 'issue' };
  }
  throw ToolError.local('mcp.issue_or_article', {}, { field: 'issue' });
}
