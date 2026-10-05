import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddProjectMemberSchema,
  CreateProjectSchema,
  MemberRefSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  ProjectMemberSchema,
  ProjectSchema,
  UpdateProjectMemberSchema,
  UpdateProjectSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { ProjectsService } from '@services/projects.service';

type Deps = { projects: ProjectsService };

const KeyParams = z.object({ key: z.string().min(1).max(20) });
const MemberParams = KeyParams.extend({ username: z.string().min(1).max(40) });
const ListQuery = z.object({
  archived: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
const ProjectResponse = successEnvelope(ProjectSchema);
const ProjectsResponse = successEnvelope(z.array(ProjectSchema));
const ProjectMemberResponse = successEnvelope(ProjectMemberSchema);
const ProjectMembersResponse = successEnvelope(z.array(ProjectMemberSchema));
const AssigneesResponse = successEnvelope(z.array(MemberRefSchema));

const projectsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { projects }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/projects',
    { schema: { querystring: ListQuery, response: { 200: ProjectsResponse } } },
    async (request, reply) => {
      const { data, pagination } = await projects.list(request.principal!, request.query, orgHints(request));
      return reply.ok(data, { pagination });
    },
  );

  app.post(
    '/v1/projects',
    { schema: { body: CreateProjectSchema, response: { 201: ProjectResponse } } },
    async (request, reply) =>
      reply.ok(await projects.create(request.principal!, request.body, request.ip, orgHints(request)), {
        status: 201,
      }),
  );

  app.get(
    '/v1/projects/:key',
    { schema: { params: KeyParams, response: { 200: ProjectResponse } } },
    async (request, reply) => reply.ok(await projects.get(request.principal!, request.params.key, orgHints(request))),
  );

  app.patch(
    '/v1/projects/:key',
    { schema: { params: KeyParams, body: UpdateProjectSchema, response: { 200: ProjectResponse } } },
    async (request, reply) =>
      reply.ok(
        await projects.update(request.principal!, request.params.key, request.body, request.ip, orgHints(request)),
      ),
  );

  for (const [action, archived] of [
    ['archive', true],
    ['unarchive', false],
  ] as const) {
    app.post(
      `/v1/projects/:key/${action}`,
      { schema: { params: KeyParams, response: { 200: ProjectResponse } } },
      async (request, reply) =>
        reply.ok(
          await projects.setArchived(request.principal!, request.params.key, archived, request.ip, orgHints(request)),
        ),
    );
  }

  app.get(
    '/v1/projects/:key/assignees',
    { schema: { params: KeyParams, response: { 200: AssigneesResponse } } },
    async (request, reply) =>
      reply.okList(await projects.listAssignable(request.principal!, request.params.key, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/work-authors',
    { schema: { params: KeyParams, response: { 200: AssigneesResponse } } },
    async (request, reply) =>
      reply.okList(await projects.listWorkAuthors(request.principal!, request.params.key, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/members',
    { schema: { params: KeyParams, response: { 200: ProjectMembersResponse } } },
    async (request, reply) =>
      reply.okList(await projects.listMembers(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/members',
    { schema: { params: KeyParams, body: AddProjectMemberSchema, response: { 201: ProjectMemberResponse } } },
    async (request, reply) =>
      reply.ok(
        await projects.addMember(request.principal!, request.params.key, request.body, request.ip, orgHints(request)),
        { status: 201 },
      ),
  );

  app.patch(
    '/v1/projects/:key/members/:username',
    { schema: { params: MemberParams, body: UpdateProjectMemberSchema, response: { 200: ProjectMemberResponse } } },
    async (request, reply) =>
      reply.ok(
        await projects.updateMember(
          request.principal!,
          request.params.key,
          request.params.username,
          request.body.role,
          request.ip,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/projects/:key/members/:username',
    { schema: { params: MemberParams, response: { 200: ProjectMemberResponse } } },
    async (request, reply) =>
      reply.ok(
        await projects.removeMember(
          request.principal!,
          request.params.key,
          request.params.username,
          request.ip,
          orgHints(request),
        ),
      ),
  );
};

export default projectsRoutes;
