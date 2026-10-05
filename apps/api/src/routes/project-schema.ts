import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z, type ZodTypeAny } from 'zod';
import {
  CreateIssueTypeSchema,
  CreatePrioritySchema,
  CreateWorkflowStatusSchema,
  CreateWorkTypeSchema,
  IssueTypeSchema,
  PrioritySchema,
  UpdateIssueTypeSchema,
  UpdatePrioritySchema,
  UpdateWorkflowStatusSchema,
  UpdateWorkTypeSchema,
  WorkflowStatusSchema,
  WorkTypeSchema,
  successEnvelope,
  type ProjectSchemaTable,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { ProjectSchemaService, SchemaValueInput } from '@services/project-schema.service';

type Deps = { schema: ProjectSchemaService };

const KeyParams = z.object({ key: z.string().min(1).max(20) });
const ValueParams = KeyParams.extend({ name: z.string().min(1).max(100) });
const DeleteQuery = z.object({ move_to: z.string().trim().min(1).max(100).optional() });

const TABLES: { path: string; table: ProjectSchemaTable; dto: ZodTypeAny; create: ZodTypeAny; update: ZodTypeAny }[] = [
  {
    path: 'statuses',
    table: 'statuses',
    dto: WorkflowStatusSchema,
    create: CreateWorkflowStatusSchema,
    update: UpdateWorkflowStatusSchema,
  },
  {
    path: 'priorities',
    table: 'priorities',
    dto: PrioritySchema,
    create: CreatePrioritySchema,
    update: UpdatePrioritySchema,
  },
  { path: 'types', table: 'types', dto: IssueTypeSchema, create: CreateIssueTypeSchema, update: UpdateIssueTypeSchema },
  {
    path: 'work-types',
    table: 'work_types',
    dto: WorkTypeSchema,
    create: CreateWorkTypeSchema,
    update: UpdateWorkTypeSchema,
  },
];

const projectSchemaRoutes: FastifyPluginAsyncZod<Deps> = async (app, { schema }) => {
  app.addHook('preHandler', requireAuth);

  for (const { path, table, dto, create, update } of TABLES) {
    const one = successEnvelope(dto);
    const many = successEnvelope(z.array(dto));
    const base = `/v1/projects/:key/${path}`;

    app.get(base, { schema: { params: KeyParams, response: { 200: many } } }, async (request, reply) =>
      reply.okList(await schema.list(request.principal!, request.params.key, table, orgHints(request))),
    );

    app.post(base, { schema: { params: KeyParams, body: create, response: { 201: one } } }, async (request, reply) =>
      reply.ok(
        await schema.create(
          request.principal!,
          request.params.key,
          table,
          request.body as SchemaValueInput & { name: string },
          request.ip,
          orgHints(request),
        ),
        { status: 201 },
      ),
    );

    app.patch(
      `${base}/:name`,
      { schema: { params: ValueParams, body: update, response: { 200: one } } },
      async (request, reply) =>
        reply.ok(
          await schema.update(
            request.principal!,
            request.params.key,
            table,
            request.params.name,
            request.body as SchemaValueInput,
            request.ip,
            orgHints(request),
          ),
        ),
    );

    app.delete(
      `${base}/:name`,
      { schema: { params: ValueParams, querystring: DeleteQuery, response: { 200: one } } },
      async (request, reply) =>
        reply.ok(
          await schema.remove(
            request.principal!,
            request.params.key,
            table,
            request.params.name,
            request.query.move_to,
            request.ip,
            orgHints(request),
          ),
        ),
    );
  }
};

export default projectSchemaRoutes;
