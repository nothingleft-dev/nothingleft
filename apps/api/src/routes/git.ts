import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateGitConnectionSchema,
  GitConnectionCheckSchema,
  GitConnectionSchema,
  GitConnectionSecretSchema,
  GitEventsQuerySchema,
  GitProviderInfoSchema,
  GitRepositoriesQuerySchema,
  GitRepositorySchema,
  GitWebhookEventDetailSchema,
  GitWebhookEventSchema,
  GitPullRequestDetailSchema,
  IssueDevelopmentSchema,
  LinkPullRequestSchema,
  LinkRepositorySchema,
  ProjectRepositorySchema,
  ReplayGitEventSchema,
  RepositoryRefQuerySchema,
  UpdateRepositoryLinkSchema,
  successEnvelope,
  type Pagination,
} from '@nothingleft/types';
import { GIT_CONNECT_STATE_TTL_SECONDS } from '@config/constants';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { GitConnectionsService } from '@services/git-connections.service';
import type { GitDevelopmentService } from '@services/git-development.service';
import type { GitIngestService } from '@services/git-ingest.service';
import type { GitRepositoriesService } from '@services/git-repositories.service';

type Deps = {
  connections: GitConnectionsService;
  repositories: GitRepositoriesService;
  ingest: GitIngestService;
  development: GitDevelopmentService;
  cookie: { secure: boolean; domain?: string | undefined };
};

const CONNECT_STATE_COOKIE = 'git_connect_state';

const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const ProviderParams = z.object({ provider: z.string().min(1).max(30) });
const SlugProviderParams = SlugParams.extend(ProviderParams.shape);
const ConnectionParams = SlugParams.extend({ connection: z.string().min(1).max(300) });
// One segment: the full name percent-encoded (`acme%2Fweb`), since GitLab names nest.
const RepositoryRef = z.string().min(1).max(500);
const OrgRepositoryParams = SlugParams.extend({ repository: RepositoryRef });
const ProjectParams = z.object({ key: z.string().min(1).max(20) });
const ProjectRepositoryParams = ProjectParams.extend({ repository: RepositoryRef });
const EventParams = SlugParams.extend({ id: z.coerce.number().int().positive() });
const IssueParams = z.object({ key: z.string().min(1).max(40) });
const LinkParams = IssueParams.extend({ link_id: z.coerce.number().int().positive() });
const PullRequestParams = z.object({ repository: RepositoryRef, number: z.coerce.number().int().positive() });
const DevelopmentResponse = successEnvelope(IssueDevelopmentSchema);

const ConnectCallbackSchema = z.object({
  state: z.string().min(1).max(200),
  code: z.string().min(1).max(200),
  installation_id: z.string().regex(/^\d{1,20}$/),
  setup_action: z.string().max(30).optional(),
});

const page = (query: { limit: number; offset: number }, total: number, length: number): Pagination => ({
  total,
  limit: query.limit,
  offset: query.offset,
  next_cursor: null,
  has_more: query.offset + length < total,
});

const gitRoutes: FastifyPluginAsyncZod<Deps> = async (
  app,
  { connections, repositories, ingest, development, cookie },
) => {
  app.addHook('preHandler', requireAuth);

  const stateCookie = {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax' as const,
    path: '/v1/git/connect',
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };

  app.get(
    '/v1/git/providers',
    { schema: { response: { 200: successEnvelope(z.array(GitProviderInfoSchema)) } } },
    async (_request, reply) => reply.okList(connections.catalogue()),
  );

  app.post(
    '/v1/organizations/:slug/git/connect/:provider/start',
    {
      schema: {
        params: SlugProviderParams,
        response: { 200: successEnvelope(z.object({ install_url: z.string() })) },
      },
    },
    async (request, reply) => {
      const { install_url, state } = await connections.startInstall(
        request.principal!,
        request.params.slug,
        request.params.provider,
      );
      reply.setCookie(CONNECT_STATE_COOKIE, state, { ...stateCookie, maxAge: GIT_CONNECT_STATE_TTL_SECONDS });
      return reply.ok({ install_url });
    },
  );

  app.post(
    '/v1/git/connect/:provider/callback',
    {
      schema: {
        params: ProviderParams,
        body: ConnectCallbackSchema,
        response: { 200: successEnvelope(GitConnectionSchema) },
      },
    },
    async (request, reply) => {
      const bound = request.cookies[CONNECT_STATE_COOKIE];
      reply.clearCookie(CONNECT_STATE_COOKIE, stateCookie);
      return reply.ok(
        await connections.completeInstall(request.principal!, request.params.provider, request.body, bound),
      );
    },
  );

  app.get(
    '/v1/organizations/:slug/git/connections',
    { schema: { params: SlugParams, response: { 200: successEnvelope(z.array(GitConnectionSchema)) } } },
    async (request, reply) => reply.okList(await connections.list(request.principal!, request.params.slug)),
  );

  app.post(
    '/v1/organizations/:slug/git/connections',
    {
      schema: {
        params: SlugParams,
        body: CreateGitConnectionSchema,
        response: {
          200: successEnvelope(GitConnectionCheckSchema),
          201: successEnvelope(GitConnectionSecretSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await connections.create(request.principal!, request.params.slug, request.body);
      return reply.ok(result, { status: request.body.dry_run ? 200 : 201 });
    },
  );

  app.delete(
    '/v1/organizations/:slug/git/connections/:connection',
    { schema: { params: ConnectionParams, response: { 200: successEnvelope(GitConnectionSchema) } } },
    async (request, reply) =>
      reply.ok(await connections.remove(request.principal!, request.params.slug, request.params.connection)),
  );

  app.post(
    '/v1/organizations/:slug/git/connections/:connection/refresh',
    { schema: { params: ConnectionParams, response: { 200: successEnvelope(GitConnectionSchema) } } },
    async (request, reply) =>
      reply.ok(await connections.refresh(request.principal!, request.params.slug, request.params.connection)),
  );

  app.post(
    '/v1/organizations/:slug/git/connections/:connection/rotate-secret',
    { schema: { params: ConnectionParams, response: { 200: successEnvelope(GitConnectionSecretSchema) } } },
    async (request, reply) =>
      reply.ok(await connections.rotateSecret(request.principal!, request.params.slug, request.params.connection)),
  );

  app.get(
    '/v1/organizations/:slug/git/repositories',
    {
      schema: {
        params: SlugParams,
        querystring: GitRepositoriesQuerySchema,
        response: { 200: successEnvelope(z.array(GitRepositorySchema)) },
      },
    },
    async (request, reply) => {
      const { data, total } = await repositories.list(request.principal!, request.params.slug, request.query);
      return reply.ok(data, { pagination: page(request.query, total, data.length) });
    },
  );

  app.post(
    '/v1/organizations/:slug/git/repositories/:repository/resync',
    {
      schema: {
        params: OrgRepositoryParams,
        querystring: RepositoryRefQuerySchema,
        response: { 200: successEnvelope(GitRepositorySchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await repositories.resync(
          request.principal!,
          request.params.slug,
          request.params.repository,
          request.query.connection,
        ),
      ),
  );

  app.post(
    '/v1/organizations/:slug/git/repositories/:repository/rehook',
    {
      schema: {
        params: OrgRepositoryParams,
        querystring: RepositoryRefQuerySchema,
        response: { 200: successEnvelope(GitRepositorySchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await repositories.rehook(
          request.principal!,
          request.params.slug,
          request.params.repository,
          request.query.connection,
        ),
      ),
  );

  app.get(
    '/v1/projects/:key/repositories',
    { schema: { params: ProjectParams, response: { 200: successEnvelope(z.array(ProjectRepositorySchema)) } } },
    async (request, reply) =>
      reply.okList(await repositories.listForProject(request.principal!, request.params.key, orgHints(request))),
  );

  app.put(
    '/v1/projects/:key/repositories/:repository',
    {
      schema: {
        params: ProjectRepositoryParams,
        body: LinkRepositorySchema,
        response: { 201: successEnvelope(ProjectRepositorySchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await repositories.link(
          request.principal!,
          request.params.key,
          request.params.repository,
          request.body,
          orgHints(request),
        ),
        { status: 201 },
      ),
  );

  app.patch(
    '/v1/projects/:key/repositories/:repository',
    {
      schema: {
        params: ProjectRepositoryParams,
        body: UpdateRepositoryLinkSchema,
        response: { 200: successEnvelope(ProjectRepositorySchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await repositories.update(
          request.principal!,
          request.params.key,
          request.params.repository,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/projects/:key/repositories/:repository',
    {
      schema: {
        params: ProjectRepositoryParams,
        querystring: RepositoryRefQuerySchema,
        response: { 200: successEnvelope(z.array(ProjectRepositorySchema)) },
      },
    },
    async (request, reply) =>
      reply.okList(
        await repositories.unlink(
          request.principal!,
          request.params.key,
          request.params.repository,
          request.query.connection,
          orgHints(request),
        ),
      ),
  );

  app.get(
    '/v1/issues/:key/development',
    { schema: { params: IssueParams, response: { 200: DevelopmentResponse } } },
    async (request, reply) =>
      reply.ok(await development.development(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    '/v1/issues/:key/development/links',
    { schema: { params: IssueParams, body: LinkPullRequestSchema, response: { 200: DevelopmentResponse } } },
    async (request, reply) =>
      reply.ok(await development.link(request.principal!, request.params.key, request.body, orgHints(request))),
  );

  app.delete(
    '/v1/issues/:key/development/links/:link_id',
    { schema: { params: LinkParams, response: { 200: DevelopmentResponse } } },
    async (request, reply) =>
      reply.ok(
        await development.unlink(request.principal!, request.params.key, request.params.link_id, orgHints(request)),
      ),
  );

  app.get(
    '/v1/git/pull-requests/:repository/:number',
    { schema: { params: PullRequestParams, response: { 200: successEnvelope(GitPullRequestDetailSchema) } } },
    async (request, reply) =>
      reply.ok(
        await development.pullRequest(
          request.principal!,
          request.params.repository,
          request.params.number,
          orgHints(request),
        ),
      ),
  );

  app.get(
    '/v1/organizations/:slug/git/events',
    {
      schema: {
        params: SlugParams,
        querystring: GitEventsQuerySchema,
        response: { 200: successEnvelope(z.array(GitWebhookEventSchema)) },
      },
    },
    async (request, reply) => {
      const { data, total } = await ingest.list(request.principal!, request.params.slug, request.query);
      return reply.ok(data, { pagination: page(request.query, total, data.length) });
    },
  );

  app.get(
    '/v1/organizations/:slug/git/events/:id',
    { schema: { params: EventParams, response: { 200: successEnvelope(GitWebhookEventDetailSchema) } } },
    async (request, reply) => reply.ok(await ingest.get(request.principal!, request.params.slug, request.params.id)),
  );

  app.post(
    '/v1/organizations/:slug/git/events/:id/replay',
    {
      schema: {
        params: EventParams,
        body: ReplayGitEventSchema,
        response: { 202: successEnvelope(GitWebhookEventDetailSchema) },
      },
    },
    async (request, reply) =>
      reply.ok(await ingest.replay(request.principal!, request.params.slug, request.params.id, request.body), {
        status: 202,
      }),
  );
};

export default gitRoutes;
