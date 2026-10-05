import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateCustomFieldOptionSchema,
  CreateCustomFieldSchema,
  CustomFieldSchema,
  UpdateCustomFieldOptionSchema,
  UpdateCustomFieldSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { CustomFieldsService } from '@services/custom-fields.service';

type Deps = { customFields: CustomFieldsService };

const KeyParams = z.object({ key: z.string().min(1).max(20) });
const FieldParams = KeyParams.extend({ slug: z.string().min(1).max(100) });
const OptionParams = FieldParams.extend({ name: z.string().min(1).max(100) });
const ListQuery = z.object({
  archived: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
});
const DeleteOptionQuery = z.object({ move_to: z.string().trim().min(1).max(100).optional() });

const one = successEnvelope(CustomFieldSchema);
const many = successEnvelope(z.array(CustomFieldSchema));

const customFieldsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { customFields }) => {
  app.addHook('preHandler', requireAuth);
  const base = '/v1/projects/:key/custom-fields';

  app.get(
    base,
    { schema: { params: KeyParams, querystring: ListQuery, response: { 200: many } } },
    async (request, reply) =>
      reply.okList(await customFields.list(request.principal!, request.params.key, request.query, orgHints(request))),
  );

  app.post(
    base,
    { schema: { params: KeyParams, body: CreateCustomFieldSchema, response: { 201: one } } },
    async (request, reply) =>
      reply.ok(
        await customFields.create(request.principal!, request.params.key, request.body, request.ip, orgHints(request)),
        { status: 201 },
      ),
  );

  app.get(`${base}/:slug`, { schema: { params: FieldParams, response: { 200: one } } }, async (request, reply) =>
    reply.ok(await customFields.get(request.principal!, request.params.key, request.params.slug, orgHints(request))),
  );

  app.patch(
    `${base}/:slug`,
    { schema: { params: FieldParams, body: UpdateCustomFieldSchema, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await customFields.update(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.body,
          request.ip,
          orgHints(request),
        ),
      ),
  );

  app.delete(`${base}/:slug`, { schema: { params: FieldParams, response: { 200: one } } }, async (request, reply) =>
    reply.ok(
      await customFields.remove(
        request.principal!,
        request.params.key,
        request.params.slug,
        request.ip,
        orgHints(request),
      ),
    ),
  );

  app.post(
    `${base}/:slug/options`,
    { schema: { params: FieldParams, body: CreateCustomFieldOptionSchema, response: { 201: one } } },
    async (request, reply) =>
      reply.ok(
        await customFields.createOption(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.body,
          request.ip,
          orgHints(request),
        ),
        { status: 201 },
      ),
  );

  app.patch(
    `${base}/:slug/options/:name`,
    { schema: { params: OptionParams, body: UpdateCustomFieldOptionSchema, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await customFields.updateOption(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.params.name,
          request.body,
          request.ip,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    `${base}/:slug/options/:name`,
    { schema: { params: OptionParams, querystring: DeleteOptionQuery, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await customFields.removeOption(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.params.name,
          request.query.move_to,
          request.ip,
          orgHints(request),
        ),
      ),
  );
};

export default customFieldsRoutes;
