import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AcceptedInvitationSchema,
  AcknowledgementSchema,
  CreateEmailInvitationsSchema,
  CreateInvitationLinkSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  InvitationTokenSchema,
  InvitationUseSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { InvitationsService } from '@services/invitations.service';

type Deps = { invitations: InvitationsService };

const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const KeyParams = z.object({ key: z.string().min(1).max(20) });
const IdParams = SlugParams.extend({ id: z.coerce.number().int().positive() });
const InvitationResponse = successEnvelope(InvitationSchema);
const InvitationsResponse = successEnvelope(z.array(InvitationSchema));
const UsesResponse = successEnvelope(z.array(InvitationUseSchema));
const PreviewResponse = successEnvelope(InvitationPreviewSchema);
const AcceptedResponse = successEnvelope(AcceptedInvitationSchema);
const AckResponse = successEnvelope(AcknowledgementSchema);

// The token travels in a body, never a path, so it stays out of access logs.
const invitationsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { invitations }) => {
  app.post(
    '/v1/invitations/preview',
    { schema: { body: InvitationTokenSchema, response: { 200: PreviewResponse } } },
    async (request, reply) => reply.ok(await invitations.preview(request.principal, request.body.token)),
  );

  app.post(
    '/v1/invitations/accept',
    { preHandler: requireAuth, schema: { body: InvitationTokenSchema, response: { 200: AcceptedResponse } } },
    async (request, reply) => reply.ok(await invitations.accept(request.principal!, request.body.token, request.ip)),
  );

  app.post(
    '/v1/invitations/decline',
    { preHandler: requireAuth, schema: { body: InvitationTokenSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await invitations.decline(request.principal!, request.body.token, request.ip)),
  );

  app.register(async instance => {
    const scoped = instance.withTypeProvider<ZodTypeProvider>();
    scoped.addHook('preHandler', requireAuth);

    scoped.get(
      '/v1/organizations/:slug/invitations',
      { schema: { params: SlugParams, response: { 200: InvitationsResponse } } },
      async (request, reply) => reply.okList(await invitations.list(request.principal!, { slug: request.params.slug })),
    );

    scoped.post(
      '/v1/organizations/:slug/invitations/emails',
      { schema: { params: SlugParams, body: CreateEmailInvitationsSchema, response: { 201: InvitationsResponse } } },
      async (request, reply) =>
        reply.okList(
          await invitations.createEmails(request.principal!, { slug: request.params.slug }, request.body, request.ip),
          { status: 201 },
        ),
    );

    scoped.post(
      '/v1/organizations/:slug/invitations/links',
      { schema: { params: SlugParams, body: CreateInvitationLinkSchema, response: { 201: InvitationResponse } } },
      async (request, reply) =>
        reply.ok(
          await invitations.createLink(request.principal!, { slug: request.params.slug }, request.body, request.ip),
          { status: 201 },
        ),
    );

    scoped.get(
      '/v1/organizations/:slug/invitations/:id',
      { schema: { params: IdParams, response: { 200: InvitationResponse } } },
      async (request, reply) =>
        reply.ok(await invitations.get(request.principal!, request.params.slug, request.params.id)),
    );

    scoped.get(
      '/v1/organizations/:slug/invitations/:id/uses',
      { schema: { params: IdParams, response: { 200: UsesResponse } } },
      async (request, reply) =>
        reply.okList(await invitations.listUses(request.principal!, request.params.slug, request.params.id)),
    );

    scoped.post(
      '/v1/organizations/:slug/invitations/:id/rotate',
      { schema: { params: IdParams, response: { 200: InvitationResponse } } },
      async (request, reply) =>
        reply.ok(await invitations.rotate(request.principal!, request.params.slug, request.params.id, request.ip)),
    );

    scoped.delete(
      '/v1/organizations/:slug/invitations/:id',
      { schema: { params: IdParams, response: { 200: InvitationResponse } } },
      async (request, reply) =>
        reply.ok(await invitations.revoke(request.principal!, request.params.slug, request.params.id, request.ip)),
    );

    scoped.get(
      '/v1/projects/:key/invitations',
      { schema: { params: KeyParams, response: { 200: InvitationsResponse } } },
      async (request, reply) =>
        reply.okList(await invitations.list(request.principal!, { key: request.params.key, hints: orgHints(request) })),
    );

    scoped.post(
      '/v1/projects/:key/invitations/emails',
      { schema: { params: KeyParams, body: CreateEmailInvitationsSchema, response: { 201: InvitationsResponse } } },
      async (request, reply) =>
        reply.okList(
          await invitations.createEmails(
            request.principal!,
            { key: request.params.key, hints: orgHints(request) },
            request.body,
            request.ip,
          ),
          { status: 201 },
        ),
    );

    scoped.post(
      '/v1/projects/:key/invitations/links',
      { schema: { params: KeyParams, body: CreateInvitationLinkSchema, response: { 201: InvitationResponse } } },
      async (request, reply) =>
        reply.ok(
          await invitations.createLink(
            request.principal!,
            { key: request.params.key, hints: orgHints(request) },
            request.body,
            request.ip,
          ),
          { status: 201 },
        ),
    );
  });
};

export default invitationsRoutes;
