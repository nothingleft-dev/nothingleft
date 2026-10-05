import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  AcknowledgementSchema,
  OneTimeTokenSchema,
  OrganizationSchema,
  OwnershipTransferSchema,
  successEnvelope,
} from '@nothingleft/types';
import { requireAuth } from '@middleware/auth';
import type { OrganizationLifecycleService } from '@services/organization-lifecycle.service';

type Deps = { lifecycle: OrganizationLifecycleService };

const TransferResponse = successEnvelope(OwnershipTransferSchema);
const OrganizationResponse = successEnvelope(OrganizationSchema);
const AckResponse = successEnvelope(AcknowledgementSchema);

// The token travels in the body, never the path, so it stays out of access logs.
const ownershipTransfersRoutes: FastifyPluginAsyncZod<Deps> = async (app, { lifecycle }) => {
  app.addHook('preHandler', requireAuth);

  app.post(
    '/v1/ownership-transfers/preview',
    { schema: { body: OneTimeTokenSchema, response: { 200: TransferResponse } } },
    async (request, reply) => reply.ok(await lifecycle.previewTransfer(request.principal!, request.body.token)),
  );

  app.post(
    '/v1/ownership-transfers/accept',
    { schema: { body: OneTimeTokenSchema, response: { 200: OrganizationResponse } } },
    async (request, reply) =>
      reply.ok(await lifecycle.acceptTransfer(request.principal!, request.body.token, request.ip)),
  );

  app.post(
    '/v1/ownership-transfers/decline',
    { schema: { body: OneTimeTokenSchema, response: { 200: AckResponse } } },
    async (request, reply) => reply.ok(await lifecycle.declineTransfer(request.principal!, request.body.token)),
  );
};

export default ownershipTransfersRoutes;
