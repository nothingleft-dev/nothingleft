import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import { LABEL_COLORS, type Tag } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { join, list, more, table } from '../render.ts';

const scope = (org: string | undefined) => (org ? { org } : {});
const tagName = z.string().trim().min(1).max(100).describe('A tag by name or slug, e.g. "needs-review".');
const counted = (tag: Tag) =>
  `**${tag.name}** (\`${tag.slug}\`, ${tag.color}) — ${tag.issue_count} issues · ${tag.article_count} articles`;

/** A tag with its uses across the whole organisation, as the management screen counts them. */
async function managed(ctx: ToolContext, name: string, org: string | undefined): Promise<Tag> {
  const { data } = await ctx.api.get<Tag[]>('/v1/tags/manage', { ...scope(org), query: { q: name, limit: 50 } });
  const slug = name.trim().toLowerCase();
  const found = data.find(tag => tag.slug === slug || tag.name.toLowerCase() === slug);
  if (!found)
    throw ToolError.local('tag.not_found', { tag: name }, { field: 'tag', valid_values: data.map(d => d.name) });
  return found;
}

export const listTags = defineTool({
  name: 'list_tags',
  title: 'List tags',
  description:
    'The organisation\'s tags, shared by every project and by issues and knowledge base articles alike, with how many issues and articles you can see carry each. `for` ranks the ones used on that kind of thing first; `in_use` keeps only those in use (a project\'s knowledge base tag list: for: "articles", project, in_use: true). You need not list them before tagging: new names are created on first use.',
  input: z.strictObject({
    query: z.string().trim().max(100).optional().describe('Filter by name.'),
    for: z.enum(['issues', 'articles']).optional().describe('Rank tags used on issues, or on articles, first.'),
    project: arg.project.optional().describe('Count uses in this project only.'),
    in_use: z.boolean().optional().describe('Only tags with a use (on the `for` kind, when given).'),
    org: arg.org,
    limit: arg.limit,
    offset: arg.offset,
  }),
  kind: 'read',
  endpoints: ['GET /v1/tags'],
  async run(ctx, args) {
    const res = await ctx.api.get<Tag[]>('/v1/tags', {
      ...(args.org ? { org: args.org } : {}),
      query: {
        q: args.query,
        context: args.for === 'articles' ? 'article' : args.for === 'issues' ? 'issue' : undefined,
        project: args.project?.toUpperCase(),
        in_use: args.in_use,
        limit: args.limit ?? arg.DEFAULT_LIMIT,
        offset: args.offset ?? 0,
      },
    });
    return {
      markdown: join(
        `**${res.pagination?.total ?? res.data.length} tags**`,
        res.data.length
          ? table(
              ['Tag', 'Slug', 'Colour', 'Issues', 'Articles'],
              res.data.map(t => [t.name, t.slug, t.color, String(t.issue_count), String(t.article_count)]),
            )
          : null,
        more(res.pagination, res.data.length),
      ),
    };
  },
});

export const renameTag = defineTool({
  name: 'rename_tag',
  title: 'Rename a tag',
  description:
    'Renames a tag everywhere it is used - every project, issues and articles alike. Its slug follows the new name, and saved views that name it in `tag:` are rewritten. A name another tag already has is refused: merge_tags joins the two. Needs a Project Admin of any project and a token with admin:project.',
  input: z.strictObject({
    tag: tagName,
    name: z.string().trim().min(1).max(100).describe('The new name.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/tags/{tag}'],
  async run(ctx, args) {
    const { data } = await ctx.api.send<Tag>('PATCH', path`/v1/tags/${args.tag}`, {
      ...scope(args.org),
      body: { name: args.name },
    });
    return { markdown: `Renamed ${args.tag} to ${counted(data)}.` };
  },
});

export const recolorTag = defineTool({
  name: 'recolor_tag',
  title: 'Recolour a tag',
  description:
    'Changes the colour a tag is drawn in, from the 40-name label grid ("red-1" … "gray-5"). Needs a Project Admin of any project and a token with admin:project.',
  input: z.strictObject({
    tag: tagName,
    color: z.enum(LABEL_COLORS).describe('A label colour, e.g. "teal-3".'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/tags/{tag}'],
  async run(ctx, args) {
    const { data } = await ctx.api.send<Tag>('PATCH', path`/v1/tags/${args.tag}`, {
      ...scope(args.org),
      body: { color: args.color },
    });
    return { markdown: `Recoloured ${counted(data)}.` };
  },
});

export const mergeTags = defineTool({
  name: 'merge_tags',
  title: 'Merge tags',
  description:
    'Moves every issue and article tagged with any of `tags` onto `into`, then deletes `tags`; saved views follow. It cannot be undone. Needs an Org Admin and a token with admin:org. Asks you to confirm before acting.',
  input: z.strictObject({
    tags: z.array(tagName).min(1).max(50).describe('The tags to fold in and delete.'),
    into: tagName.describe('The tag they become.'),
    org: arg.org,
  }),
  kind: 'destructive',
  endpoints: ['GET /v1/tags/manage', 'POST /v1/tags/merge'],
  async describeAction(ctx, args) {
    const sources = await Promise.all(args.tags.map(name => managed(ctx, name, args.org)));
    const into = await managed(ctx, args.into, args.org);
    return t('mcp.action.tag_merge', {
      tags: list(sources.map(s => s.name)),
      into: into.name,
      issues: sources.reduce((n, s) => n + s.issue_count, 0),
      articles: sources.reduce((n, s) => n + s.article_count, 0),
    });
  },
  async run(ctx, args) {
    const { data } = await ctx.api.send<Tag>('POST', '/v1/tags/merge', {
      ...scope(args.org),
      body: { tags: args.tags, into: args.into },
    });
    return { markdown: `Merged ${list(args.tags)} into ${counted(data)}.` };
  },
});

export const deleteTag = defineTool({
  name: 'delete_tag',
  title: 'Delete a tag',
  description:
    'Removes a tag from every issue and article in the organisation and deletes it. It cannot be undone. Needs an Org Admin and a token with admin:org. Asks you to confirm before acting.',
  input: z.strictObject({ tag: tagName, org: arg.org }),
  kind: 'destructive',
  endpoints: ['GET /v1/tags/manage', 'DELETE /v1/tags/{tag}'],
  async describeAction(ctx, args) {
    const tag = await managed(ctx, args.tag, args.org);
    return t('mcp.action.tag_delete', { tag: tag.name, issues: tag.issue_count, articles: tag.article_count });
  },
  async run(ctx, args) {
    const { data } = await ctx.api.send<Tag>('DELETE', path`/v1/tags/${args.tag}`, scope(args.org));
    return {
      markdown: `Deleted the tag **${data.name}**; it came off ${data.issue_count} issues and ${data.article_count} articles.`,
    };
  },
});
