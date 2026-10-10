import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApplyTagsSchema,
  IssueSchema,
  ManageTagsQuerySchema,
  MergeTagsSchema,
  UpdateTagSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  TagListQuerySchema,
  TagSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { TagsService } from '@services/tags.service';

type Deps = { tags: TagsService };

const KeyParams = z.object({ key: z.string().min(1).max(40) });
const TagParams = KeyParams.extend({ tag: z.string().min(1).max(200) });
const NameParams = z.object({ tag: z.string().min(1).max(200) });
const ListQuery = TagListQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
const ManageQuery = ManageTagsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
const TagsResponse = successEnvelope(z.array(TagSchema));
const TagResponse = successEnvelope(TagSchema);
const IssueResponse = successEnvelope(IssueSchema);

const tagsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { tags }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/tags',
    { schema: { querystring: ListQuery, response: { 200: TagsResponse } } },
    async (request, reply) => {
      const { data, pagination } = await tags.list(request.principal!, request.query, orgHints(request));
      return reply.ok(data, { pagination });
    },
  );

  app.get(
    '/v1/tags/manage',
    { schema: { querystring: ManageQuery, response: { 200: TagsResponse } } },
    async (request, reply) => {
      const { data, pagination } = await tags.manage(request.principal!, request.query, orgHints(request));
      return reply.ok(data, { pagination });
    },
  );

  app.patch(
    '/v1/tags/:tag',
    { schema: { params: NameParams, body: UpdateTagSchema, response: { 200: TagResponse } } },
    async (request, reply) =>
      reply.ok(await tags.update(request.principal!, request.params.tag, request.body, orgHints(request))),
  );

  app.post(
    '/v1/tags/merge',
    { schema: { body: MergeTagsSchema, response: { 200: TagResponse } } },
    async (request, reply) => reply.ok(await tags.merge(request.principal!, request.body, orgHints(request))),
  );

  app.delete(
    '/v1/tags/:tag',
    { schema: { params: NameParams, response: { 200: TagResponse } } },
    async (request, reply) => reply.ok(await tags.remove(request.principal!, request.params.tag, orgHints(request))),
  );

  app.post(
    '/v1/issues/:key/tags',
    { schema: { params: KeyParams, body: ApplyTagsSchema, response: { 200: IssueResponse } } },
    async (request, reply) =>
      reply.ok(await tags.apply(request.principal!, request.params.key, request.body, orgHints(request))),
  );

  app.delete(
    '/v1/issues/:key/tags/:tag',
    { schema: { params: TagParams, response: { 200: IssueResponse } } },
    async (request, reply) =>
      reply.ok(await tags.untag(request.principal!, request.params.key, request.params.tag, orgHints(request))),
  );
};

export default tagsRoutes;
