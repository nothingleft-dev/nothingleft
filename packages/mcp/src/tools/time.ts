import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import type { Issue, Me, WorkItem } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { calendarOf, issueKey, projectKeyOf, projectOrganization, usernameIn } from '../resolve.ts';
import { authorsOf, date, join, moreByCursor, person, table, untrusted } from '../render.ts';
import { duration } from '../render-issue.ts';

const scope = (org: string | undefined) => (org ? { org } : {});
const workItem = z.number().int().positive().describe('The work item number shown as "#7" by list_work_items.');

async function calendarFor(ctx: ToolContext, key: string, org: string | undefined) {
  return calendarOf(await projectOrganization(ctx, projectKeyOf(key), org));
}

/** Today where the caller lives: a work date is a calendar date, and "today" is theirs, not UTC's. */
async function today(ctx: ToolContext): Promise<string> {
  const { data: me } = await ctx.api.get<Me>('/v1/me');
  return new Intl.DateTimeFormat('en-CA', { timeZone: me.timezone }).format(new Date());
}

const rows = (items: WorkItem[], calendar: Parameters<typeof duration>[1]) =>
  items.map(w => [
    `#${w.id}`,
    w.issue,
    date(w.work_date),
    person(w.author),
    duration(w.duration_minutes, calendar) ?? '',
    [w.work_type?.name, ...w.attributes.map(a => `${a.attribute}: ${a.value.name}`)].filter(Boolean).join(', ') || '—',
    w.description_md,
  ]);
const HEADERS = ['Item', 'Issue', 'Date', 'Author', 'Time', 'Work type and attributes', 'Note'];
const workItemTable = (items: WorkItem[], calendar: Parameters<typeof duration>[1], place: string) =>
  untrusted({ author: authorsOf(items.map(w => w.author)), place }, table(HEADERS, rows(items, calendar)));
const attributesArg = z
  .record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(100).nullable())
  .describe(
    'The project\'s work item attributes by name, e.g. {"Billable": "Yes"}; null clears one. describe_project_schema lists them.',
  );

async function spentLine(
  ctx: ToolContext,
  key: string,
  org: string | undefined,
  calendar: Parameters<typeof duration>[1],
) {
  const { data } = await ctx.api.get<Issue>(path`/v1/issues/${key}`, scope(org));
  const estimate = data.estimate_minutes === null ? '' : ` of ${duration(data.estimate_minutes, calendar)} estimated`;
  return `**${key}** spent time is now ${duration(data.spent_minutes, calendar)}${estimate}.`;
}

export const logTime = defineTool({
  name: 'log_time',
  title: 'Log time',
  description:
    "Logs spent time on an issue: a duration on one date (default today in your timezone), or the same duration on every working day from `from` to `to`. Work type defaults to the project's; the project's other work item attributes are set by name. Project Admins may log for another `author`. Returns the work items and the issue's new spent time.",
  input: z.strictObject({
    issue: arg.issue,
    duration: arg.duration,
    date: arg.calendarDate.optional().describe('The day the work was done. Default: today.'),
    from: arg.calendarDate.optional().describe('A range instead of `date`: first day.'),
    to: arg.calendarDate.optional().describe('Last day of the range, at most 62 days on.'),
    work_type: z.string().trim().min(1).max(100).optional().describe('e.g. "Development".'),
    attributes: attributesArg.optional(),
    note: arg.markdown('What was done').optional(),
    author: arg.person.optional().describe('Log on behalf of this member (Project Admins).'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/issues/{key}/work-items', 'GET /v1/issues/{key}', 'GET /v1/me'],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    if ((args.from === undefined) !== (args.to === undefined) || (args.from && args.date)) {
      throw ToolError.local(
        'mcp.invalid_arguments',
        { tool: 'log_time' },
        { hints: ['Give `date`, or `from` with `to`.'] },
      );
    }
    const record = args.from
      ? { from: args.from, to: args.to!, duration: args.duration }
      : { work_date: args.date ?? (await today(ctx)), duration: args.duration };
    const { data } = await ctx.api.send<WorkItem[]>('POST', path`/v1/issues/${key}/work-items`, {
      ...scope(args.org),
      body: {
        records: [record],
        ...(args.work_type ? { work_type: args.work_type } : {}),
        ...(args.attributes && Object.keys(args.attributes).length ? { attributes: args.attributes } : {}),
        ...(args.note ? { description_md: args.note } : {}),
        ...(args.author ? { author: await usernameIn(ctx, projectKeyOf(key), args.org, args.author) } : {}),
      },
    });
    const calendar = await calendarFor(ctx, key, args.org).catch(() => undefined);
    return {
      markdown: join(
        `Logged ${data.length === 1 ? duration(data[0]!.duration_minutes, calendar) : `${data.length} work items`} on **${key}**.`,
        workItemTable(data, calendar, key),
        await spentLine(ctx, key, args.org, calendar),
      ),
    };
  },
});

export const listWorkItems = defineTool({
  name: 'list_work_items',
  title: 'List logged time',
  description: 'The time logged on an issue, newest first; with `subtasks` also on everything below it.',
  input: z.strictObject({
    issue: arg.issue,
    subtasks: z.boolean().optional().describe('Include time logged on its subtasks.'),
    limit: arg.limit,
    cursor: arg.cursor,
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/issues/{key}/work-items'],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    const res = await ctx.api.get<WorkItem[]>(path`/v1/issues/${key}/work-items`, {
      ...scope(args.org),
      query: {
        limit: args.limit ?? arg.DEFAULT_LIMIT,
        cursor: args.cursor,
        include: args.subtasks ? 'subtasks' : undefined,
      },
    });
    const calendar = await calendarFor(ctx, key, args.org).catch(() => undefined);
    return {
      markdown: join(
        `**${key}** — ${res.pagination?.total ?? res.data.length} work items`,
        res.data.length ? workItemTable(res.data, calendar, key) : 'No time logged.',
        moreByCursor(res.pagination, res.data.length),
      ),
    };
  },
});

export const updateWorkItem = defineTool({
  name: 'update_work_item',
  title: 'Edit logged time',
  description:
    'Changes one work item: duration, date, work type, work item attributes, note, or (Project Admins) author. Contributors may edit only their own.',
  input: z.strictObject({
    issue: arg.issue,
    work_item: workItem,
    duration: arg.duration.optional(),
    date: arg.calendarDate.optional(),
    work_type: z.string().trim().min(1).max(100).nullable().optional().describe('null logs it without a work type.'),
    attributes: attributesArg.optional(),
    note: z.string().max(100_000).optional(),
    author: arg.person.optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/issues/{key}/work-items/{id}', 'GET /v1/issues/{key}'],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    const body: Record<string, unknown> = {};
    if (args.duration !== undefined) body['duration'] = args.duration;
    if (args.date) body['work_date'] = args.date;
    if (args.work_type !== undefined) body['work_type'] = args.work_type;
    if (args.attributes && Object.keys(args.attributes).length) body['attributes'] = args.attributes;
    if (args.note !== undefined) body['description_md'] = args.note;
    if (args.author) body['author'] = await usernameIn(ctx, projectKeyOf(key), args.org, args.author);
    if (!Object.keys(body).length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_work_item' });
    const { data } = await ctx.api.send<WorkItem>(
      'PATCH',
      path`/v1/issues/${key}/work-items/${String(args.work_item)}`,
      {
        ...scope(args.org),
        body,
      },
    );
    const calendar = await calendarFor(ctx, key, args.org).catch(() => undefined);
    return {
      markdown: join(
        `Updated work item #${data.id} on **${key}**.`,
        workItemTable([data], calendar, key),
        await spentLine(ctx, key, args.org, calendar),
      ),
    };
  },
});

export const deleteWorkItem = defineTool({
  name: 'delete_work_item',
  title: 'Delete logged time',
  description:
    "Deletes one work item; the issue's spent time drops by it. Contributors may delete only their own. Asks you to confirm before acting.",
  input: z.strictObject({ issue: arg.issue, work_item: workItem, org: arg.org }),
  kind: 'destructive',
  endpoints: [
    'DELETE /v1/issues/{key}/work-items/{id}',
    'GET /v1/issues/{key}/work-items/{id}',
    'GET /v1/issues/{key}',
  ],
  async describeAction(ctx, args) {
    const key = issueKey(args.issue);
    const { data } = await ctx.api.get<WorkItem>(
      path`/v1/issues/${key}/work-items/${String(args.work_item)}`,
      scope(args.org),
    );
    const calendar = await calendarFor(ctx, key, args.org).catch(() => undefined);
    return t('mcp.action.work_item_delete', {
      duration: duration(data.duration_minutes, calendar) ?? '',
      author: person(data.author),
      date: date(data.work_date),
      key,
    });
  },
  async run(ctx, args) {
    const key = issueKey(args.issue);
    const { data } = await ctx.api.send<WorkItem>(
      'DELETE',
      path`/v1/issues/${key}/work-items/${String(args.work_item)}`,
      scope(args.org),
    );
    const calendar = await calendarFor(ctx, key, args.org).catch(() => undefined);
    return {
      markdown: join(
        `Deleted work item #${data.id} (${duration(data.duration_minutes, calendar)} by ${person(data.author)} on ${date(data.work_date)}).`,
        await spentLine(ctx, key, args.org, calendar),
      ),
    };
  },
});
