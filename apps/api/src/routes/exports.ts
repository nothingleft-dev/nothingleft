import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ExportJobSchema, successEnvelope } from '@nothingleft/types';
import { ATTACHMENT_REDIRECT_MAX_AGE_SECONDS } from '@config/constants';
import { requireAuth } from '@middleware/auth';
import type { ExportsService } from '@services/exports.service';

type Deps = { exports: ExportsService };

const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const JobParams = SlugParams.extend({ id: z.coerce.number().int().positive() });
const JobResponse = successEnvelope(ExportJobSchema);

const exportsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { exports }) => {
  app.addHook('preHandler', requireAuth);

  app.post(
    '/v1/organizations/:slug/exports',
    { schema: { params: SlugParams, response: { 202: JobResponse } } },
    async (request, reply) =>
      reply.ok(await exports.request(request.principal!, request.params.slug, request.ip), { status: 202 }),
  );

  app.get(
    '/v1/organizations/:slug/exports',
    { schema: { params: SlugParams, response: { 200: successEnvelope(z.array(ExportJobSchema)) } } },
    async (request, reply) => reply.okList(await exports.list(request.principal!, request.params.slug)),
  );

  app.get(
    '/v1/organizations/:slug/exports/:id',
    { schema: { params: JobParams, response: { 200: JobResponse } } },
    async (request, reply) => reply.ok(await exports.get(request.principal!, request.params.slug, request.params.id)),
  );

  app.get('/v1/organizations/:slug/exports/:id/download', { schema: { params: JobParams } }, async (request, reply) => {
    const location = await exports.downloadUrl(request.principal!, request.params.slug, request.params.id);
    return reply
      .header('Cache-Control', `private, max-age=${ATTACHMENT_REDIRECT_MAX_AGE_SECONDS}`)
      .redirect(location, 302);
  });
};

export default exportsRoutes;
