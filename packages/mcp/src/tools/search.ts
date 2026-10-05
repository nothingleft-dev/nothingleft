import { z } from 'zod';
import type { Suggestion } from '@nothingleft/types';
import * as arg from '../args.ts';
import { defineTool } from '../tool.ts';
import { code, join, table } from '../render.ts';

export const suggestQuery = defineTool({
  name: 'suggest_query',
  title: 'Suggest query',
  description:
    'Autocomplete for the search query language, as the search bar offers it: the attributes, values, operators and saved views valid at the caret. `for: "articles"` completes the knowledge base\'s language (search_articles) instead. Use it to learn what exists rather than guessing.',
  input: z.strictObject({
    query: z.string().max(2000).describe('The query typed so far. Empty lists the attributes.'),
    caret: z.number().int().min(0).optional().describe('Character position to complete at. Default: the end.'),
    for: z.enum(['issues', 'articles']).optional().describe('Which language: issues (default) or articles.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/search/suggest'],
  async run(ctx, args) {
    const { data } = await ctx.api.get<Suggestion[]>('/v1/search/suggest', {
      ...(args.org ? { org: args.org } : {}),
      query: { q: args.query, caret: args.caret ?? args.query.length, kind: args.for ?? 'issues' },
    });
    return {
      markdown: join(
        `Completions for ${code(args.query || ' ')}`,
        data.length
          ? table(
              ['Kind', 'Suggestion', 'Replaces', 'About'],
              data.map(s => [
                s.kind.replace('_', ' '),
                code(s.insert),
                `${s.replace.start}–${s.replace.end}`,
                s.description ?? '',
              ]),
            )
          : 'Nothing to suggest here.',
      ),
    };
  },
});
