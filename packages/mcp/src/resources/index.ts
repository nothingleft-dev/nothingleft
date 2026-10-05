import type { Organization, Project, SavedView } from '@nothingleft/types';
import { defineResource, type ResourceEntry } from '../surface.ts';
import type { ToolContext } from '../tool.ts';
import { issueKey } from '../resolve.ts';
import { join } from '../render.ts';
import { renderIssue } from '../tools/issues.ts';
import { projectOverview, schemaMap } from '../tools/configuration.ts';
import { viewResults } from '../tools/views.ts';
import { renderBoard, renderSprint } from '../tools/agile.ts';
import { articleSlug, renderArticle } from '../tools/articles.ts';

const VIEW_ROWS = 50;

/** With several organisations every URI names its own, so a key two of them share stays unambiguous. */
async function perOrganization(
  ctx: ToolContext,
  entries: (org: Organization) => Promise<{ id: string; name: string; description?: string }[]>,
  scheme: string,
): Promise<ResourceEntry[]> {
  const orgs = await ctx.organizations();
  const lists = await Promise.all(orgs.map(entries));
  return orgs.flatMap((o, i) =>
    lists[i]!.map(e => ({
      uri: `${scheme}://${encodeURIComponent(e.id)}${orgs.length > 1 ? `?org=${o.slug}` : ''}`,
      name: orgs.length > 1 ? `${e.name} · ${o.name}` : e.name,
      ...(e.description ? { description: e.description } : {}),
    })),
  );
}

export const issueResource = defineResource({
  name: 'issue',
  title: 'Issue',
  description:
    'An issue as markdown: every field, links, the articles that reference it, the whole description and the latest comments. issue://PP-12, or issue://PP-12?org=acme when two of your organisations have PP.',
  template: 'issue://{key}',
  endpoints: [
    'GET /v1/issues/{key}',
    'GET /v1/issues/{key}/links',
    'GET /v1/issues/{key}/articles',
    'GET /v1/issues/{key}/comments',
  ],
  read: (ctx, v) =>
    renderIssue(ctx, issueKey(v['key']!), { comments: 5, include: [], org: v['org'], descriptionLength: Infinity }),
});

export const projectResource = defineResource({
  name: 'project',
  title: 'Project',
  description:
    "A project's overview, figures, active sprint and its value lists: statuses, priorities, types, work types, custom fields, sprints, boards, people and tags. project://PP",
  template: 'project://{key}',
  endpoints: [
    'GET /v1/projects',
    'GET /v1/projects/{key}',
    'GET /v1/issues/figures',
    'GET /v1/projects/{key}/statuses',
    'GET /v1/projects/{key}/priorities',
    'GET /v1/projects/{key}/types',
    'GET /v1/projects/{key}/work-types',
    'GET /v1/projects/{key}/assignees',
    'GET /v1/projects/{key}/work-authors',
    'GET /v1/tags',
    'GET /v1/projects/{key}/sprints',
    'GET /v1/projects/{key}/boards',
  ],
  list: ctx =>
    perOrganization(
      ctx,
      async o =>
        (
          await ctx.api.get<Project[]>('/v1/projects', { org: o.slug, query: { archived: false, limit: 100 } })
        ).data.map(p => ({
          id: p.key,
          name: `${p.key} — ${p.name}`,
        })),
      'project',
    ),
  async read(ctx, v) {
    const key = v['key']!.toUpperCase();
    const [overview, schema] = await Promise.all([projectOverview(ctx, key, v['org']), schemaMap(ctx, key, v['org'])]);
    return join(overview, '---', schema);
  },
});

export const viewResource = defineResource({
  name: 'view',
  title: 'Saved view',
  description: `A saved view's query and its first ${VIEW_ROWS} results. view://My%20open%20bugs`,
  template: 'view://{name}',
  endpoints: ['GET /v1/saved-views', 'GET /v1/saved-views/{name}', 'GET /v1/issues'],
  list: ctx =>
    perOrganization(
      ctx,
      async o =>
        (await ctx.api.get<SavedView[]>('/v1/saved-views', { org: o.slug })).data.map(s => ({
          id: s.name,
          name: s.name,
          description: s.query,
        })),
      'view',
    ),
  read: (ctx, v) => viewResults(ctx, v['name']!, v['org'], VIEW_ROWS, 0),
});

export const sprintResource = defineResource({
  name: 'sprint',
  title: 'Sprint',
  description:
    'A sprint: dates, days left, goal, progress in issues and points, the daily burndown and its issues in board order. sprint://PP/september-2026',
  template: 'sprint://{project}/{sprint}',
  endpoints: ['GET /v1/projects/{key}/sprints/{sprint}', 'GET /v1/projects/{key}/backlog'],
  read: (ctx, v) => renderSprint(ctx, v['project']!.toUpperCase(), v['sprint']!, v['org']),
});

export const boardResource = defineResource({
  name: 'board',
  title: 'Board',
  description:
    'A board on its active sprint: columns with counts and WIP limits, then the cards by swimlane and column. board://PP/pp',
  template: 'board://{project}/{board}',
  endpoints: ['GET /v1/projects/{key}/boards/{board}/view'],
  read: (ctx, v) => renderBoard(ctx, { project: v['project']!, board: v['board']!, org: v['org'] }),
});

export const articleResource = defineResource({
  name: 'article',
  title: 'Knowledge base article',
  description:
    'A knowledge base article as markdown: status, path, tags, the whole body and the latest comments. article://PP/restoring-a-failed-sync (the slug list_articles shows).',
  template: 'article://{project}/{slug}',
  endpoints: [
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}',
    'GET /v1/projects/{key}/articles/{slug}/comments',
  ],
  async read(ctx, v) {
    const key = v['project']!.toUpperCase();
    const slug = await articleSlug(ctx, key, decodeURIComponent(v['slug']!), v['org']);
    return renderArticle(ctx, key, slug, { org: v['org'], length: Infinity, comments: 5 });
  },
});

export const RESOURCES = [
  issueResource,
  projectResource,
  viewResource,
  sprintResource,
  boardResource,
  articleResource,
] as const;
