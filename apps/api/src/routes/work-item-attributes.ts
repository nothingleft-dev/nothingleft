import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateWorkItemAttributeSchema,
  CreateWorkItemAttributeValueSchema,
  UpdateWorkItemAttributeSchema,
  UpdateWorkItemAttributeValueSchema,
  WorkItemAttributeSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { WorkItemAttributesService } from '@services/work-item-attributes.service';

type Deps = { workItemAttributes: WorkItemAttributesService };

const KeyParams = z.object({ key: z.string().min(1).max(20) });
const AttributeParams = KeyParams.extend({ name: z.string().min(1).max(100) });
const ValueParams = AttributeParams.extend({ value: z.string().min(1).max(100) });
const DeleteValueQuery = z.object({ move_to: z.string().trim().min(1).max(100).optional() });

const one = successEnvelope(WorkItemAttributeSchema);
const many = successEnvelope(z.array(WorkItemAttributeSchema));

const workItemAttributesRoutes: FastifyPluginAsyncZod<Deps> = async (app, { workItemAttributes: service }) => {
  app.addHook('preHandler', requireAuth);
  const base = '/v1/projects/:key/work-item-attributes';

  app.get(base, { schema: { params: KeyParams, response: { 200: many } } }, async (request, reply) =>
    reply.okList(await service.list(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    base,
    { schema: { params: KeyParams, body: CreateWorkItemAttributeSchema, response: { 201: one } } },
    async (request, reply) =>
      reply.ok(
        await service.create(request.principal!, request.params.key, request.body, request.ip, orgHints(request)),
        {
          status: 201,
        },
      ),
  );

  app.patch(
    `${base}/:name`,
    { schema: { params: AttributeParams, body: UpdateWorkItemAttributeSchema, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await service.update(
          request.principal!,
          request.params.key,
          request.params.name,
          request.body,
          request.ip,
          orgHints(request),
        ),
      ),
  );

  app.delete(`${base}/:name`, { schema: { params: AttributeParams, response: { 200: one } } }, async (request, reply) =>
    reply.ok(
      await service.remove(request.principal!, request.params.key, request.params.name, request.ip, orgHints(request)),
    ),
  );

  app.post(
    `${base}/:name/values`,
    { schema: { params: AttributeParams, body: CreateWorkItemAttributeValueSchema, response: { 201: one } } },
    async (request, reply) =>
      reply.ok(
        await service.createValue(
          request.principal!,
          request.params.key,
          request.params.name,
          request.body,
          request.ip,
          orgHints(request),
        ),
        { status: 201 },
      ),
  );

  app.patch(
    `${base}/:name/values/:value`,
    { schema: { params: ValueParams, body: UpdateWorkItemAttributeValueSchema, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await service.updateValue(
          request.principal!,
          request.params.key,
          request.params.name,
          request.params.value,
          request.body,
          request.ip,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    `${base}/:name/values/:value`,
    { schema: { params: ValueParams, querystring: DeleteValueQuery, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await service.removeValue(
          request.principal!,
          request.params.key,
          request.params.name,
          request.params.value,
          request.query.move_to,
          request.ip,
          orgHints(request),
        ),
      ),
  );
};

export default workItemAttributesRoutes;
