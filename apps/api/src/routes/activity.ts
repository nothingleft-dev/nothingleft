import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ORG_ACTIVITY_KINDS,
  OrgActivitySchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  successEnvelope,
} from '@nothingleft/types';
import { requireAuth } from '@middleware/auth';
import type { ActivityService } from '@services/activity.service';

type Deps = { activity: ActivityService };

const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const kinds = z
  .union([z.enum(ORG_ACTIVITY_KINDS), z.array(z.enum(ORG_ACTIVITY_KINDS))])
  .transform(v => (Array.isArray(v) ? v : [v]));
const FilterQuery = z.object({
  actor: z.string().trim().min(1).max(40).optional(),
  kind: kinds.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
const ListQuery = FilterQuery.extend({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
});
const ActivityResponse = successEnvelope(z.array(OrgActivitySchema));

const activityRoutes: FastifyPluginAsyncZod<Deps> = async (app, { activity }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/organizations/:slug/activity',
    { schema: { params: SlugParams, querystring: ListQuery, response: { 200: ActivityResponse } } },
    async (request, reply) => {
      const { kind, ...rest } = request.query;
      const { data, pagination } = await activity.list(request.principal!, request.params.slug, {
        ...rest,
        kinds: kind,
      });
      return reply.ok(data, { pagination });
    },
  );

  app.get(
    '/v1/organizations/:slug/activity/export.csv',
    { schema: { params: SlugParams, querystring: FilterQuery } },
    async (request, reply) => {
      const { kind, ...rest } = request.query;
      const { filename, csv } = await activity.exportCsv(
        request.principal!,
        request.params.slug,
        { ...rest, kinds: kind },
        request.ip,
      );
      return reply.csv(filename, csv);
    },
  );
};

export default activityRoutes;
