import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AverageAgeQuerySchema,
  AverageAgeReportSchema,
  BurndownQuerySchema,
  BurndownReportSchema,
  DistributionReportSchema,
  GanttQuerySchema,
  GanttReportSchema,
  IssuesPerAssigneeQuerySchema,
  IssuesPerFieldQuerySchema,
  IssuesPerProjectQuerySchema,
  MatrixQuerySchema,
  MatrixReportSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  TimeReportQuerySchema,
  TimeReportSchema,
  TimesheetQuerySchema,
  TimesheetReportSchema,
  TimesheetWorkItemSchema,
  TimesheetWorkItemsQuerySchema,
  successEnvelope,
  type ReportName,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { ReportInputs, ReportsService } from '@services/reports.service';

type Deps = { reports: ReportsService };

const REPORTS = [
  ['issues-per-assignee', IssuesPerAssigneeQuerySchema, DistributionReportSchema],
  ['issues-per-project', IssuesPerProjectQuerySchema, DistributionReportSchema],
  ['issues-per-field', IssuesPerFieldQuerySchema, DistributionReportSchema],
  ['matrix', MatrixQuerySchema, MatrixReportSchema],
  ['burndown', BurndownQuerySchema, BurndownReportSchema],
  ['average-age', AverageAgeQuerySchema, AverageAgeReportSchema],
  ['time', TimeReportQuerySchema, TimeReportSchema],
  ['gantt', GanttQuerySchema, GanttReportSchema],
  ['timesheet', TimesheetQuerySchema, TimesheetReportSchema],
] as const satisfies readonly (readonly [ReportName, z.ZodType, z.ZodType])[];

const WorkItemsQuery = TimesheetWorkItemsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
const WorkItemsResponse = successEnvelope(z.array(TimesheetWorkItemSchema));

const reportsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { reports }) => {
  app.addHook('preHandler', requireAuth);

  for (const [name, querystring, dto] of REPORTS) {
    app.get(
      `/v1/reports/${name}`,
      { schema: { querystring, response: { 200: successEnvelope(dto) } } },
      async (request, reply) =>
        reply.ok(
          await reports.report(request.principal!, name, request.query as ReportInputs[typeof name], orgHints(request)),
        ),
    );

    app.get(`/v1/reports/${name}/export.csv`, { schema: { querystring } }, async (request, reply) => {
      const { filename, rows } = await reports.exportCsv(
        request.principal!,
        name,
        request.query as ReportInputs[typeof name],
        orgHints(request),
      );
      return reply.csv(filename, rows);
    });
  }

  app.get(
    '/v1/reports/timesheet/work-items',
    { schema: { querystring: WorkItemsQuery, response: { 200: WorkItemsResponse } } },
    async (request, reply) => {
      const { data, pagination } = await reports.timesheetWorkItems(
        request.principal!,
        request.query,
        orgHints(request),
      );
      return reply.ok(data, { pagination });
    },
  );
};

export default reportsRoutes;
