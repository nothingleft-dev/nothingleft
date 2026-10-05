import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ClearedRecentSearchesSchema,
  GlobalSearchQuerySchema,
  GlobalSearchResultSchema,
  QueryTextSchema,
  SuggestionSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { ArticlesService } from '@services/articles.service';
import type { SearchService } from '@services/search.service';

type Deps = { search: SearchService; articles: ArticlesService };

const SuggestQuery = z.object({
  q: QueryTextSchema.default(''),
  caret: z.coerce.number().int().min(0).optional(),
  // Which vocabulary completes the query: the issue language, or the knowledge base's.
  kind: z.enum(['issues', 'articles']).default('issues'),
});
const SuggestResponse = successEnvelope(z.array(SuggestionSchema));
const ClearedResponse = successEnvelope(ClearedRecentSearchesSchema);
const GlobalResponse = successEnvelope(GlobalSearchResultSchema);

const searchRoutes: FastifyPluginAsyncZod<Deps> = async (app, { search, articles }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/search',
    { schema: { querystring: GlobalSearchQuerySchema, response: { 200: GlobalResponse } } },
    async (request, reply) =>
      reply.ok(await articles.globalSearch(request.principal!, request.query, orgHints(request))),
  );

  app.get(
    '/v1/search/suggest',
    { schema: { querystring: SuggestQuery, response: { 200: SuggestResponse } } },
    async (request, reply) => {
      const { q, caret, kind } = request.query;
      const service = kind === 'articles' ? articles : search;
      return reply.okList(await service.suggest(request.principal!, q, caret ?? q.length, orgHints(request)));
    },
  );

  app.delete('/v1/search/recent', { schema: { response: { 200: ClearedResponse } } }, async (request, reply) =>
    reply.ok(await search.clearRecent(request.principal!, orgHints(request))),
  );
};

export default searchRoutes;
