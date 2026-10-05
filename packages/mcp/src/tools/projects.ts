import { z } from 'zod';
import type { Organization, Project } from '@nothingleft/types';
import * as arg from '../args.ts';
import type { Pagination } from '../api.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { resolveOrganization } from '../organizations.ts';
import { code, join, more, person, roleLabel, table } from '../render.ts';

const projectRows = (projects: Project[]) =>
  projects.map(p => [
    p.key,
    p.name + (p.is_archived ? ' · archived' : ''),
    p.lead ? person(p.lead) : '—',
    roleLabel(p.my_role),
  ]);

const PROJECT_HEADERS = ['Key', 'Name', 'Lead', 'Your role'];

async function page(
  ctx: ToolContext,
  org: string,
  args: { archived?: boolean | undefined; limit?: number | undefined; offset?: number | undefined },
) {
  const res = await ctx.api.get<Project[]>('/v1/projects', {
    org,
    query: { archived: args.archived, limit: args.limit ?? arg.DEFAULT_LIMIT, offset: args.offset ?? 0 },
  });
  return { projects: res.data, pagination: res.pagination };
}

function section(o: Organization, projects: Project[], pagination: Pagination | undefined, heading: boolean) {
  return join(
    heading ? `### ${o.name} (${code(o.slug)})` : null,
    projects.length ? table(PROJECT_HEADERS, projectRows(projects)) : 'No projects you can see.',
    more(pagination, projects.length),
  );
}

export const listProjects = defineTool({
  name: 'list_projects',
  title: 'List projects',
  description:
    'Projects you can see, with key, name, lead and your role. Without `org`, every organisation you belong to is listed, grouped by organisation.',
  input: z.strictObject({
    org: arg.org,
    archived: z.boolean().optional().describe('true for archived projects only, false for active only. Default: both.'),
    limit: arg.limit,
    offset: arg.offset,
  }),
  kind: 'read',
  endpoints: ['GET /v1/organizations', 'GET /v1/projects'],
  async run(ctx, args) {
    const targets = args.org ? [await resolveOrganization(ctx, args.org)] : await ctx.organizations();
    const pages = await Promise.all(targets.map(o => page(ctx, o.slug, args)));
    const grouped = targets.length > 1;
    return {
      markdown: targets.length
        ? join(...targets.map((o, i) => section(o, pages[i]!.projects, pages[i]!.pagination, grouped)))
        : 'You belong to no organisation yet.',
    };
  },
});
