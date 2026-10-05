import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateIssueLinksSchema,
  DeleteIssueLinkQuerySchema,
  IssueLinkGroupSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { IssueLinksService } from '@services/issue-links.service';

type Deps = { links: IssueLinksService };

const KeyParams = z.object({ key: z.string().min(1).max(40) });
const TargetParams = KeyParams.extend({ target: z.string().min(1).max(40) });
const GroupsResponse = successEnvelope(z.array(IssueLinkGroupSchema));

const issueLinksRoutes: FastifyPluginAsyncZod<Deps> = async (app, { links }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/issues/:key/links',
    { schema: { params: KeyParams, response: { 200: GroupsResponse } } },
    async (request, reply) => reply.okList(await links.list(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    '/v1/issues/:key/links',
    { schema: { params: KeyParams, body: CreateIssueLinksSchema, response: { 201: GroupsResponse } } },
    async (request, reply) =>
      reply.okList(await links.create(request.principal!, request.params.key, request.body, orgHints(request)), {
        status: 201,
      }),
  );

  app.delete(
    '/v1/issues/:key/links/:target',
    { schema: { params: TargetParams, querystring: DeleteIssueLinkQuerySchema, response: { 200: GroupsResponse } } },
    async (request, reply) =>
      reply.okList(
        await links.remove(
          request.principal!,
          request.params.key,
          request.params.target,
          request.query.link,
          orgHints(request),
        ),
      ),
  );
};

export default issueLinksRoutes;
