import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import {
  BACKLOG_MOVE_MAX_ISSUES,
  BOARD_COLUMNS_MAX,
  BOARD_COLUMN_FIELDS,
  BOARD_CURRENT_SPRINT,
  BOARD_OPEN_ISSUES,
  BOARD_SWIMLANE_FIELDS,
  BOARD_SWIMLANES,
  SPRINT_STATES,
  type Board,
  type BoardCard,
  type BoardView,
  type Issue,
  type Sprint,
  type SprintFinishResult,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { calendarOf, issueKey, projectKeyOf, projectOrganization } from '../resolve.ts';
import { code, date, facts, join, more, person, table } from '../render.ts';
import { duration, issueTable } from '../render-issue.ts';

const scope = (org: string | undefined) => (org ? { org } : {});
const BACKLOG = 'backlog';
const SNAPSHOT_ROWS = 14;

const dates = (s: Pick<Sprint, 'start_date' | 'end_date'>) =>
  s.start_date || s.end_date ? `${date(s.start_date)} – ${date(s.end_date)}` : 'Unscheduled';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const daysLeft = (n: number) => (n < 0 ? `ended ${days(-n)} ago` : n === 0 ? 'ends today' : `${days(n)} left`);

const progressLine = (s: Sprint, minutes?: string | null) =>
  [
    `${s.progress.resolved_issues}/${s.progress.issues} issues resolved`,
    `${s.progress.resolved_points}/${s.progress.points} points`,
    minutes ? `${minutes} estimated work left` : null,
  ]
    .filter(Boolean)
    .join(' · ');

const statusLine = (s: Sprint) =>
  s.progress.by_status.length ? s.progress.by_status.map(b => `${b.name} ${b.count}`).join(' · ') : null;

async function calendarFor(ctx: ToolContext, project: string, org: string | undefined) {
  return calendarOf(await projectOrganization(ctx, project, org));
}

async function sprintFacts(ctx: ToolContext, s: Sprint, org: string | undefined) {
  const calendar = await calendarFor(ctx, s.project.key, org).catch(() => undefined);
  const left = s.progress.remaining_estimate_minutes ? duration(s.progress.remaining_estimate_minutes, calendar) : null;
  return facts([
    ['Project', `${s.project.key} — ${s.project.name}`],
    ['State', s.state],
    ['Dates', dates(s)],
    ['Days left', s.days_left === null ? null : s.days_left < 0 ? daysLeft(s.days_left) : String(s.days_left)],
    ['Progress', progressLine(s, left)],
    ['By status', statusLine(s)],
    [
      'Your issues',
      s.progress.mine.issues ? `${s.progress.mine.resolved_issues}/${s.progress.mine.issues} resolved` : null,
    ],
    ['Slug', code(s.slug)],
  ]);
}

const sprintHeading = (ctx: ToolContext, s: Sprint, verb?: string) =>
  `${verb ? `${verb} sprint ` : ''}**${s.name}** (${s.state})\n${ctx.appBaseUrl}/projects/${s.project.key}/board/${s.project.key.toLowerCase()}/${s.slug}`;

/** A sprint as get_sprint and sprint:// show it: facts, goal, the burndown series and its issues. */
export async function renderSprint(ctx: ToolContext, project: string, sprint: string, org: string | undefined) {
  const s = scope(org);
  const { data: sp } = await ctx.api.get<Sprint>(path`/v1/projects/${project}/sprints/${sprint}`, s);
  const issues = await ctx.api.get<Issue[]>(path`/v1/projects/${project}/backlog`, {
    ...s,
    query: { sprint: sp.slug, limit: 50 },
  });
  const snapshots = (sp.snapshots ?? []).slice(-SNAPSHOT_ROWS);
  return join(
    sprintHeading(ctx, sp),
    await sprintFacts(ctx, sp, org),
    sp.goal_md ? `**Goal**\n\n${sp.goal_md}` : '_No goal._',
    snapshots.length
      ? `**Burndown** (daily, UTC)\n${table(
          ['Date', 'Points done', 'Issues done', 'Estimate left'],
          snapshots.map(n => [
            date(n.date),
            `${n.completed_points}/${n.total_points}`,
            `${n.completed_issues}/${n.total_issues}`,
            duration(n.remaining_estimate_minutes) ?? '0m',
          ]),
        )}`
      : null,
    issues.data.length
      ? `**Issues**, in board order\n${issueTable(issues.data, await ctx.timeZone())}`
      : '_No issues in this sprint._',
    more(issues.pagination, issues.data.length),
  );
}

const sprintRows = (sprints: Sprint[], withProject: boolean) =>
  table(
    [...(withProject ? ['Project'] : []), 'Sprint', 'State', 'Dates', 'Days left', 'Issues', 'Points'],
    sprints.map(s => [
      ...(withProject ? [s.project.key] : []),
      s.name,
      s.state,
      dates(s),
      s.days_left === null ? '—' : s.days_left < 0 ? daysLeft(s.days_left) : String(s.days_left),
      `${s.progress.resolved_issues}/${s.progress.issues}`,
      `${s.progress.resolved_points}/${s.progress.points}`,
    ]),
  );

export const listSprints = defineTool({
  name: 'list_sprints',
  title: 'List sprints',
  description:
    "A project's sprints - planned, active and completed - with dates, days left and progress. Without `project`, the sprints of every project you can read (default: the active ones).",
  input: z.strictObject({
    project: arg.project.optional(),
    state: z.array(z.enum(SPRINT_STATES)).max(3).optional().describe('Only these states, e.g. ["planned", "active"].'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}/sprints', 'GET /v1/sprints'],
  async run(ctx, args) {
    const states = args.state?.length ? args.state : args.project ? undefined : (['active'] as const);
    const query = states ? { state: states.join(',') } : {};
    const { data } = args.project
      ? await ctx.api.get<Sprint[]>(path`/v1/projects/${args.project.toUpperCase()}/sprints`, {
          ...scope(args.org),
          query,
        })
      : await ctx.api.get<Sprint[]>('/v1/sprints', { ...scope(args.org), query });
    const where = args.project ? args.project.toUpperCase() : 'your projects';
    return {
      markdown: join(
        `**${data.length} ${data.length === 1 ? 'sprint' : 'sprints'}** in ${where}${states ? ` (${states.join(', ')})` : ''}`,
        data.length ? sprintRows(data, !args.project) : 'None. create_sprint plans one.',
      ),
    };
  },
});

export const getSprint = defineTool({
  name: 'get_sprint',
  title: 'Get sprint',
  description:
    'One sprint: dates, days left, goal, progress in issues and story points, the status breakdown, the daily burndown series and its issues in board order.',
  input: z.strictObject({ project: arg.project, sprint: arg.sprint, org: arg.org }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}/sprints/{sprint}', 'GET /v1/projects/{key}/backlog'],
  async run(ctx, args) {
    return { markdown: await renderSprint(ctx, args.project.toUpperCase(), args.sprint, args.org) };
  },
});

export const createSprint = defineTool({
  name: 'create_sprint',
  title: 'Plan a sprint',
  description:
    "Plans a sprint in a project. Dates are optional (Unscheduled until set); `add_unresolved_from` brings in another sprint's unresolved issues. Needs Project Admin and admin:project. Put issues in with move_to_sprint.",
  input: z.strictObject({
    project: arg.project,
    name: z.string().trim().min(1).max(100).describe('e.g. "September 2026".'),
    goal: arg.markdown('What the sprint is for').optional(),
    start_date: arg.calendarDate.optional(),
    end_date: arg.calendarDate.optional(),
    add_unresolved_from: arg.sprint.optional().describe('Another sprint whose unresolved issues move into this one.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/sprints'],
  async run(ctx, args) {
    const { data: s } = await ctx.api.send<Sprint>('POST', path`/v1/projects/${args.project.toUpperCase()}/sprints`, {
      ...scope(args.org),
      body: {
        name: args.name,
        ...(args.goal !== undefined ? { goal_md: args.goal } : {}),
        ...(args.start_date ? { start_date: args.start_date } : {}),
        ...(args.end_date ? { end_date: args.end_date } : {}),
        ...(args.add_unresolved_from ? { add_unresolved_from: args.add_unresolved_from } : {}),
      },
    });
    return {
      markdown: join(
        sprintHeading(ctx, s, 'Planned'),
        await sprintFacts(ctx, s, args.org),
        args.add_unresolved_from
          ? `${s.progress.issues} unresolved issues came from ${args.add_unresolved_from}.`
          : null,
      ),
    };
  },
});

const nullableDate = (what: string) =>
  arg.calendarDate.nullable().optional().describe(`${what}, YYYY-MM-DD; null clears it.`);

export const updateSprint = defineTool({
  name: 'update_sprint',
  title: 'Change a sprint',
  description:
    'Renames a sprint or changes its goal or dates; null clears. A running sprint keeps both dates. Needs Project Admin and admin:project.',
  input: z.strictObject({
    project: arg.project,
    sprint: arg.sprint,
    name: z.string().trim().min(1).max(100).optional().describe('New name; the slug follows it.'),
    goal: arg.markdown('The new goal').nullable().optional(),
    start_date: nullableDate('Start'),
    end_date: nullableDate('End'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/projects/{key}/sprints/{sprint}'],
  async run(ctx, args) {
    const body: Record<string, unknown> = {};
    if (args.name !== undefined) body['name'] = args.name;
    if (args.goal !== undefined) body['goal_md'] = args.goal;
    if (args.start_date !== undefined) body['start_date'] = args.start_date;
    if (args.end_date !== undefined) body['end_date'] = args.end_date;
    if (!Object.keys(body).length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_sprint' });
    const { data: s } = await ctx.api.send<Sprint>(
      'PATCH',
      path`/v1/projects/${args.project.toUpperCase()}/sprints/${args.sprint}`,
      { ...scope(args.org), body },
    );
    return { markdown: join(sprintHeading(ctx, s, 'Updated'), await sprintFacts(ctx, s, args.org)) };
  },
});

export const startSprint = defineTool({
  name: 'start_sprint',
  title: 'Start a sprint',
  description:
    'Starts a planned sprint: one active sprint per project. It starts today unless start_date names another day; it keeps its planned end date, or takes end_date. Needs Project Admin and admin:project.',
  input: z.strictObject({
    project: arg.project,
    sprint: arg.sprint,
    start_date: arg.calendarDate.optional(),
    end_date: arg.calendarDate.optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/sprints/{sprint}/start'],
  async run(ctx, args) {
    const { data: s } = await ctx.api.send<Sprint>(
      'POST',
      path`/v1/projects/${args.project.toUpperCase()}/sprints/${args.sprint}/start`,
      {
        ...scope(args.org),
        body: {
          ...(args.start_date ? { start_date: args.start_date } : {}),
          ...(args.end_date ? { end_date: args.end_date } : {}),
        },
      },
    );
    return { markdown: join(sprintHeading(ctx, s, 'Started'), await sprintFacts(ctx, s, args.org)) };
  },
});

export const finishSprint = defineTool({
  name: 'finish_sprint',
  title: 'Finish a sprint',
  description:
    'Finishes the active sprint. Every unresolved issue moves to `move_unfinished_to` - "backlog" or a planned sprint - and the answer lists them. Resolved issues stay with the finished sprint. Needs Project Admin and admin:project.',
  input: z.strictObject({
    project: arg.project,
    sprint: arg.sprint,
    move_unfinished_to: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe('"backlog", or the name of a planned sprint (create_sprint first if there is none).'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/sprints/{sprint}/finish'],
  async run(ctx, args) {
    const { data } = await ctx.api.send<SprintFinishResult>(
      'POST',
      path`/v1/projects/${args.project.toUpperCase()}/sprints/${args.sprint}/finish`,
      { ...scope(args.org), body: { move_unfinished_to: args.move_unfinished_to } },
    );
    const where = data.moved_to ? `sprint ${data.moved_to.name}` : 'the backlog';
    return {
      markdown: join(
        sprintHeading(ctx, data.sprint, 'Finished'),
        await sprintFacts(ctx, data.sprint, args.org),
        data.moved.length
          ? `${data.moved.length} unfinished ${data.moved.length === 1 ? 'issue' : 'issues'} moved to ${where}: ${data.moved.join(', ')}`
          : 'Every issue was resolved; nothing moved.',
      ),
    };
  },
});

export const deleteSprint = defineTool({
  name: 'delete_sprint',
  title: 'Delete a sprint',
  description:
    'Deletes a planned sprint; its issues go back to the backlog. A sprint that has started cannot be deleted. Asks you to confirm before acting.',
  input: z.strictObject({ project: arg.project, sprint: arg.sprint, org: arg.org }),
  kind: 'destructive',
  endpoints: ['GET /v1/projects/{key}/sprints/{sprint}', 'DELETE /v1/projects/{key}/sprints/{sprint}'],
  async describeAction(ctx, args) {
    const { data: s } = await ctx.api.get<Sprint>(
      path`/v1/projects/${args.project.toUpperCase()}/sprints/${args.sprint}`,
      scope(args.org),
    );
    return t('mcp.action.sprint_delete', { name: s.name, project: s.project.key, issues: s.progress.issues });
  },
  async run(ctx, args) {
    const { data: s } = await ctx.api.send<Sprint>(
      'DELETE',
      path`/v1/projects/${args.project.toUpperCase()}/sprints/${args.sprint}`,
      scope(args.org),
    );
    return {
      markdown: `Deleted sprint **${s.name}** from ${s.project.key}; its ${s.progress.issues} issues are in the backlog.`,
    };
  },
});

const anchors = {
  before: arg.issue.optional().describe('Place them just above this issue.'),
  after: arg.issue.optional().describe('Place them just below this issue. Give before or after, not both.'),
};

function sameProject(keys: string[]) {
  const projects = new Set(keys.map(projectKeyOf));
  if (projects.size > 1) {
    throw ToolError.local(
      'mcp.invalid_arguments',
      { tool: 'move_to_sprint' },
      { hints: ['Move issues of one project per call.'] },
    );
  }
  return [...projects][0]!;
}

async function moveIssues(
  ctx: ToolContext,
  args: { issues: string[]; before?: string | undefined; after?: string | undefined; org?: string | undefined },
  sprint: string | null | undefined,
) {
  const keys = args.issues.map(issueKey);
  const project = sameProject(keys);
  const { data } = await ctx.api.send<Issue[]>('POST', path`/v1/projects/${project}/backlog/move`, {
    ...scope(args.org),
    body: {
      issues: keys,
      ...(sprint !== undefined ? { sprint } : {}),
      ...(args.before ? { before: issueKey(args.before) } : {}),
      ...(args.after ? { after: issueKey(args.after) } : {}),
    },
  });
  return data;
}

const placeLine = (args: { before?: string | undefined; after?: string | undefined }) =>
  args.before ? `above ${issueKey(args.before)}` : args.after ? `below ${issueKey(args.after)}` : 'at the bottom';

export const moveToSprint = defineTool({
  name: 'move_to_sprint',
  title: 'Move issues to a sprint',
  description:
    'Puts issues into a sprint, or back into the backlog with sprint: "backlog", at the bottom or before / after an issue already there. A completed sprint takes no new issues.',
  input: z.strictObject({
    issues: z
      .array(arg.issue)
      .min(1)
      .max(BACKLOG_MOVE_MAX_ISSUES)
      .describe('Issue keys, in the order they should land.'),
    sprint: arg.sprint.describe('Sprint by name or slug, or "backlog".'),
    ...anchors,
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/backlog/move'],
  async run(ctx, args) {
    const target = args.sprint.trim().toLowerCase() === BACKLOG ? null : args.sprint;
    const moved = await moveIssues(ctx, args, target);
    const where = moved[0]?.sprint ? `sprint ${moved[0].sprint.name}` : 'the backlog';
    return {
      markdown: join(`Moved ${moved.length} to ${where}, ${placeLine(args)}.`, issueTable(moved, await ctx.timeZone())),
    };
  },
});

export const reorderBacklog = defineTool({
  name: 'reorder_backlog',
  title: 'Reorder the backlog',
  description:
    'Changes the order of issues within the backlog or their sprint: places them, in the order given, just before or after another issue in the same list (or at the bottom). Their sprint does not change.',
  input: z.strictObject({
    issues: z
      .array(arg.issue)
      .min(1)
      .max(BACKLOG_MOVE_MAX_ISSUES)
      .describe('Issue keys, in the order they should end up.'),
    ...anchors,
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/backlog/move'],
  async run(ctx, args) {
    const moved = await moveIssues(ctx, args, undefined);
    return {
      markdown: join(
        `Reordered ${moved.map(i => i.key).join(', ')} ${placeLine(args)}.`,
        issueTable(moved, await ctx.timeZone()),
      ),
    };
  },
});

export const getBacklog = defineTool({
  name: 'get_backlog',
  title: 'Get the backlog',
  description:
    "The planning view: the project's planned and active sprints with their progress, then one list in drag order - the backlog (issues in no sprint) by default, or a sprint's issues with `sprint`. `query` filters the list; the backlog defaults to #Unresolved.",
  input: z.strictObject({
    project: arg.project,
    sprint: arg.sprint.optional().describe('List this sprint instead of the backlog.'),
    query: z
      .string()
      .max(2000)
      .optional()
      .describe('Filter, as in search_issues. Default #Unresolved for the backlog.'),
    org: arg.org,
    limit: arg.limit,
    offset: arg.offset,
  }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}/sprints', 'GET /v1/projects/{key}/backlog'],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const s = scope(args.org);
    const query = args.query ?? (args.sprint ? undefined : '#Unresolved');
    const [sprints, list] = await Promise.all([
      ctx.api.get<Sprint[]>(path`/v1/projects/${key}/sprints`, { ...s, query: { state: 'planned,active' } }),
      ctx.api.get<Issue[]>(path`/v1/projects/${key}/backlog`, {
        ...s,
        query: {
          ...(args.sprint ? { sprint: args.sprint } : {}),
          ...(query ? { q: query } : {}),
          limit: args.limit ?? arg.DEFAULT_LIMIT,
          offset: args.offset ?? 0,
        },
      }),
    ]);
    const total = list.pagination?.total ?? list.data.length;
    const title = args.sprint ? `Sprint ${args.sprint}` : 'Backlog';
    return {
      markdown: join(
        sprints.data.length ? `**Sprints**\n${sprintRows(sprints.data, false)}` : '_No planned or active sprint._',
        `**${title}** — ${total} ${total === 1 ? 'issue' : 'issues'}${query ? ` for ${code(query)}` : ''}, top first`,
        list.data.length
          ? table(
              ['#', 'Key', 'Title', 'Status', 'Priority', 'Points', 'Assignees'],
              list.data.map((i, n) => [
                String((args.offset ?? 0) + n + 1),
                i.key,
                i.title,
                i.status.name,
                i.priority.name,
                i.story_points === null ? '—' : String(i.story_points),
                i.assignees.length ? i.assignees.map(a => `@${a.username}`).join(', ') : '—',
              ]),
            )
          : null,
        more(list.pagination, list.data.length),
      ),
    };
  },
});

const FIELD_LABELS = { status: 'Statuses', priority: 'Priorities', type: 'Types' } as const;

const cardLine = (c: BoardCard) => [
  c.key,
  c.title,
  c.assignees.length ? c.assignees.map(a => `@${a.username}`).join(', ') : '—',
  c.story_points === null ? '—' : String(c.story_points),
  c.subtasks.total ? `${c.subtasks.resolved}/${c.subtasks.total}` : '—',
];

function wip(c: BoardView['columns'][number]) {
  const limits = [c.wip_min !== null ? `min ${c.wip_min}` : null, c.wip_max !== null ? `max ${c.wip_max}` : null]
    .filter(Boolean)
    .join(', ');
  if (!limits) return '—';
  const flag = c.over_wip_max ? ' — over' : c.under_wip_min ? ' — under' : '';
  return `${limits}${flag}`;
}

/** A board as get_board and board:// show it: the columns with counts, then each lane's cards by column. */
export async function renderBoard(
  ctx: ToolContext,
  args: {
    project?: string | undefined;
    board?: string | undefined;
    sprint?: string | undefined;
    query?: string | undefined;
    swimlane_by?: string | undefined;
    swimlane_field?: string | undefined;
    org?: string | undefined;
  },
) {
  const s = scope(args.org);
  let project = args.project?.toUpperCase();
  let board = args.board;
  if (!project) {
    if (!board)
      throw ToolError.local(
        'mcp.invalid_arguments',
        { tool: 'get_board' },
        { hints: ['Give `project`, `board`, or both.'] },
      );
    const { data } = await ctx.api.get<Board>(path`/v1/boards/${board}`, s);
    project = data.project.key;
    board = data.slug;
  }
  if (!board) {
    const { data } = await ctx.api.get<Board[]>(path`/v1/projects/${project}/boards`, s);
    if (!data[0]) return `${project} has no board. create_board makes one.`;
    board = data[0].slug;
  }
  const { data: v } = await ctx.api.get<BoardView>(path`/v1/projects/${project}/boards/${board}/view`, {
    ...s,
    query: {
      ...(args.sprint ? { sprint: args.sprint } : {}),
      ...(args.query ? { q: args.query } : {}),
      ...(args.swimlane_by ? { swimlane_by: args.swimlane_by } : {}),
      ...(args.swimlane_field ? { swimlane_field: args.swimlane_field } : {}),
    },
  });
  const heading = `**${v.board.name}** board (${code(v.board.slug)}) — ${v.board.project.key}\n${ctx.appBaseUrl}/projects/${v.board.project.key}/board/${v.board.slug}/${v.scope === 'open' ? BOARD_OPEN_ISSUES : v.sprint ? v.sprint.slug : BOARD_CURRENT_SPRINT}`;
  if (!v.sprint && v.scope !== 'open') {
    return join(
      heading,
      `${v.board.project.key} has no active sprint. sprint: "${BOARD_OPEN_ISSUES}" shows every unresolved issue on the board; start_sprint starts one; get_backlog shows what is planned.`,
    );
  }
  const sprintLine = !v.sprint
    ? 'All open issues: every unresolved issue in the project, in a sprint or not.'
    : `Sprint **${v.sprint.name}** (${v.sprint.state}) · ${dates(v.sprint)}${v.sprint.days_left !== null ? ` · ${daysLeft(v.sprint.days_left)}` : ''} · ${progressLine(v.sprint)}`;
  const columns = table(
    ['Column', FIELD_LABELS[v.board.column_field], 'Cards', 'WIP'],
    v.columns.map(c => [
      c.name + (c.resolved ? ' (resolved)' : ''),
      c.values.map(v => v.name).join(', '),
      args.query ? `${c.count} of ${c.total}` : String(c.total),
      wip(c),
    ]),
  );
  const shown = v.lanes.filter(l => l.count > 0 || l.issue);
  // A single leftover lane (epic lanes on a board with no epics yet) is just the board.
  const untitled = shown.length === 1 && shown[0]!.kind === 'uncategorized';
  const lanes = shown.map(l => {
    const title =
      l.kind === 'all' || untitled
        ? null
        : l.kind === 'issue' && l.issue
          ? `**${l.issue.key} ${l.issue.title}** (${l.issue.status.name}) — ${l.count}`
          : `**${l.member ? person(l.member) : l.label}** — ${l.count}`;
    const rows = l.cells.flatMap(cell => cell.cards.map(c => [cell.column, ...cardLine(c)]));
    return join(title, rows.length ? table(['Column', 'Key', 'Title', 'Assignees', 'Points', 'Subtasks'], rows) : null);
  });
  return join(
    heading,
    sprintLine,
    args.query ? `Filtered by ${code(args.query)}.` : null,
    columns,
    v.distribution.length ? `Status: ${v.distribution.map(d => `${d.name} ${d.count}`).join(' · ')}` : null,
    v.unmapped.length
      ? `On no column: ${v.unmapped.map(d => `${d.name} ${d.count}`).join(' · ')} — update_board can map them.`
      : null,
    ...lanes,
    v.truncated ? 'Only the first 500 cards are shown; narrow it with `query`.' : null,
  );
}

export const getBoard = defineTool({
  name: 'get_board',
  title: 'Get a board',
  description:
    "A board on a sprint (default the active one), or on every unresolved issue in the project with sprint \"open\": each column's statuses (or priorities or types, by what the board's columns are), card count (filter-aware when `query` is given) and WIP limits, the status breakdown, then the cards by swimlane and column in drag order. Without `board`, the project's first board.",
  input: z.strictObject({
    project: arg.project.optional(),
    board: arg.board.optional(),
    sprint: arg.sprint
      .optional()
      .describe('Default "current", the active sprint. "open" is every unresolved issue, in a sprint or not.'),
    query: z.string().max(2000).optional().describe('Filter the cards, as in search_issues.'),
    swimlane_by: z.enum(BOARD_SWIMLANES).optional().describe("Override the board's swimlanes for this read."),
    swimlane_field: z.enum(BOARD_SWIMLANE_FIELDS).optional(),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/boards/{slug}', 'GET /v1/projects/{key}/boards', 'GET /v1/projects/{key}/boards/{board}/view'],
  async run(ctx, args) {
    return { markdown: await renderBoard(ctx, args) };
  },
});

const columnInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  values: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(50)
    .describe('Names of the column_field values that land in it, e.g. ["In Progress"].'),
  wip_min: z.number().int().min(1).max(999).nullable().optional(),
  wip_max: z.number().int().min(1).max(999).nullable().optional(),
  collapsed_by_default: z.boolean().optional(),
});

const boardFields = {
  column_field: z
    .enum(BOARD_COLUMN_FIELDS)
    .optional()
    .describe(
      'What the columns are: status (default), priority or type. Moving a card sets that field. Changed without columns, one column per value is made.',
    ),
  columns: z
    .array(columnInput)
    .min(1)
    .max(BOARD_COLUMNS_MAX)
    .optional()
    .describe('Every column in order, e.g. [{ name: "Doing", values: ["In Progress"], wip_max: 3 }].'),
  swimlane_by: z
    .enum(BOARD_SWIMLANES)
    .optional()
    .describe(
      'none; values (one lane per swimlane_field value); issues (issues of swimlane_types, e.g. epics, as lanes).',
    ),
  swimlane_field: z.enum(BOARD_SWIMLANE_FIELDS).optional(),
  swimlane_types: z
    .array(z.string().trim().min(1).max(100))
    .max(20)
    .optional()
    .describe('Types whose issues are lanes, e.g. ["Epic"].'),
};

function boardSummary(b: Board) {
  const lanes =
    b.swimlane_by === 'values'
      ? `by ${b.swimlane_field}`
      : b.swimlane_by === 'issues'
        ? `by issues of type ${b.swimlane_types.join(', ')}`
        : 'none';
  return join(
    table(
      ['Column', FIELD_LABELS[b.column_field], 'WIP min', 'WIP max'],
      b.columns.map(c => [
        c.name + (c.resolved ? ' (resolved)' : ''),
        c.values.map(v => v.name).join(', '),
        c.wip_min === null ? '—' : String(c.wip_min),
        c.wip_max === null ? '—' : String(c.wip_max),
      ]),
    ),
    `Columns by ${b.column_field}. Swimlanes: ${lanes}.`,
    b.unmapped_values.length ? `On no column: ${b.unmapped_values.map(v => v.name).join(', ')}.` : null,
  );
}

export const createBoard = defineTool({
  name: 'create_board',
  title: 'Create a board',
  description:
    'Creates a board: columns mapped to statuses, priorities or types (a value sits in one column), optional WIP limits, and swimlanes. Without columns: To do · In progress · Done by status category, or one column per priority or type. Needs Project Admin and admin:project.',
  input: z.strictObject({
    project: arg.project,
    name: z.string().trim().min(1).max(100),
    ...boardFields,
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/boards'],
  async run(ctx, args) {
    const { project, org, ...body } = args;
    const { data: b } = await ctx.api.send<Board>('POST', path`/v1/projects/${project.toUpperCase()}/boards`, {
      ...scope(org),
      body,
    });
    return { markdown: join(`Created board **${b.name}** (${code(b.slug)}) in ${b.project.key}.`, boardSummary(b)) };
  },
});

export const updateBoard = defineTool({
  name: 'update_board',
  title: 'Change a board',
  description:
    'Renames a board, changes what its columns are (status, priority or type), replaces its columns (the whole list, in order: value mapping, WIP limits, collapsed) or changes its swimlanes. Needs Project Admin and admin:project.',
  input: z.strictObject({
    project: arg.project,
    board: arg.board,
    name: z.string().trim().min(1).max(100).optional(),
    ...boardFields,
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/projects/{key}/boards/{board}'],
  async run(ctx, args) {
    const { project, board, org, ...body } = args;
    if (!Object.keys(body).length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_board' });
    const { data: b } = await ctx.api.send<Board>(
      'PATCH',
      path`/v1/projects/${project.toUpperCase()}/boards/${board}`,
      { ...scope(org), body },
    );
    return { markdown: join(`Updated board **${b.name}** (${code(b.slug)}).`, boardSummary(b)) };
  },
});

export const deleteBoard = defineTool({
  name: 'delete_board',
  title: 'Delete a board',
  description: 'Deletes a board. Issues and sprints are untouched. Asks you to confirm before acting.',
  input: z.strictObject({ project: arg.project, board: arg.board, org: arg.org }),
  kind: 'destructive',
  endpoints: ['GET /v1/projects/{key}/boards/{board}', 'DELETE /v1/projects/{key}/boards/{board}'],
  async describeAction(ctx, args) {
    const { data: b } = await ctx.api.get<Board>(
      path`/v1/projects/${args.project.toUpperCase()}/boards/${args.board}`,
      scope(args.org),
    );
    return t('mcp.action.board_delete', { name: b.name, project: b.project.key });
  },
  async run(ctx, args) {
    const { data: b } = await ctx.api.send<Board>(
      'DELETE',
      path`/v1/projects/${args.project.toUpperCase()}/boards/${args.board}`,
      scope(args.org),
    );
    return { markdown: `Deleted board **${b.name}** from ${b.project.key}.` };
  },
});

/** The sprints and boards lines of describe_project_schema and project://. */
export async function agileMap(ctx: ToolContext, key: string, org: string | undefined) {
  const s = scope(org);
  const [sprints, boards] = await Promise.all([
    ctx.api.get<Sprint[]>(path`/v1/projects/${key}/sprints`, { ...s, query: { state: 'planned,active' } }),
    ctx.api.get<Board[]>(path`/v1/projects/${key}/boards`, s),
  ]);
  return join(
    sprints.data.length
      ? `**Sprints** (planned and active): ${sprints.data.map(sp => `${sp.name} — ${sp.state}, ${dates(sp)}`).join('; ')}. The backlog is "backlog".`
      : '**Sprints**: none planned or active. create_sprint plans one.',
    boards.data.length
      ? `**Boards**: ${boards.data.map(b => `${b.name} (${code(b.slug)}: ${b.columns.map(c => c.name).join(' · ')})`).join('; ')}`
      : '**Boards**: none.',
  );
}

/** The active sprint line of get_project and project://. */
export async function activeSprintLine(ctx: ToolContext, key: string, org: string | undefined) {
  const { data } = await ctx.api.get<Sprint[]>(path`/v1/projects/${key}/sprints`, {
    ...scope(org),
    query: { state: 'active' },
  });
  const sp = data[0];
  if (!sp) return 'Active sprint: none.';
  return `Active sprint: **${sp.name}** · ${dates(sp)}${sp.days_left !== null ? ` · ${daysLeft(sp.days_left)}` : ''} · ${progressLine(sp)}`;
}
