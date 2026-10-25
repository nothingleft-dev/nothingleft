import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ClaimGitIdentitySchema,
  ConfirmGitIdentitySchema,
  GitIdentitySchema,
  MemberGitIdentitySchema,
  successEnvelope,
} from '@nothingleft/types';
import { requireAuth } from '@middleware/auth';
import type { GitIdentitiesService } from '@services/git-identities.service';

type Deps = { identities: GitIdentitiesService };

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const OrgParams = z.object({ slug: z.string().min(1).max(100) });
const Mine = successEnvelope(z.array(GitIdentitySchema));
const Members = successEnvelope(z.array(MemberGitIdentitySchema));

const gitIdentitiesRoutes: FastifyPluginAsyncZod<Deps> = async (app, { identities }) => {
  app.get(
    '/v1/me/git-identities',
    { preHandler: requireAuth, schema: { response: { 200: Mine } } },
    async (request, reply) => reply.okList(await identities.list(request.principal!)),
  );

  app.post(
    '/v1/me/git-identities',
    { preHandler: requireAuth, schema: { body: ClaimGitIdentitySchema, response: { 201: Mine } } },
    async (request, reply) => reply.okList(await identities.claim(request.principal!, request.body), { status: 201 }),
  );

  app.delete(
    '/v1/me/git-identities/:id',
    { preHandler: requireAuth, schema: { params: IdParams, response: { 200: Mine } } },
    async (request, reply) => reply.okList(await identities.remove(request.principal!, request.params.id)),
  );

  // The emailed link: the token is the proof, so no session is needed.
  app.post(
    '/v1/git/identities/confirm',
    { schema: { body: ConfirmGitIdentitySchema, response: { 200: successEnvelope(GitIdentitySchema) } } },
    async (request, reply) => reply.ok(await identities.confirm(request.body.token)),
  );

  app.get(
    '/v1/organizations/:slug/git/identities',
    { preHandler: requireAuth, schema: { params: OrgParams, response: { 200: Members } } },
    async (request, reply) => reply.okList(await identities.listForOrg(request.principal!, request.params.slug)),
  );

  app.delete(
    '/v1/organizations/:slug/git/identities/:id',
    { preHandler: requireAuth, schema: { params: OrgParams.extend(IdParams.shape), response: { 200: Members } } },
    async (request, reply) =>
      reply.okList(await identities.removeForMember(request.principal!, request.params.slug, request.params.id)),
  );
};

export default gitIdentitiesRoutes;
