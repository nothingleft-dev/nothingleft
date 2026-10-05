import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MemberSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  RemovalPreviewSchema,
  RemoveMemberSchema,
  UpdateMemberSchema,
  successEnvelope,
} from '@nothingleft/types';
import { requireAuth } from '@middleware/auth';
import type { MembersService } from '@services/members.service';

type Deps = { members: MembersService };

const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const MemberParams = SlugParams.extend({ username: z.string().min(1).max(40) });
const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
const MemberResponse = successEnvelope(MemberSchema);
const MembersResponse = successEnvelope(z.array(MemberSchema));
const RemovalPreviewResponse = successEnvelope(RemovalPreviewSchema);

const membersRoutes: FastifyPluginAsyncZod<Deps> = async (app, { members }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/organizations/:slug/members',
    { schema: { params: SlugParams, querystring: ListQuery, response: { 200: MembersResponse } } },
    async (request, reply) => {
      const { data, pagination } = await members.list(request.principal!, request.params.slug, request.query);
      return reply.ok(data, { pagination });
    },
  );

  app.get(
    '/v1/organizations/:slug/members/:username',
    { schema: { params: MemberParams, response: { 200: MemberResponse } } },
    async (request, reply) =>
      reply.ok(await members.get(request.principal!, request.params.slug, request.params.username)),
  );

  app.patch(
    '/v1/organizations/:slug/members/:username',
    { schema: { params: MemberParams, body: UpdateMemberSchema, response: { 200: MemberResponse } } },
    async (request, reply) =>
      reply.ok(
        await members.update(
          request.principal!,
          request.params.slug,
          request.params.username,
          request.body,
          request.ip,
        ),
      ),
  );

  app.get(
    '/v1/organizations/:slug/members/:username/removal',
    { schema: { params: MemberParams, response: { 200: RemovalPreviewResponse } } },
    async (request, reply) =>
      reply.ok(await members.removalPreview(request.principal!, request.params.slug, request.params.username)),
  );

  app.delete(
    '/v1/organizations/:slug/members/:username',
    { schema: { params: MemberParams, querystring: RemoveMemberSchema, response: { 200: MemberResponse } } },
    async (request, reply) =>
      reply.ok(
        await members.remove(
          request.principal!,
          request.params.slug,
          request.params.username,
          request.query,
          request.ip,
        ),
      ),
  );
};

export default membersRoutes;
