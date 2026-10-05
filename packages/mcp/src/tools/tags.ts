import { z } from 'zod';
import type { Tag } from '@nothingleft/types';
import * as arg from '../args.ts';
import { defineTool } from '../tool.ts';
import { join, more, table } from '../render.ts';

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
