import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import {
  BULK_UPDATE_MAX_ISSUES,
  ISSUE_ACTIVITY_KINDS,
  CUSTOM_GROUP_PREFIX,
  ISSUE_GROUP_FIELDS,
  ISSUE_LINK_NAME_VALUES,
  type ArticleSummary,
  type Attachment,
  type BulkUpdateResult,
  type Comment,
  type Issue,
  type IssueActivity,
  type IssueGroup,
  type IssueLinkGroup,
  type IssueWatcher,
  type MemberRef,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { customFieldsArg, customFieldsBody } from './custom-fields.ts';
import { referencedByLines } from './articles.ts';
import { calendarOf, issueKey, projectKeyOf, projectOrganization, usernameIn, usernamesIn } from '../resolve.ts';
import { code, handle, join, list, more, moreByCursor, person, table, untrusted } from '../render.ts';
import {
  DESCRIPTION_PAGE,
  activityLine,
  commentBlock,
  descriptionPage,
  issueFacts,
  issueHeading,
  issueTable,
  linkLines,
} from '../render-issue.ts';

type Scope = { org?: string };
const value = (what: string, example: string) =>
  z.string().trim().min(1).max(100).describe(`${what} by name, e.g. "${example}"; describe_project_schema lists them.`);
const status = () => value('Status', 'In Progress');
const priority = () => value('Priority', 'Major');
const type = () => value('Type', 'Bug');
const title = () => z.string().trim().min(1).max(500).describe('One line, what is wrong or wanted.');
const scope = (org: string | undefined): Scope => (org ? { org } : {});
const sprintArg = () => arg.sprint.describe('Sprint by name or slug, e.g. "September 2026"; "backlog" for none.');
const storyPoints = () => z.number().int().min(0).max(999).describe('Story points, a whole number 0–999.');
/** "backlog" is the agent's word for no sprint. */
const sprintValue = (v: string | null) => (v === null || v.trim().toLowerCase() === 'backlog' ? null : v);

async function calendarFor(ctx: ToolContext, key: string, org?: string) {
  return calendarOf(await projectOrganization(ctx, projectKeyOf(key), org));
}

async function fetchIssue(ctx: ToolContext, key: string, org?: string) {
  return (await ctx.api.get<Issue>(path`/v1/issues/${key}`, scope(org))).data;
}

/** The facts an agent needs after any write: heading, table, then whatever else the call reported. */
async function answer(
  ctx: ToolContext,
  issue: Issue,
  verb: string,
  org: string | undefined,
  ...notes: (string | null)[]
) {
  const calendar = await calendarFor(ctx, issue.key, org).catch(() => undefined);
  return { markdown: join(issueHeading(issue, ctx.appBaseUrl, verb), issueFacts(issue, calendar), ...notes) };
}

const groupSummary = (groups: IssueGroup[] | undefined) =>
  groups?.length ? `Groups: ${groups.map(g => `${g.label} ${g.count}`).join(' · ')}` : null;

export const searchIssues = defineTool({
  name: 'search_issues',
  title: 'Search issues',
  description:
    'Finds issues with the query language the search bar uses, e.g. `project: PP #Unresolved assignee: me priority: Critical, Major sort by: updated desc`. Attributes include project, status, priority, type, assignee, created by, updated by, tag, sprint (`sprint: {September 2026}`, `{No sprint}`), story points (`3 .. 8`), created, updated, resolved date, due date, estimation, spent time, has, links such as `subtask of: PP-12`, any custom field by its slug (`severity: High`, `launch: {This month}`) - whose values then show as extra columns - and free text. `#Unresolved`, `#me` are shortcuts. An unknown attribute or value is an error listing the valid ones; call suggest_query to explore. Returns a table.',
  input: z.strictObject({
    query: z
      .string()
      .max(2000)
      .describe('The query, e.g. `project: PP #Unresolved assignee: me`. Empty lists everything you can read.'),
    project: arg.project.optional().describe('Limit to one project key, e.g. "PP".'),
    sort: z.string().max(200).optional().describe('Overrides `sort by:` in the query, e.g. "priority, updated desc".'),
    group_by: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe(
        `Adds per-group counts over the whole result: ${ISSUE_GROUP_FIELDS.join(', ')}, or ${CUSTOM_GROUP_PREFIX}<slug> for a select, multi-select, user, multi-user or checkbox field.`,
      ),
    group_limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('With group_by: at most this many issues from each group, e.g. 5 for a preview of every group.'),
    deleted: z.boolean().optional().describe('true lists soft-deleted issues still restorable (Project Admins).'),
    org: arg.org,
    limit: arg.limit,
    offset: arg.offset,
  }),
  kind: 'read',
  endpoints: ['GET /v1/issues'],
  async run(ctx, args) {
    const res = await ctx.api.get<Issue[]>('/v1/issues', {
      ...scope(args.org),
      query: {
        q: args.query,
        project: args.project?.toUpperCase(),
        sort: args.sort,
        group_by: args.group_by?.toLowerCase(),
        group_limit: args.group_limit,
        deleted: args.deleted,
        limit: args.limit ?? arg.DEFAULT_LIMIT,
        offset: args.offset ?? 0,
      },
    });
    const total = res.pagination?.total ?? res.data.length;
    const named = `${args.query} ${args.sort ?? ''} ${args.group_by ?? ''}`.toLowerCase();
    const slugs = [...new Set(res.data.flatMap(i => i.custom_fields.map(f => f.slug)))].filter(slug =>
      new RegExp(`(^|[\\s,:{])${slug}(\\b|$)`).test(named),
    );
    return {
      markdown: join(
        `**${total} ${total === 1 ? 'issue' : 'issues'}**${args.query.trim() ? ` for ${code(args.query.trim())}` : ''}`,
        groupSummary(res.meta?.['groups'] as IssueGroup[] | undefined),
        res.data.length ? issueTable(res.data, slugs) : null,
        more(res.pagination, res.data.length),
      ),
    };
  },
});

const COMMENT_FETCH = 200;

export const getIssue = defineTool({
  name: 'get_issue',
  title: 'Get issue',
  description: `One issue by key: every field, tags, links and subtasks, the knowledge base articles that reference it, the latest comments and the description (cut at ${DESCRIPTION_PAGE / 1024} KB with a marker; get_issue_description reads on). \`include\` adds watchers, voters or files.`,
  input: z.strictObject({
    issue: arg.issue,
    comments: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('How many of the latest comments to show, 0–20. Default 5.'),
    include: z
      .array(z.enum(['watchers', 'voters', 'attachments']))
      .max(3)
      .optional()
      .describe('Extra sections.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: [
    'GET /v1/issues/{key}',
    'GET /v1/issues/{key}/links',
    'GET /v1/issues/{key}/articles',
    'GET /v1/issues/{key}/comments',
    'GET /v1/issues/{key}/watchers',
    'GET /v1/issues/{key}/voters',
    'GET /v1/issues/{key}/attachments',
  ],
  async run(ctx, args) {
    const markdown = await renderIssue(ctx, issueKey(args.issue), {
      comments: args.comments ?? 5,
      include: args.include ?? [],
      org: args.org,
      descriptionLength: DESCRIPTION_PAGE,
    });
    return { markdown };
  },
});

/** Shared with the `issue://` resource, which shows the whole description. */
export async function renderIssue(
  ctx: ToolContext,
  key: string,
  opts: { comments: number; include: readonly string[]; org?: string | undefined; descriptionLength: number },
): Promise<string> {
  const s = scope(opts.org);
  const issue = await fetchIssue(ctx, key, opts.org);
  const [links, articles, comments, watchers, voters, files, calendar] = await Promise.all([
    ctx.api.get<IssueLinkGroup[]>(path`/v1/issues/${key}/links`, s).then(r => r.data),
    ctx.api.get<ArticleSummary[]>(path`/v1/issues/${key}/articles`, s).then(r => r.data),
    opts.comments > 0 && issue.comment_count > 0
      ? ctx.api.get<Comment[]>(path`/v1/issues/${key}/comments`, { ...s, query: { limit: COMMENT_FETCH } })
      : null,
    opts.include.includes('watchers') ? ctx.api.get<IssueWatcher[]>(path`/v1/issues/${key}/watchers`, s) : null,
    opts.include.includes('voters') ? ctx.api.get<MemberRef[]>(path`/v1/issues/${key}/voters`, s) : null,
    opts.include.includes('attachments') ? ctx.api.get<Attachment[]>(path`/v1/issues/${key}/attachments`, s) : null,
    calendarFor(ctx, key, opts.org).catch(() => undefined),
  ]);

  const shownComments = comments ? comments.data.slice(-opts.comments) : [];
  const earlier = issue.comment_count - shownComments.length;
  return join(
    issueHeading(issue, ctx.appBaseUrl),
    issueFacts(issue, calendar),
    linkLines(links) ? `**Links**\n${linkLines(links)}` : null,
    referencedByLines(articles),
    watchers ? `**Watchers:** ${watchers.data.map(person).join(', ') || 'none'}` : null,
    voters ? `**Voters:** ${voters.data.map(person).join(', ') || 'none'}` : null,
    files
      ? files.data.length
        ? `**Files**\n${table(
            ['File', 'Size', 'By'],
            files.data.map(f => [f.filename, `${Math.ceil(f.size_bytes / 1024)} KB`, person(f.created_by)]),
          )}`
        : '**Files:** none'
      : null,
    '---',
    issue.description_md ? descriptionPage(issue, 0, opts.descriptionLength) : '_No description._',
    shownComments.length
      ? join(
          `---\n\n**Latest comments**${earlier > 0 ? ` (${earlier} earlier — list_comments)` : ''}`,
          ...shownComments.map(c => commentBlock(c, key)),
        )
      : null,
  );
}

export const getIssueDescription = defineTool({
  name: 'get_issue_description',
  title: 'Read a long description',
  description: 'Pages through an issue description too long for get_issue, from a character offset.',
  input: z.strictObject({
    issue: arg.issue,
    offset: z.number().int().min(0).describe('Character to start from, as the truncation marker says.'),
    length: z
      .number()
      .int()
      .min(1)
      .max(32_768)
      .optional()
      .describe(`Characters to return. Default ${DESCRIPTION_PAGE}.`),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/issues/{key}'],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    const issue = await fetchIssue(ctx, key, args.org);
    const text = issue.description_md ?? '';
    return {
      markdown: join(
        `**${key}** description, characters ${Math.min(args.offset + 1, text.length)}–${Math.min(
          args.offset + (args.length ?? DESCRIPTION_PAGE),
          text.length,
        )} of ${text.length}`,
        descriptionPage(issue, args.offset, args.length ?? DESCRIPTION_PAGE),
      ),
    };
  },
});

const linkSpec = z.strictObject({
  link: z.enum(ISSUE_LINK_NAME_VALUES).describe('How this issue relates, read from it: "depends on", "subtask of"…'),
  issues: z.array(arg.issue).min(1).max(50),
});

const nullable = <T extends z.ZodType>(schema: T, clears: string) =>
  schema
    .nullable()
    .optional()
    .describe(`${schema.description ?? ''} null ${clears}.`.trim());

export const createIssue = defineTool({
  name: 'create_issue',
  title: 'Create issue',
  description:
    'Creates an issue with everything in one call: title, markdown description, type, priority, status, assignees, tags (created on first use), estimate, story points, sprint, dates, parent, links and custom fields. Unset fields take the project defaults, and a custom field its default; describe_project_schema lists the valid values and which custom fields are required. Returns the new issue.',
  input: z.strictObject({
    project: arg.project,
    title: title(),
    description: arg.markdown('The description').optional(),
    type: type().optional(),
    priority: priority().optional(),
    status: status().optional(),
    assignees: arg.people('Assignees').optional(),
    tags: arg.tagList('Tags').optional(),
    estimate: arg.duration.optional(),
    story_points: storyPoints().optional(),
    sprint: sprintArg().optional(),
    start_date: arg.calendarDate.optional(),
    due_date: arg.calendarDate.optional(),
    parent: arg.issue.optional().describe('Parent issue key, e.g. "PP-3": the new issue becomes its subtask.'),
    links: z.array(linkSpec).max(7).optional().describe('e.g. [{ link: "depends on", issues: ["PP-4"] }].'),
    custom_fields: customFieldsArg.optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/issues', 'GET /v1/projects/{key}/custom-fields'],
  async run(ctx, args) {
    const project = args.project.toUpperCase();
    const assignees = args.assignees ? await usernamesIn(ctx, project, args.org, args.assignees) : undefined;
    const { data: issue } = await ctx.api.send<Issue>('POST', '/v1/issues', {
      ...scope(args.org),
      body: {
        project,
        title: args.title,
        ...(args.description !== undefined ? { description_md: args.description } : {}),
        ...(args.type ? { type: args.type } : {}),
        ...(args.priority ? { priority: args.priority } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...(assignees ? { assignees } : {}),
        ...(args.tags?.length ? { tags: args.tags } : {}),
        ...(args.estimate !== undefined ? { estimate: args.estimate } : {}),
        ...(args.story_points !== undefined ? { story_points: args.story_points } : {}),
        ...(args.sprint !== undefined ? { sprint: sprintValue(args.sprint) } : {}),
        ...(args.start_date ? { start_date: args.start_date } : {}),
        ...(args.due_date ? { due_date: args.due_date } : {}),
        ...(args.parent ? { parent: issueKey(args.parent) } : {}),
        ...(args.links?.length
          ? { links: args.links.map(l => ({ link: l.link, issues: l.issues.map(issueKey) })) }
          : {}),
        ...(args.custom_fields && Object.keys(args.custom_fields).length
          ? { custom_fields: await customFieldsBody(ctx, project, args.org, args.custom_fields) }
          : {}),
      },
    });
    return answer(ctx, issue, 'Created', args.org);
  },
});

export const updateIssue = defineTool({
  name: 'update_issue',
  title: 'Update issue',
  description:
    'Changes one issue: only the arguments you pass change, and null clears a field. Covers fields, custom fields, story points, sprint, parent, tags (add_tags / remove_tags, new names are created), watchers, and your own star, watch and vote - so a triage is one call. Returns the issue as it now is.',
  input: z.strictObject({
    issue: arg.issue,
    title: title().optional(),
    description: nullable(arg.markdown('The new description, replacing the old'), 'clears it'),
    status: status().optional(),
    priority: priority().optional(),
    type: type().optional(),
    assignees: arg.people('The whole new assignee list; [] unassigns everyone').optional(),
    estimate: nullable(arg.duration, 'clears it'),
    story_points: nullable(storyPoints(), 'clears them'),
    sprint: nullable(sprintArg(), 'moves it to the backlog'),
    start_date: nullable(arg.calendarDate, 'clears it'),
    due_date: nullable(arg.calendarDate, 'clears it'),
    parent: nullable(arg.issue.describe('Parent issue key'), 'makes it top-level'),
    add_tags: arg.tagList('Tags to add').optional(),
    remove_tags: arg.tagList('Tags to remove').optional(),
    add_watchers: arg.people('Members to add as watchers').optional(),
    remove_watchers: arg.people('Members to stop watching').optional(),
    watch: z.boolean().optional().describe('true to watch it yourself, false to stop.'),
    star: z.boolean().optional().describe('true to star it, false to unstar.'),
    vote: z.boolean().optional().describe('true to vote for it, false to take your vote back.'),
    custom_fields: customFieldsArg.optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: [
    'PATCH /v1/issues/{key}',
    'GET /v1/projects/{key}/custom-fields',
    'POST /v1/issues/{key}/tags',
    'DELETE /v1/issues/{key}/tags/{tag}',
    'POST /v1/issues/{key}/watchers',
    'DELETE /v1/issues/{key}/watchers/{username}',
    'PUT /v1/issues/{key}/watch',
    'DELETE /v1/issues/{key}/watch',
    'PUT /v1/issues/{key}/star',
    'DELETE /v1/issues/{key}/star',
    'PUT /v1/issues/{key}/vote',
    'DELETE /v1/issues/{key}/vote',
    'GET /v1/issues/{key}',
  ],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    const s = scope(args.org);
    const fields: Record<string, unknown> = {};
    if (args.title !== undefined) fields['title'] = args.title;
    if (args.description !== undefined) fields['description_md'] = args.description;
    for (const f of ['status', 'priority', 'type', 'estimate', 'story_points', 'start_date', 'due_date'] as const) {
      if (args[f] !== undefined) fields[f] = args[f];
    }
    if (args.sprint !== undefined) fields['sprint'] = sprintValue(args.sprint);
    if (args.parent !== undefined) fields['parent'] = args.parent === null ? null : issueKey(args.parent);
    if (args.assignees) fields['assignees'] = await usernamesIn(ctx, projectKeyOf(key), args.org, args.assignees);
    if (args.custom_fields && Object.keys(args.custom_fields).length) {
      fields['custom_fields'] = await customFieldsBody(ctx, projectKeyOf(key), args.org, args.custom_fields);
    }

    const steps: [string, () => Promise<unknown>][] = [];
    if (Object.keys(fields).length) {
      steps.push(['fields', () => ctx.api.send('PATCH', path`/v1/issues/${key}`, { ...s, body: fields })]);
    }
    if (args.add_tags?.length) {
      const tags = args.add_tags;
      steps.push(['tags added', () => ctx.api.send('POST', path`/v1/issues/${key}/tags`, { ...s, body: { tags } })]);
    }
    for (const tag of args.remove_tags ?? []) {
      steps.push([`tag ${tag} removed`, () => ctx.api.send('DELETE', path`/v1/issues/${key}/tags/${tag}`, s)]);
    }
    for (const who of args.add_watchers ?? []) {
      steps.push([
        `watcher ${who} added`,
        async () =>
          ctx.api.send('POST', path`/v1/issues/${key}/watchers`, {
            ...s,
            body: { username: await usernameIn(ctx, projectKeyOf(key), args.org, who) },
          }),
      ]);
    }
    for (const who of args.remove_watchers ?? []) {
      steps.push([
        `watcher ${who} removed`,
        async () =>
          ctx.api.send(
            'DELETE',
            path`/v1/issues/${key}/watchers/${await usernameIn(ctx, projectKeyOf(key), args.org, who)}`,
            s,
          ),
      ]);
    }
    for (const signal of ['watch', 'star', 'vote'] as const) {
      const on = args[signal];
      if (on === undefined) continue;
      steps.push([
        `${signal} ${on ? 'on' : 'off'}`,
        () => ctx.api.send(on ? 'PUT' : 'DELETE', path`/v1/issues/${key}/${signal}`, s),
      ]);
    }
    if (!steps.length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_issue' });

    const applied: string[] = [];
    for (const [label, step] of steps) {
      try {
        await step();
      } catch (error) {
        if (error instanceof ToolError && applied.length) {
          const hint = t('error.mcp.partially_applied', { tool: 'update_issue', applied: applied.join(', ') });
          throw new ToolError({ ...error.body, hints: [...(error.body.hints ?? []), hint] });
        }
        throw error;
      }
      applied.push(label);
    }
    return answer(ctx, await fetchIssue(ctx, key, args.org), 'Updated', args.org);
  },
});

const bulkChanges = z.strictObject({
  status: status().optional(),
  priority: priority().optional(),
  type: type().optional(),
  assignees: arg.people('Replaces every assignee').optional(),
  add_assignees: arg.people('Assignees to add').optional(),
  remove_assignees: arg.people('Assignees to take off').optional(),
  estimate: nullable(arg.duration, 'clears it'),
  story_points: nullable(storyPoints(), 'clears them'),
  sprint: nullable(sprintArg(), 'moves them to the backlog'),
  start_date: nullable(arg.calendarDate, 'clears it'),
  due_date: nullable(arg.calendarDate, 'clears it'),
  parent: nullable(arg.issue, 'makes them top-level'),
  custom_fields: customFieldsArg.optional(),
});

export const bulkUpdateIssues = defineTool({
  name: 'bulk_update_issues',
  title: 'Update many issues',
  description: `Applies the same field changes to a list of issue keys, or to every issue a query matches (at most ${BULK_UPDATE_MAX_ISSUES}). Each issue is checked on its own; the answer lists what changed, what was already so, and each failure with its reason.`,
  input: z.strictObject({
    issues: z
      .array(arg.issue)
      .min(1)
      .max(BULK_UPDATE_MAX_ISSUES)
      .optional()
      .describe('Issue keys. Give this or `query`.'),
    query: z.string().trim().min(1).max(2000).optional().describe('Every issue it matches, as in search_issues.'),
    changes: bulkChanges,
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/issues/bulk-update', 'GET /v1/issues', 'GET /v1/projects/{key}/custom-fields'],
  async run(ctx, args) {
    if ((args.issues === undefined) === (args.query === undefined)) {
      throw ToolError.local(
        'mcp.invalid_arguments',
        { tool: 'bulk_update_issues' },
        { hints: ['Give `issues` or `query`, not both.'] },
      );
    }
    const keys = args.issues ? args.issues.map(issueKey) : await matching(ctx, args.query!, args.org);
    if (!keys.length) return { markdown: `No issues match ${code(args.query!)}; nothing changed.` };

    const changes: Record<string, unknown> = { ...args.changes };
    for (const f of ['assignees', 'add_assignees', 'remove_assignees'] as const) {
      const people = args.changes[f];
      if (people) changes[f] = await usernamesIn(ctx, projectKeyOf(keys[0]!), args.org, people);
    }
    if (typeof changes['parent'] === 'string') changes['parent'] = issueKey(changes['parent']);
    if (args.changes.sprint !== undefined) changes['sprint'] = sprintValue(args.changes.sprint);
    if (args.changes.custom_fields) {
      changes['custom_fields'] = await customFieldsBody(
        ctx,
        projectKeyOf(keys[0]!),
        args.org,
        args.changes.custom_fields,
      );
    }
    const { data } = await ctx.api.send<BulkUpdateResult[]>('POST', '/v1/issues/bulk-update', {
      ...scope(args.org),
      body: { issues: keys, changes },
    });
    const count = (r: BulkUpdateResult['result']) => data.filter(d => d.result === r);
    const failed = count('failed');
    return {
      markdown: join(
        `**${count('updated').length} updated**, ${count('unchanged').length} already so, ${failed.length} failed — of ${data.length}.`,
        count('updated').length
          ? `Updated: ${count('updated')
              .map(d => d.key)
              .join(', ')}`
          : null,
        failed.length
          ? table(
              ['Issue', 'Error', 'Reason'],
              failed.map(f => [
                f.key,
                code(f.error?.code ?? 'failed'),
                (f.error?.message ?? '') +
                  (f.error?.valid_values?.length ? ` Valid: ${list(f.error.valid_values)}` : ''),
              ]),
            )
          : null,
      ),
    };
  },
});

async function matching(ctx: ToolContext, query: string, org: string | undefined): Promise<string[]> {
  const keys: string[] = [];
  const page = 200;
  for (let offset = 0; keys.length < BULK_UPDATE_MAX_ISSUES; offset += page) {
    const res = await ctx.api.get<Issue[]>('/v1/issues', { ...scope(org), query: { q: query, limit: page, offset } });
    keys.push(...res.data.map(i => i.key));
    if (!res.pagination?.has_more) break;
  }
  return keys.slice(0, BULK_UPDATE_MAX_ISSUES);
}

export const deleteIssue = defineTool({
  name: 'delete_issue',
  title: 'Delete issue',
  description:
    'Soft-deletes an issue: it disappears from every list and can be restored with restore_issue for 14 days, then is purged for good. Asks you to confirm before acting.',
  input: z.strictObject({ issue: arg.issue, org: arg.org }),
  kind: 'destructive',
  endpoints: ['DELETE /v1/issues/{key}', 'GET /v1/issues/{key}'],
  async describeAction(ctx, args) {
    const issue = await fetchIssue(ctx, issueKey(args.issue), args.org);
    return t('mcp.action.issue_delete', { key: issue.key, title: issue.title });
  },
  async run(ctx, args) {
    const { data } = await ctx.api.send<Issue>('DELETE', path`/v1/issues/${issueKey(args.issue)}`, scope(args.org));
    return answer(ctx, data, 'Deleted', args.org, 'Restore it with restore_issue before it is purged.');
  },
});

export const restoreIssue = defineTool({
  name: 'restore_issue',
  title: 'Restore issue',
  description: 'Brings back a soft-deleted issue within its 14-day window, with its comments, time and links.',
  input: z.strictObject({ issue: arg.issue, org: arg.org }),
  kind: 'write',
  endpoints: ['POST /v1/issues/{key}/restore'],
  async run(ctx, args) {
    const { data } = await ctx.api.send<Issue>(
      'POST',
      path`/v1/issues/${issueKey(args.issue)}/restore`,
      scope(args.org),
    );
    return answer(ctx, data, 'Restored', args.org);
  },
});

export const getIssueActivity = defineTool({
  name: 'get_issue_activity',
  title: 'Issue history',
  description: 'What happened to an issue, newest first: field changes, comments, links, tags, files and time.',
  input: z.strictObject({
    issue: arg.issue,
    kinds: z
      .array(z.enum(ISSUE_ACTIVITY_KINDS))
      .max(ISSUE_ACTIVITY_KINDS.length)
      .optional()
      .describe('Only these kinds.'),
    limit: arg.limit,
    cursor: arg.cursor,
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/issues/{key}/activity'],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    const url = new URLSearchParams();
    for (const k of args.kinds ?? []) url.append('kind', k);
    const res = await ctx.api.get<IssueActivity[]>(`${path`/v1/issues/${key}/activity`}${url.size ? `?${url}` : ''}`, {
      ...scope(args.org),
      query: { limit: args.limit ?? arg.DEFAULT_LIMIT, cursor: args.cursor },
    });
    const calendar = await calendarFor(ctx, key, args.org).catch(() => undefined);
    const actors = [...new Set(res.data.map(a => (a.actor.username ? handle(a.actor.username) : a.actor.name)))];
    return {
      markdown: join(
        `**${key}** history`,
        res.data.length
          ? untrusted(
              { author: actors.join(', '), place: `the history of ${key}` },
              res.data.map(a => activityLine(a, calendar)).join('\n'),
            )
          : 'Nothing recorded.',
        moreByCursor(res.pagination, res.data.length),
      ),
    };
  },
});
