import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AutomationCatalogueSchema,
  AutomationRunSchema,
  AutomationRunsQuerySchema,
  AutomationSchema,
  AutomationTemplateSchema,
  AutomationTestResultSchema,
  CreateAutomationSchema,
  TestAutomationSchema,
  UpdateAutomationSchema,
  successEnvelope,
  type Pagination,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { AutomationsService } from '@services/automations.service';

type Deps = { automations: AutomationsService };

const ProjectParams = z.object({ key: z.string().min(1).max(20) });
const AutomationParams = ProjectParams.extend({ name: z.string().min(1).max(100) });
const RunsResponse = successEnvelope(z.array(AutomationRunSchema));

const page = (query: { limit: number; offset: number }, total: number, length: number): Pagination => ({
  total,
  limit: query.limit,
  offset: query.offset,
  next_cursor: null,
  has_more: query.offset + length < total,
});

const automationsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { automations }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/automations/catalogue',
    { schema: { response: { 200: successEnvelope(AutomationCatalogueSchema) } } },
    async (_request, reply) => reply.ok(automations.catalogue()),
  );

  app.get(
    '/v1/projects/:key/automations',
    { schema: { params: ProjectParams, response: { 200: successEnvelope(z.array(AutomationSchema)) } } },
    async (request, reply) =>
      reply.okList(await automations.list(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/automations',
    {
      schema: {
        params: ProjectParams,
        body: CreateAutomationSchema,
        response: { 201: successEnvelope(AutomationSchema) },
      },
    },
    async (request, reply) =>
      reply.ok(await automations.create(request.principal!, request.params.key, request.body, orgHints(request)), {
        status: 201,
      }),
  );

  app.get(
    '/v1/projects/:key/automations/templates',
    { schema: { params: ProjectParams, response: { 200: successEnvelope(z.array(AutomationTemplateSchema)) } } },
    async (request, reply) =>
      reply.okList(await automations.templates(request.principal!, request.params.key, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/automations/:name',
    { schema: { params: AutomationParams, response: { 200: successEnvelope(AutomationSchema) } } },
    async (request, reply) =>
      reply.ok(await automations.get(request.principal!, request.params.key, request.params.name, orgHints(request))),
  );

  app.patch(
    '/v1/projects/:key/automations/:name',
    {
      schema: {
        params: AutomationParams,
        body: UpdateAutomationSchema,
        response: { 200: successEnvelope(AutomationSchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await automations.update(
          request.principal!,
          request.params.key,
          request.params.name,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/projects/:key/automations/:name',
    { schema: { params: AutomationParams, response: { 200: successEnvelope(z.array(AutomationSchema)) } } },
    async (request, reply) =>
      reply.okList(
        await automations.remove(request.principal!, request.params.key, request.params.name, orgHints(request)),
      ),
  );

  app.post(
    '/v1/projects/:key/automations/:name/test',
    {
      schema: {
        params: AutomationParams,
        body: TestAutomationSchema,
        response: { 200: successEnvelope(AutomationTestResultSchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await automations.test(
          request.principal!,
          request.params.key,
          request.params.name,
          request.body.issue,
          orgHints(request),
        ),
      ),
  );

  app.get(
    '/v1/projects/:key/automations/:name/runs',
    { schema: { params: AutomationParams, querystring: AutomationRunsQuerySchema, response: { 200: RunsResponse } } },
    async (request, reply) => {
      const { data, total } = await automations.runs(
        request.principal!,
        request.params.key,
        { ...request.query, automation: request.params.name },
        orgHints(request),
      );
      return reply.ok(data, { pagination: page(request.query, total, data.length) });
    },
  );

  app.get(
    '/v1/projects/:key/automation-runs',
    { schema: { params: ProjectParams, querystring: AutomationRunsQuerySchema, response: { 200: RunsResponse } } },
    async (request, reply) => {
      const { data, total } = await automations.runs(
        request.principal!,
        request.params.key,
        request.query,
        orgHints(request),
      );
      return reply.ok(data, { pagination: page(request.query, total, data.length) });
    },
  );
};

export default automationsRoutes;
