import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddIssueWatcherSchema,
  BulkUpdateIssuesSchema,
  BulkUpdateResultSchema,
  IssueCsvColumnSchema,
  IssueFiguresSchema,
  IssueListItemSchema,
  IssueListQuerySchema,
  CreateIssueSchema,
  IssueActivitySchema,
  IssueSchema,
  ISSUE_ACTIVITY_KINDS,
  ISSUE_REF_PICKER_LIMIT,
  IssueRefSchema,
  IssueWatcherSchema,
  MemberRefSchema,
  ToggleTaskSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  UpdateIssueSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { IssuesService } from '@services/issues.service';
import type { SearchService } from '@services/search.service';

type Deps = { issues: IssuesService; search: SearchService };

const KeyParams = z.object({ key: z.string().min(1).max(40) });
const WatcherParams = KeyParams.extend({ username: z.string().min(1).max(41) });
const ListQuery = IssueListQuerySchema.extend({
  deleted: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .default(false),
  group_limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
const ExportQuery = IssueListQuerySchema.omit({ group_by: true }).extend({
  columns: z
    .string()
    .max(500)
    .transform(v => v.split(',').map(c => c.trim()))
    .pipe(z.array(IssueCsvColumnSchema))
    .optional(),
});
const FiguresQuery = z.object({
  q: IssueListQuerySchema.shape.q,
  project: IssueListQuerySchema.shape.project,
  per: z.enum(['project']).optional(),
});
const commaList = <T extends z.ZodType<unknown, string>>(item: T, max: number) =>
  z
    .string()
    .max(2000)
    .transform(v =>
      v
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).max(max));
const ActivityQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  kind: z
    .union([z.enum(ISSUE_ACTIVITY_KINDS), z.array(z.enum(ISSUE_ACTIVITY_KINDS))])
    .transform(v => (Array.isArray(v) ? v : [v]))
    .optional(),
});
const RefsQuery = z.object({
  keys: commaList(z.string().min(1).max(40), PAGINATION_MAX_LIMIT).optional(),
  q: z.string().trim().max(200).optional(),
  project: z.string().trim().min(1).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(ISSUE_REF_PICKER_LIMIT),
});
const IssueResponse = successEnvelope(IssueSchema);
const IssuesResponse = successEnvelope(z.array(IssueListItemSchema));
const FiguresResponse = successEnvelope(z.array(IssueFiguresSchema));
const BulkResponse = successEnvelope(z.array(BulkUpdateResultSchema));
const ActivityResponse = successEnvelope(z.array(IssueActivitySchema));
const WatcherResponse = successEnvelope(IssueWatcherSchema);
const WatchersResponse = successEnvelope(z.array(IssueWatcherSchema));
const VotersResponse = successEnvelope(z.array(MemberRefSchema));
const RefsResponse = successEnvelope(z.array(IssueRefSchema));

const issuesRoutes: FastifyPluginAsyncZod<Deps> = async (app, { issues, search }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/issues',
    { schema: { querystring: ListQuery, response: { 200: IssuesResponse } } },
    async (request, reply) => {
      const { data, pagination, groups } = await issues.list(request.principal!, request.query, orgHints(request));
      return reply.ok(data, { pagination, groups });
    },
  );

  app.get('/v1/issues/export.csv', { schema: { querystring: ExportQuery } }, async (request, reply) => {
    const { filename, rows } = await issues.exportCsv(request.principal!, request.query, orgHints(request));
    return reply.csv(filename, rows);
  });

  app.get(
    '/v1/issues/figures',
    { schema: { querystring: FiguresQuery, response: { 200: FiguresResponse } } },
    async (request, reply) => reply.okList(await search.figures(request.principal!, request.query, orgHints(request))),
  );

  app.post(
    '/v1/issues/bulk-update',
    { schema: { body: BulkUpdateIssuesSchema, response: { 200: BulkResponse } } },
    async (request, reply) =>
      reply.okList(await issues.bulkUpdate(request.principal!, request.body, orgHints(request))),
  );

  app.get(
    '/v1/issues/refs',
    { schema: { querystring: RefsQuery, response: { 200: RefsResponse } } },
    async (request, reply) => reply.okList(await issues.refs(request.principal!, request.query, orgHints(request))),
  );

  app.post(
    '/v1/issues',
    { schema: { body: CreateIssueSchema, response: { 201: IssueResponse } } },
    async (request, reply) =>
      reply.ok(await issues.create(request.principal!, request.body, orgHints(request)), { status: 201 }),
  );

  app.get(
    '/v1/issues/:key',
    { schema: { params: KeyParams, response: { 200: IssueResponse } } },
    async (request, reply) => reply.ok(await issues.get(request.principal!, request.params.key, orgHints(request))),
  );

  app.patch(
    '/v1/issues/:key',
    { schema: { params: KeyParams, body: UpdateIssueSchema, response: { 200: IssueResponse } } },
    async (request, reply) =>
      reply.ok(await issues.update(request.principal!, request.params.key, request.body, orgHints(request))),
  );

  app.delete(
    '/v1/issues/:key',
    { schema: { params: KeyParams, response: { 200: IssueResponse } } },
    async (request, reply) => reply.ok(await issues.remove(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    '/v1/issues/:key/tasks/toggle',
    { schema: { params: KeyParams, body: ToggleTaskSchema, response: { 200: IssueResponse } } },
    async (request, reply) =>
      reply.ok(
        await issues.toggleDescriptionTask(request.principal!, request.params.key, request.body, orgHints(request)),
      ),
  );

  app.post(
    '/v1/issues/:key/restore',
    { schema: { params: KeyParams, response: { 200: IssueResponse } } },
    async (request, reply) => reply.ok(await issues.restore(request.principal!, request.params.key, orgHints(request))),
  );

  for (const [path, on, off] of [
    ['star', issues.star, issues.unstar],
    ['vote', issues.vote, issues.unvote],
    ['watch', issues.watch, issues.unwatch],
  ] as const) {
    app.put(
      `/v1/issues/:key/${path}`,
      { schema: { params: KeyParams, response: { 200: IssueResponse } } },
      async (request, reply) => reply.ok(await on(request.principal!, request.params.key, orgHints(request))),
    );
    app.delete(
      `/v1/issues/:key/${path}`,
      { schema: { params: KeyParams, response: { 200: IssueResponse } } },
      async (request, reply) => reply.ok(await off(request.principal!, request.params.key, orgHints(request))),
    );
  }

  app.get(
    '/v1/issues/:key/watchers',
    { schema: { params: KeyParams, response: { 200: WatchersResponse } } },
    async (request, reply) =>
      reply.okList(await issues.listWatchers(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    '/v1/issues/:key/watchers',
    { schema: { params: KeyParams, body: AddIssueWatcherSchema, response: { 201: WatcherResponse } } },
    async (request, reply) =>
      reply.ok(
        await issues.addWatcher(request.principal!, request.params.key, request.body.username, orgHints(request)),
        { status: 201 },
      ),
  );

  app.delete(
    '/v1/issues/:key/watchers/:username',
    { schema: { params: WatcherParams, response: { 200: WatcherResponse } } },
    async (request, reply) =>
      reply.ok(
        await issues.removeWatcher(request.principal!, request.params.key, request.params.username, orgHints(request)),
      ),
  );

  app.get(
    '/v1/issues/:key/voters',
    { schema: { params: KeyParams, response: { 200: VotersResponse } } },
    async (request, reply) =>
      reply.okList(await issues.listVoters(request.principal!, request.params.key, orgHints(request))),
  );

  app.get(
    '/v1/issues/:key/activity',
    { schema: { params: KeyParams, querystring: ActivityQuery, response: { 200: ActivityResponse } } },
    async (request, reply) => {
      const { kind, ...page } = request.query;
      const { data, pagination } = await issues.activity(
        request.principal!,
        request.params.key,
        { ...page, kinds: kind },
        orgHints(request),
      );
      return reply.ok(data, { pagination });
    },
  );
};

export default issuesRoutes;
