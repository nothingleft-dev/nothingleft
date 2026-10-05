import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AttachmentPresignSchema,
  AttachmentSchema,
  PresignAttachmentSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { AttachmentsService } from '@services/attachments.service';

type Deps = { attachments: AttachmentsService };

const IdParams = z.object({ id: z.uuid() });
const KeyParams = z.object({ key: z.string().min(1).max(40) });
const ChildParams = KeyParams.extend({ id: z.coerce.number().int().positive() });
const AttachmentResponse = successEnvelope(AttachmentSchema);
const AttachmentsResponse = successEnvelope(z.array(AttachmentSchema));
const PresignResponse = successEnvelope(AttachmentPresignSchema);

const attachmentsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { attachments }) => {
  app.addHook('preHandler', requireAuth);

  app.post(
    '/v1/attachments/presign',
    { schema: { body: PresignAttachmentSchema, response: { 201: PresignResponse } } },
    async (request, reply) =>
      reply.ok(await attachments.presign(request.principal!, request.body, orgHints(request)), { status: 201 }),
  );

  app.post(
    '/v1/attachments/:id/complete',
    { schema: { params: IdParams, response: { 200: AttachmentResponse } } },
    async (request, reply) => reply.ok(await attachments.complete(request.principal!, request.params.id)),
  );

  app.get(
    '/v1/attachments/:id',
    { schema: { params: IdParams, response: { 200: AttachmentResponse } } },
    async (request, reply) => reply.ok(await attachments.get(request.principal!, request.params.id)),
  );

  app.delete(
    '/v1/attachments/:id',
    { schema: { params: IdParams, response: { 200: AttachmentResponse } } },
    async (request, reply) => reply.ok(await attachments.remove(request.principal!, request.params.id)),
  );

  app.get(
    '/v1/issues/:key/attachments',
    { schema: { params: KeyParams, response: { 200: AttachmentsResponse } } },
    async (request, reply) =>
      reply.okList(await attachments.listForIssue(request.principal!, request.params.key, {}, orgHints(request))),
  );

  app.get(
    '/v1/issues/:key/comments/:id/attachments',
    { schema: { params: ChildParams, response: { 200: AttachmentsResponse } } },
    async (request, reply) =>
      reply.okList(
        await attachments.listForIssue(
          request.principal!,
          request.params.key,
          { commentId: request.params.id },
          orgHints(request),
        ),
      ),
  );

  app.get(
    '/v1/issues/:key/work-items/:id/attachments',
    { schema: { params: ChildParams, response: { 200: AttachmentsResponse } } },
    async (request, reply) =>
      reply.okList(
        await attachments.listForIssue(
          request.principal!,
          request.params.key,
          { workItemId: request.params.id },
          orgHints(request),
        ),
      ),
  );
};

export default attachmentsRoutes;
