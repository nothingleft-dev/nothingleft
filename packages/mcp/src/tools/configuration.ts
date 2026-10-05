import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import {
  LABEL_COLORS,
  ORG_ACTIVITY_KINDS,
  STATUS_CATEGORIES,
  type IssueFigures,
  type IssueType,
  type MemberRef,
  type Me,
  type OrgActivity,
  type Organization,
  type Priority,
  type Project,
  type CustomField,
  type TagRef,
  type WorkItemAttribute,
  type WorkType,
  type WorkflowStatus,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { resolveOrganization } from '../organizations.ts';
import { calendarOf, resolveUsername, usernameIn } from '../resolve.ts';
import { code, date, facts, instant, join, moreByCursor, person, roleLabel, table, untrusted } from '../render.ts';
import { duration } from '../render-issue.ts';
import { activeSprintLine, agileMap } from './agile.ts';
import { customFieldsSection } from './custom-fields.ts';

const scope = (org: string | undefined) => (org ? { org } : {});

export function projectFacts(p: Project) {
  return facts([
    ['Lead', p.lead ? person(p.lead) : 'none'],
    ['Your role', roleLabel(p.my_role)],
    ['Time tracking', p.time_tracking_enabled ? 'On' : 'Off'],
    ['Estimation field', p.estimation_field ? `${p.estimation_field.name} (\`${p.estimation_field.slug}\`)` : null],
    ['Spent time field', p.spent_time_field ? `${p.spent_time_field.name} (\`${p.spent_time_field.slug}\`)` : null],
    ['Archived', p.is_archived ? 'Yes — read-only' : 'No'],
    ['Created', date(p.created_at)],
    ['Updated', date(p.updated_at)],
  ]);
}

export function figuresLine(f: IssueFigures): string {
  return [
    `${f.open} open`,
    `${f.unassigned} unassigned`,
    `${f.overdue} overdue`,
    `${f.due_today} due today`,
    `${f.created_7d} created and ${f.resolved_7d} resolved in 7 days`,
  ].join(' · ');
}

export async function projectOverview(ctx: ToolContext, key: string, org: string | undefined): Promise<string> {
  const s = scope(org);
  const [{ data: p }, figures, sprint] = await Promise.all([
    ctx.api.get<Project>(path`/v1/projects/${key}`, s),
    ctx.api.get<IssueFigures[]>('/v1/issues/figures', { ...s, query: { project: key } }).then(r => r.data[0]),
    activeSprintLine(ctx, key, org),
  ]);
  return join(
    `**${p.key}** — ${p.name}\n${ctx.appBaseUrl}/projects/${p.key}`,
    projectFacts(p),
    figures ? `Issues: ${figuresLine(figures)}` : null,
    sprint,
    figures?.by_assignee.length
      ? `Open by assignee: ${figures.by_assignee.map(a => `${person(a.member)} ${a.open}`).join(', ')}`
      : null,
    p.description_md ? untrusted({ author: 'a Project Admin', place: p.key }, p.description_md) : '_No description._',
  );
}

export const getProject = defineTool({
  name: 'get_project',
  title: 'Get project',
  description:
    "One project: lead, your role, time tracking, archived state, the active sprint with days left and progress, today's issue figures (open, unassigned, overdue, due today, created and resolved in 7 days, open per assignee) and its description.",
  input: z.strictObject({ project: arg.project, org: arg.org }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}', 'GET /v1/issues/figures', 'GET /v1/projects/{key}/sprints'],
  async run(ctx, args) {
    return { markdown: await projectOverview(ctx, args.project.toUpperCase(), args.org) };
  },
});

export async function schemaMap(ctx: ToolContext, key: string, org: string | undefined): Promise<string> {
  const s = scope(org);
  const get = <T>(route: string) => ctx.api.get<T>(route, s).then(r => r.data);
  const [project, statuses, priorities, types, workTypes, assignable, authors, tags, agile, fields, attributes] =
    await Promise.all([
      get<Project>(path`/v1/projects/${key}`),
      get<WorkflowStatus[]>(path`/v1/projects/${key}/statuses`),
      get<Priority[]>(path`/v1/projects/${key}/priorities`),
      get<IssueType[]>(path`/v1/projects/${key}/types`),
      get<WorkType[]>(path`/v1/projects/${key}/work-types`),
      get<MemberRef[]>(path`/v1/projects/${key}/assignees`),
      get<MemberRef[]>(path`/v1/projects/${key}/work-authors`).catch(() => [] as MemberRef[]),
      ctx.api.get<TagRef[]>('/v1/tags', { ...s, query: { limit: 100 } }).then(r => r.data),
      agileMap(ctx, key, org),
      get<CustomField[]>(path`/v1/projects/${key}/custom-fields`),
      get<WorkItemAttribute[]>(path`/v1/projects/${key}/work-item-attributes`),
    ]);
  const liveAttributes = attributes.filter(a => !a.is_archived);
  const timeFields = [
    project.estimation_field
      ? `Estimation is the field ${project.estimation_field.name} (\`estimate\` writes it)`
      : null,
    project.spent_time_field ? `Spent time is the field ${project.spent_time_field.name} (from logged time)` : null,
  ].filter(Boolean);
  const dflt = (v: { is_default: boolean }) => (v.is_default ? ' (default)' : '');
  const live = <T extends { is_archived?: boolean }>(values: T[]) => values.filter(v => !v.is_archived);
  return join(
    `**${project.key}** — ${project.name}: the values every issue in it takes. Names are what tools and queries accept.`,
    `**Statuses** (category)\n${live(statuses)
      .map(
        v =>
          `- ${v.name}${dflt(v)} — ${v.category}${v.category === 'done' || v.category === 'cancelled' ? ', resolved' : ''}`,
      )
      .join('\n')}`,
    `**Priorities**: ${priorities.map(v => v.name + dflt(v)).join(', ')}`,
    `**Types**: ${types.map(v => v.name + dflt(v)).join(', ')}`,
    project.time_tracking_enabled
      ? join(
          `**Time tracking** on. Work types: ${live(workTypes)
            .map(v => v.name + dflt(v))
            .join(', ')}${timeFields.length ? `. ${timeFields.join('; ')}` : ''}`,
          liveAttributes.length
            ? `**Work item attributes** (log_time \`attributes\`): ${liveAttributes
                .map(
                  a =>
                    `${a.name} — ${live(a.values)
                      .map(v => v.name)
                      .join(', ')}`,
                )
                .join('; ')}`
            : null,
        )
      : '**Time tracking** off: log_time is refused here.',
    customFieldsSection(fields),
    agile,
    `**Link names**: relates to, depends on, is required for, duplicates, is duplicated by, subtask of, parent for`,
    `**Assignable** (${assignable.length}): ${assignable.map(person).join(', ') || 'nobody'}`,
    authors.length ? `**May log time as author**: ${authors.map(person).join(', ')}` : null,
    tags.length
      ? `**Tags in the organisation** (${tags.length}${tags.length === 100 ? '+, list_tags for more' : ''}): ${tags.map(tg => tg.name).join(', ')}`
      : '**Tags**: none yet — any name you use is created.',
  );
}

export const describeProjectSchema = defineTool({
  name: 'describe_project_schema',
  title: 'Describe a project',
  description:
    'The map of one project, in one call: statuses with their category (and which resolve an issue), priorities, types, work types and work item attributes, the custom fields (slug, type, required, options, which types they apply to), the planned and active sprints, the boards and their columns, link names, who can be assigned, who may log time, and the tags in use. Call it once before writing issues or queries.',
  input: z.strictObject({ project: arg.project, org: arg.org }),
  kind: 'read',
  endpoints: [
    'GET /v1/projects/{key}',
    'GET /v1/projects/{key}/statuses',
    'GET /v1/projects/{key}/priorities',
    'GET /v1/projects/{key}/types',
    'GET /v1/projects/{key}/work-types',
    'GET /v1/projects/{key}/assignees',
    'GET /v1/projects/{key}/work-authors',
    'GET /v1/tags',
    'GET /v1/projects/{key}/sprints',
    'GET /v1/projects/{key}/boards',
    'GET /v1/projects/{key}/custom-fields',
    'GET /v1/projects/{key}/work-item-attributes',
  ],
  async run(ctx, args) {
    return { markdown: await schemaMap(ctx, args.project.toUpperCase(), args.org) };
  },
});

function orgFacts(o: Organization) {
  const calendar = calendarOf(o);
  return facts([
    ['Plan', o.plan],
    ['Owner', person(o.owner)],
    ['Your role', roleLabel(o.membership.is_owner ? 'owner' : o.membership.org_role)],
    ['You are', `@${o.membership.username}`],
    ['Seats', o.seats.free === null ? `${o.seats.used}` : `${o.seats.used} of ${o.seats.free} free`],
    [
      'Storage',
      o.storage.bring_your_own === 'verified'
        ? `your own bucket, no limit (${(o.storage.used_bytes / 1024 ** 2).toFixed(1)} MB still on the platform)`
        : `${(o.storage.used_bytes / 1024 ** 2).toFixed(1)} MB of ${(o.storage.limit_bytes / 1024 ** 3).toFixed(0)} GB (${o.storage.level})` +
          (o.storage.bring_your_own === 'failed' ? ' · your own bucket is failing: an admin must fix its key' : ''),
    ],
    ['Working day', duration(o.workday_minutes, calendar)],
    ['Working week', `${o.workweek_days} days, starting ${WEEKDAYS[o.week_starts_on]}`],
    ['Created', date(o.created_at)],
  ]);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const getOrg = defineTool({
  name: 'get_org',
  title: 'Get organisation',
  description:
    'One organisation: plan, owner, your role and username, seats, storage used, and the working day and week durations are read with.',
  input: z.strictObject({ org: arg.org }),
  kind: 'read',
  endpoints: ['GET /v1/organizations', 'GET /v1/organizations/{slug}'],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    const { data: o } = await ctx.api.get<Organization>(path`/v1/organizations/${org.slug}`);
    return { markdown: join(`**${o.name}** (${code(o.slug)})`, orgFacts(o)) };
  },
});

export const updateOrgSettings = defineTool({
  name: 'update_org_settings',
  title: 'Update organisation settings',
  description:
    'Renames the organisation or changes its slug, working day, working week or first day of the week. Needs an Org Admin and a token with admin:org.',
  input: z.strictObject({
    org: arg.org,
    name: z.string().trim().min(1).max(100).optional(),
    slug: z.string().trim().min(1).max(100).optional().describe('The new slug. Links with the old one stop working.'),
    workday: arg.duration.optional().describe('Length of a working day, e.g. "7h 30m": what "1d" means.'),
    workweek_days: z.number().int().min(1).max(7).optional().describe('Working days in a week: what "1w" means.'),
    week_starts_on: z.enum(WEEKDAYS as [string, ...string[]]).optional(),
  }),
  kind: 'write',
  endpoints: ['GET /v1/organizations', 'PATCH /v1/organizations/{slug}'],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    const body: Record<string, unknown> = {};
    if (args.name) body['name'] = args.name;
    if (args.slug) body['slug'] = args.slug;
    if (args.workday !== undefined) body['workday_minutes'] = workdayMinutes(args.workday);
    if (args.workweek_days) body['workweek_days'] = args.workweek_days;
    if (args.week_starts_on) body['week_starts_on'] = WEEKDAYS.indexOf(args.week_starts_on);
    if (!Object.keys(body).length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_org_settings' });
    const { data: o } = await ctx.api.send<Organization>('PATCH', path`/v1/organizations/${org.slug}`, { body });
    return { markdown: join(`Updated **${o.name}** (${code(o.slug)})`, orgFacts(o)) };
  },
});

// A working day is always hours and minutes; days and weeks would be defined by the thing being set.
function workdayMinutes(value: number | string): number {
  if (typeof value === 'number') return value;
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/i.exec(value.trim());
  if (!m || (!m[1] && !m[2])) {
    throw ToolError.local(
      'mcp.invalid_arguments',
      { tool: 'update_org_settings' },
      { hints: ['`workday` is hours and minutes, e.g. "8h" or "7h 30m".'] },
    );
  }
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

export const getOrgActivity = defineTool({
  name: 'get_org_activity',
  title: 'Organisation audit log',
  description:
    "The organisation's audit log, newest first: invitations, joins, removals, role changes, projects and settings. Needs an Org Admin and admin:org.",
  input: z.strictObject({
    org: arg.org,
    actor: arg.person.optional().describe('Only what this member did.'),
    kinds: z.array(z.enum(ORG_ACTIVITY_KINDS)).max(ORG_ACTIVITY_KINDS.length).optional(),
    from: arg.calendarDate.optional(),
    to: arg.calendarDate.optional(),
    limit: arg.limit,
    cursor: arg.cursor,
  }),
  kind: 'read',
  endpoints: ['GET /v1/organizations', 'GET /v1/organizations/{slug}/activity'],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    const kinds = new URLSearchParams();
    for (const k of args.kinds ?? []) kinds.append('kind', k);
    const route = path`/v1/organizations/${org.slug}/activity`;
    const res = await ctx.api.get<OrgActivity[]>(kinds.size ? `${route}?${kinds}` : route, {
      query: {
        actor: args.actor ? await resolveUsername(ctx, org, args.actor) : undefined,
        from: args.from,
        to: args.to,
        limit: args.limit ?? arg.DEFAULT_LIMIT,
        cursor: args.cursor,
      },
    });
    const value = (v: unknown) =>
      v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return {
      markdown: join(
        `**${org.name}** audit log`,
        res.data.length
          ? table(
              ['When', 'Who', 'What', 'Target', 'Change'],
              res.data.map(a => [
                instant(a.created_at),
                a.actor
                  ? a.actor.username
                    ? person({ ...a.actor, username: a.actor.username })
                    : a.actor.name
                  : 'system',
                a.kind.replace(/_/g, ' '),
                `${a.target_type} ${a.target_id}`,
                [value(a.old_value), value(a.new_value)].filter(Boolean).join(' → '),
              ]),
            )
          : 'Nothing recorded.',
        moreByCursor(res.pagination, res.data.length),
      ),
    };
  },
});

export const createOrg = defineTool({
  name: 'create_org',
  title: 'Create organisation',
  description: 'Creates an organisation with you as its Owner. The slug is derived from the name unless given.',
  input: z.strictObject({
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().min(1).max(100).optional(),
  }),
  kind: 'write',
  endpoints: ['POST /v1/organizations'],
  async run(ctx, args) {
    const { data: o } = await ctx.api.send<Organization>('POST', '/v1/organizations', { body: args });
    return {
      markdown: join(
        `Created **${o.name}** (${code(o.slug)}). Create its first project with create_project.`,
        orgFacts(o),
      ),
    };
  },
});

export const createProject = defineTool({
  name: 'create_project',
  title: 'Create project',
  description:
    'Creates a project with the default statuses, priorities, types and work types. The key (the PP in PP-12) is derived from the name unless given, and freezes once the first issue exists. Needs an Org Admin.',
  input: z.strictObject({
    name: z.string().trim().min(1).max(100),
    key: z.string().trim().min(1).max(20).optional().describe('2–10 letters or digits, e.g. "PP".'),
    description: arg.markdown('What the project is for').optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['GET /v1/organizations', 'POST /v1/projects'],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    const { data: p } = await ctx.api.send<Project>('POST', '/v1/projects', {
      org: org.slug,
      body: {
        name: args.name,
        ...(args.key ? { key: args.key.toUpperCase() } : {}),
        ...(args.description ? { description_md: args.description } : {}),
      },
    });
    return {
      markdown: join(
        `Created project **${p.key}** — ${p.name} in ${org.name}\n${ctx.appBaseUrl}/projects/${p.key}`,
        projectFacts(p),
      ),
    };
  },
});

export const updateProject = defineTool({
  name: 'update_project',
  title: 'Update project',
  description:
    'Changes a project: name, key (only before its first issue), description, lead, time tracking on or off, which duration custom field is its Estimation or its Spent time, archived (read-only) or not. Needs a Project Admin and admin:project.',
  input: z.strictObject({
    project: arg.project,
    name: z.string().trim().min(1).max(100).optional(),
    key: z.string().trim().min(1).max(20).optional().describe('New key; refused once the project has an issue.'),
    description: arg.markdown('The new description').nullable().optional(),
    lead: arg.person.nullable().optional().describe('The project lead; null for none.'),
    time_tracking: z
      .boolean()
      .optional()
      .describe('false hides estimation and spent time and refuses logging; logged time is kept.'),
    estimation_field: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .nullable()
      .optional()
      .describe('A duration custom field by name or slug that becomes the Estimation; null for the built-in.'),
    spent_time_field: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .nullable()
      .optional()
      .describe('A duration custom field that shows the logged time as Spent time; null for the built-in.'),
    archived: z.boolean().optional().describe('true makes the project read-only; false reopens it.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: [
    'PATCH /v1/projects/{key}',
    'POST /v1/projects/{key}/archive',
    'POST /v1/projects/{key}/unarchive',
    'GET /v1/projects/{key}',
  ],
  async run(ctx, args) {
    let key = args.project.toUpperCase();
    const s = scope(args.org);
    // Unarchive first and archive last: an archived project refuses every other change.
    if (args.archived === false) await ctx.api.send('POST', path`/v1/projects/${key}/unarchive`, s);
    const body: Record<string, unknown> = {};
    if (args.name) body['name'] = args.name;
    if (args.key) body['key'] = args.key.toUpperCase();
    if (args.description !== undefined) body['description_md'] = args.description;
    if (args.lead !== undefined)
      body['lead'] = args.lead === null ? null : await usernameIn(ctx, key, args.org, args.lead);
    if (args.time_tracking !== undefined) body['time_tracking_enabled'] = args.time_tracking;
    if (args.estimation_field !== undefined) body['estimation_field'] = args.estimation_field;
    if (args.spent_time_field !== undefined) body['spent_time_field'] = args.spent_time_field;
    if (Object.keys(body).length) {
      const { data } = await ctx.api.send<Project>('PATCH', path`/v1/projects/${key}`, { ...s, body });
      key = data.key;
    } else if (args.archived === undefined) {
      throw ToolError.local('mcp.nothing_to_change', { tool: 'update_project' });
    }
    if (args.archived === true) await ctx.api.send('POST', path`/v1/projects/${key}/archive`, s);
    const { data: p } = await ctx.api.get<Project>(path`/v1/projects/${key}`, s);
    return { markdown: join(`Updated **${p.key}** — ${p.name}`, projectFacts(p)) };
  },
});

const LISTS = {
  status: 'statuses',
  priority: 'priorities',
  type: 'types',
  'work type': 'work-types',
  'work item attribute': 'work-item-attributes',
  'work item attribute value': 'work-item-attributes',
} as const;
type ListName = keyof typeof LISTS;

const schemaInput = z.strictObject({
  project: arg.project,
  list: z.enum(Object.keys(LISTS) as [ListName, ...ListName[]]).describe('Which value list.'),
  action: z.enum(['add', 'update', 'delete']),
  name: z.string().trim().min(1).max(100).describe('The value to add, or the existing one to change or delete.'),
  attribute: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('work item attribute value: the attribute it belongs to, e.g. "Billable".'),
  new_name: z.string().trim().min(1).max(100).optional().describe('update: rename it.'),
  category: z
    .enum(STATUS_CATEGORIES)
    .optional()
    .describe('Statuses: backlog, unstarted, started, done or cancelled. done and cancelled resolve an issue.'),
  color: z.enum(LABEL_COLORS).optional().describe('Statuses, priorities, types: a label colour such as "blue-2".'),
  short_label: z.string().trim().length(1).optional().describe('The one-letter badge.'),
  position: z.number().int().min(0).max(999).optional().describe('0 is first.'),
  default: z.literal(true).optional().describe('Make it the default for new issues (or new time).'),
  archived: z.boolean().optional().describe('Statuses and work types: hide it from pickers without deleting it.'),
  move_to: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('delete: the value issues using it move to, when any do.'),
  org: arg.org,
});

export const updateProjectSchema = defineTool({
  name: 'update_project_schema',
  title: 'Change a project value list',
  description:
    'Adds, changes or deletes one status, priority, type or work type in a project — or one of its own work item attributes (select attributes on logged time beside Work type, e.g. Billable) or one of their values (with `attribute`): rename, recolour, reorder, set the default, archive. Deleting a value in use needs `move_to`; deleting an attribute removes it from every work item. Every issue in the project sees the change, so it asks you to confirm before acting, and needs a Project Admin and admin:project.',
  input: schemaInput,
  kind: 'destructive',
  endpoints: [
    'GET /v1/projects/{key}/statuses',
    'GET /v1/projects/{key}/priorities',
    'GET /v1/projects/{key}/types',
    'GET /v1/projects/{key}/work-types',
    'POST /v1/projects/{key}/statuses',
    'PATCH /v1/projects/{key}/statuses/{name}',
    'DELETE /v1/projects/{key}/statuses/{name}',
    'POST /v1/projects/{key}/priorities',
    'PATCH /v1/projects/{key}/priorities/{name}',
    'DELETE /v1/projects/{key}/priorities/{name}',
    'POST /v1/projects/{key}/types',
    'PATCH /v1/projects/{key}/types/{name}',
    'DELETE /v1/projects/{key}/types/{name}',
    'POST /v1/projects/{key}/work-types',
    'PATCH /v1/projects/{key}/work-types/{name}',
    'DELETE /v1/projects/{key}/work-types/{name}',
    'GET /v1/projects/{key}/work-item-attributes',
    'POST /v1/projects/{key}/work-item-attributes',
    'PATCH /v1/projects/{key}/work-item-attributes/{name}',
    'DELETE /v1/projects/{key}/work-item-attributes/{name}',
    'POST /v1/projects/{key}/work-item-attributes/{name}/values',
    'PATCH /v1/projects/{key}/work-item-attributes/{name}/values/{value}',
    'DELETE /v1/projects/{key}/work-item-attributes/{name}/values/{value}',
  ],
  async describeAction(_ctx, args) {
    const key = args.project.toUpperCase();
    if (args.action === 'delete') {
      return t('mcp.action.schema_delete', {
        list: args.list,
        name: args.name,
        project: key,
        move: args.move_to ? `, moving its issues to “${args.move_to}”` : '',
      });
    }
    if (args.action === 'add') return `add the ${args.list} “${args.name}” to ${key}`;
    return t('mcp.action.schema_change', { list: args.list, name: args.name, project: key });
  },
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const s = scope(args.org);
    if (args.list === 'work item attribute value' && !args.attribute) {
      throw ToolError.local(
        'mcp.invalid_arguments',
        { tool: 'update_project_schema' },
        { hints: ['Name the work item attribute the value belongs to in `attribute`.'] },
      );
    }
    const listBase = `${path`/v1/projects/${key}`}/${LISTS[args.list]}`;
    const base =
      args.list === 'work item attribute value'
        ? `${listBase}/${encodeURIComponent(args.attribute!)}/values`
        : listBase;
    const body: Record<string, unknown> = {};
    if (args.action === 'add') body['name'] = args.name;
    if (args.new_name) body['name'] = args.new_name;
    for (const f of ['category', 'color', 'short_label', 'position'] as const)
      if (args[f] !== undefined) body[f] = args[f];
    if (args.default) body['is_default'] = true;
    if (args.archived !== undefined) body['is_archived'] = args.archived;

    if (args.action === 'add') await ctx.api.send('POST', base, { ...s, body });
    else if (args.action === 'update') {
      if (!Object.keys(body).length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_project_schema' });
      await ctx.api.send('PATCH', `${base}/${encodeURIComponent(args.name)}`, { ...s, body });
    } else {
      await ctx.api.send('DELETE', `${base}/${encodeURIComponent(args.name)}`, {
        ...s,
        ...(args.move_to ? { query: { move_to: args.move_to } } : {}),
      });
    }
    if (args.list === 'work item attribute' || args.list === 'work item attribute value') {
      const { data: attributes } = await ctx.api.get<WorkItemAttribute[]>(listBase, s);
      return {
        markdown: join(
          `${args.action === 'add' ? 'Added' : args.action === 'update' ? 'Changed' : 'Deleted'} ${args.list} “${args.new_name ?? args.name}” in ${key}.`,
          `${key} work item attributes now: Work type (built in)${attributes
            .map(
              a =>
                `; ${a.name}${a.is_archived ? ' (archived)' : ''}: ${a.values
                  .map(v => `${v.name} [${v.short_label}]${v.is_archived ? ' (archived)' : ''}`)
                  .join(', ')}`,
            )
            .join('')}`,
        ),
      };
    }
    const { data } = await ctx.api.get<{ name: string; is_default: boolean; is_archived?: boolean }[]>(base, s);
    return {
      markdown: join(
        `${args.action === 'add' ? 'Added' : args.action === 'update' ? 'Changed' : 'Deleted'} ${args.list} “${args.new_name ?? args.name}” in ${key}.`,
        `${key} ${LISTS[args.list].replace('-', ' ')} now: ${data
          .map(v => `${v.name}${v.is_default ? ' (default)' : ''}${v.is_archived ? ' (archived)' : ''}`)
          .join(', ')}`,
      ),
    };
  },
});

export const updateProfile = defineTool({
  name: 'update_profile',
  title: 'Update your profile',
  description:
    'Changes your own name or timezone (an IANA name such as "Europe/London"), which date filters like `created: Today` are read in.',
  input: z.strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/me'],
  async run(ctx, args) {
    if (!args.name && !args.timezone) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_profile' });
    const { data: me } = await ctx.api.send<Me>('PATCH', '/v1/me', { body: args });
    return { markdown: `Your profile: **${me.name}** · timezone ${me.timezone}.` };
  },
});
