import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateImportSchema,
  ImportDryRunSchema,
  ImportJobSchema,
  ImportPreviewSchema,
  ImportUploadSchema,
  RunImportSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { ImportsService } from '@services/imports.service';

type Deps = { imports: ImportsService };

const KeyParams = z.object({ key: z.string().min(1).max(40) });
const JobParams = KeyParams.extend({ id: z.coerce.number().int().positive() });
const JobResponse = successEnvelope(ImportJobSchema);

const importsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { imports }) => {
  app.addHook('preHandler', requireAuth);

  app.post(
    '/v1/projects/:key/imports',
    { schema: { params: KeyParams, body: CreateImportSchema, response: { 201: successEnvelope(ImportUploadSchema) } } },
    async (request, reply) =>
      reply.ok(await imports.create(request.principal!, request.params.key, request.body, orgHints(request)), {
        status: 201,
      }),
  );

  app.get(
    '/v1/projects/:key/imports',
    { schema: { params: KeyParams, response: { 200: successEnvelope(z.array(ImportJobSchema)) } } },
    async (request, reply) =>
      reply.okList(await imports.list(request.principal!, request.params.key, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/imports/:id',
    { schema: { params: JobParams, response: { 200: JobResponse } } },
    async (request, reply) =>
      reply.ok(await imports.get(request.principal!, request.params.key, request.params.id, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/imports/:id/complete',
    { schema: { params: JobParams, response: { 200: successEnvelope(ImportPreviewSchema) } } },
    async (request, reply) =>
      reply.ok(await imports.complete(request.principal!, request.params.key, request.params.id, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/imports/:id/dry-run',
    { schema: { params: JobParams, body: RunImportSchema, response: { 200: successEnvelope(ImportDryRunSchema) } } },
    async (request, reply) =>
      reply.ok(
        await imports.dryRun(
          request.principal!,
          request.params.key,
          request.params.id,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.post(
    '/v1/projects/:key/imports/:id/start',
    { schema: { params: JobParams, body: RunImportSchema, response: { 202: JobResponse } } },
    async (request, reply) =>
      reply.ok(
        await imports.start(request.principal!, request.params.key, request.params.id, request.body, orgHints(request)),
        { status: 202 },
      ),
  );
};

export default importsRoutes;
