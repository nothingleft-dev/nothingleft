import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import { SAVED_VIEW_VISIBILITIES, type Issue, type SavedView } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { code, facts, instant, join, more, person, table } from '../render.ts';
import { issueTable } from '../render-issue.ts';

const scope = (org: string | undefined) => (org ? { org } : {});
const view = z.string().trim().min(1).max(100).describe('The saved view\'s name, e.g. "My open bugs".');
const visibility = z
  .enum(SAVED_VIEW_VISIBILITIES)
  .describe('private: only you. project: everyone in `project`. org: every member.');

const sortText = (v: SavedView) => v.sort.map(s => `${s.attribute} ${s.direction}`).join(', ');
const where = (v: SavedView) => (v.visibility === 'project' ? `project ${v.project?.key}` : v.visibility);

function viewFacts(v: SavedView) {
  return facts([
    ['Query', code(v.query || ' ')],
    ['Sort', v.sort.length ? sortText(v) : null],
    ['Shared with', where(v)],
    ['Owner', person(v.owner)],
    ['You can edit', v.can_edit ? 'Yes' : 'No'],
    ['Updated', instant(v.updated_at)],
  ]);
}

export async function viewResults(
  ctx: ToolContext,
  name: string,
  org: string | undefined,
  limit: number,
  offset: number,
) {
  const { data: v } = await ctx.api.get<SavedView>(path`/v1/saved-views/${name}`, scope(org));
  const res = await ctx.api.get<Issue[]>('/v1/issues', {
    ...scope(org),
    query: { q: v.query, ...(v.sort.length ? { sort: sortText(v) } : {}), limit, offset },
  });
  const total = res.pagination?.total ?? res.data.length;
  return join(
    `**${v.name}** — ${total} ${total === 1 ? 'issue' : 'issues'}`,
    viewFacts(v),
    res.data.length ? issueTable(res.data) : null,
    more(res.pagination, res.data.length),
  );
}

export const listViews = defineTool({
  name: 'list_views',
  title: 'List saved views',
  description:
    "The saved views you can see — your private ones, your projects' and the organisation's — with their queries.",
  input: z.strictObject({ org: arg.org }),
  kind: 'read',
  endpoints: ['GET /v1/saved-views'],
  async run(ctx, args) {
    const { data } = await ctx.api.get<SavedView[]>('/v1/saved-views', scope(args.org));
    return {
      markdown: join(
        `**${data.length} saved views**`,
        data.length
          ? table(
              ['Name', 'Query', 'Shared with', 'Owner', 'Editable'],
              data.map(v => [v.name, code(v.query || ' '), where(v), person(v.owner), v.can_edit ? 'yes' : '']),
            )
          : 'None yet. create_view saves a query.',
      ),
    };
  },
});

export const getView = defineTool({
  name: 'get_view',
  title: 'Run a saved view',
  description: "A saved view's definition and its current results, as the app's tab shows them.",
  input: z.strictObject({ view, org: arg.org, limit: arg.limit, offset: arg.offset }),
  kind: 'read',
  endpoints: ['GET /v1/saved-views/{name}', 'GET /v1/issues'],
  async run(ctx, args) {
    return { markdown: await viewResults(ctx, args.view, args.org, args.limit ?? arg.DEFAULT_LIMIT, args.offset ?? 0) };
  },
});

export const createView = defineTool({
  name: 'create_view',
  title: 'Save a view',
  description:
    'Saves a query under a name, for you alone or shared with a project or the organisation. Any query can then use it as `#{Name}`.',
  input: z.strictObject({
    name: z.string().trim().min(1).max(100),
    query: z.string().max(2000),
    visibility: visibility.optional().describe('Default private.'),
    project: arg.project.optional().describe('Required for project visibility.'),
    sort: z.string().max(200).optional().describe('e.g. "priority, updated desc".'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/saved-views'],
  async run(ctx, args) {
    const { data: v } = await ctx.api.send<SavedView>('POST', '/v1/saved-views', {
      ...scope(args.org),
      body: {
        name: args.name,
        query: args.query,
        visibility: args.visibility ?? 'private',
        ...(args.project ? { project: args.project.toUpperCase() } : {}),
        ...(args.sort ? { sort: args.sort } : {}),
      },
    });
    return { markdown: join(`Saved view **${v.name}**.`, viewFacts(v)) };
  },
});

export const updateView = defineTool({
  name: 'update_view',
  title: 'Change a saved view',
  description:
    'Renames a saved view or changes its query, sort or who it is shared with. Only its owner, or an admin for shared views, may.',
  input: z.strictObject({
    view,
    name: z.string().trim().min(1).max(100).optional().describe('New name.'),
    query: z.string().max(2000).optional(),
    sort: z.string().max(200).nullable().optional().describe("null drops the view's own sort."),
    visibility: visibility.optional(),
    project: arg.project.nullable().optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/saved-views/{name}'],
  async run(ctx, args) {
    const body: Record<string, unknown> = {};
    for (const f of ['name', 'query', 'sort', 'visibility'] as const) if (args[f] !== undefined) body[f] = args[f];
    if (args.project !== undefined) body['project'] = args.project?.toUpperCase() ?? null;
    if (!Object.keys(body).length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_view' });
    const { data: v } = await ctx.api.send<SavedView>('PATCH', path`/v1/saved-views/${args.view}`, {
      ...scope(args.org),
      body,
    });
    return { markdown: join(`Updated saved view **${v.name}**.`, viewFacts(v)) };
  },
});

export const deleteView = defineTool({
  name: 'delete_view',
  title: 'Delete a saved view',
  description:
    'Deletes a saved view; a shared one disappears for everyone it was shared with. Asks you to confirm before acting.',
  input: z.strictObject({ view, org: arg.org }),
  kind: 'destructive',
  endpoints: ['GET /v1/saved-views/{name}', 'DELETE /v1/saved-views/{name}'],
  async describeAction(ctx, args) {
    const { data: v } = await ctx.api.get<SavedView>(path`/v1/saved-views/${args.view}`, scope(args.org));
    return t('mcp.action.view_delete', { name: v.name, visibility: where(v) });
  },
  async run(ctx, args) {
    const { data: v } = await ctx.api.send<SavedView>('DELETE', path`/v1/saved-views/${args.view}`, scope(args.org));
    return { markdown: `Deleted saved view **${v.name}** (${where(v)}).` };
  },
});
