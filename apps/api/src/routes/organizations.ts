import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AcknowledgementSchema,
  CreateOrganizationSchema,
  InitiateOwnershipTransferSchema,
  OrganizationSchema,
  OwnershipTransferSchema,
  PendingOwnershipTransferSchema,
  StepUpSchema,
  UpdateOrganizationSchema,
  successEnvelope,
} from '@nothingleft/types';
import { requireAuth } from '@middleware/auth';
import type { OrganizationLifecycleService } from '@services/organization-lifecycle.service';
import type { OrganizationsService } from '@services/organizations.service';

type Deps = { organizations: OrganizationsService; lifecycle: OrganizationLifecycleService };

const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const OrganizationResponse = successEnvelope(OrganizationSchema);
const OrganizationsResponse = successEnvelope(z.array(OrganizationSchema));
const TransferResponse = successEnvelope(OwnershipTransferSchema);
const PendingTransferResponse = successEnvelope(PendingOwnershipTransferSchema);
const AckResponse = successEnvelope(AcknowledgementSchema);

const organizationsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { organizations, lifecycle }) => {
  app.addHook('preHandler', requireAuth);

  app.get('/v1/organizations', { schema: { response: { 200: OrganizationsResponse } } }, async (request, reply) =>
    reply.okList(await organizations.list(request.principal!)),
  );

  app.post(
    '/v1/organizations',
    { schema: { body: CreateOrganizationSchema, response: { 201: OrganizationResponse } } },
    async (request, reply) =>
      reply.ok(await organizations.create(request.principal!, request.body, request.ip), { status: 201 }),
  );

  app.get(
    '/v1/organizations/:slug',
    { schema: { params: SlugParams, response: { 200: OrganizationResponse } } },
    async (request, reply) => reply.ok(await organizations.get(request.principal!, request.params.slug)),
  );

  app.patch(
    '/v1/organizations/:slug',
    { schema: { params: SlugParams, body: UpdateOrganizationSchema, response: { 200: OrganizationResponse } } },
    async (request, reply) =>
      reply.ok(await organizations.update(request.principal!, request.params.slug, request.body, request.ip)),
  );

  app.post(
    '/v1/organizations/:slug/deletion',
    { schema: { params: SlugParams, body: StepUpSchema, response: { 200: OrganizationResponse } } },
    async (request, reply) =>
      reply.ok(await lifecycle.scheduleDeletion(request.principal!, request.params.slug, request.body, request.ip)),
  );

  app.delete(
    '/v1/organizations/:slug/deletion',
    { schema: { params: SlugParams, response: { 200: OrganizationResponse } } },
    async (request, reply) =>
      reply.ok(await lifecycle.cancelDeletion(request.principal!, request.params.slug, request.ip)),
  );

  app.get(
    '/v1/organizations/:slug/ownership-transfer',
    { schema: { params: SlugParams, response: { 200: PendingTransferResponse } } },
    async (request, reply) => reply.ok(await lifecycle.getTransfer(request.principal!, request.params.slug)),
  );

  app.post(
    '/v1/organizations/:slug/ownership-transfer',
    { schema: { params: SlugParams, body: InitiateOwnershipTransferSchema, response: { 201: TransferResponse } } },
    async (request, reply) =>
      reply.ok(await lifecycle.initiateTransfer(request.principal!, request.params.slug, request.body), {
        status: 201,
      }),
  );

  app.delete(
    '/v1/organizations/:slug/ownership-transfer',
    { schema: { params: SlugParams, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await lifecycle.cancelTransfer(request.principal!, request.params.slug)),
  );
};

export default organizationsRoutes;
