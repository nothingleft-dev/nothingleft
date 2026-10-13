import {
  ISSUE_CSV_COLUMNS,
  ISSUE_REF_PICKER_LIMIT,
  ISSUE_RESTORE_WINDOW_DAYS,
  type BulkUpdateIssues,
  type BulkUpdateResult,
  type CreateIssue,
  type Issue,
  type IssueActivity,
  type IssueActivityKind,
  type IssueCsvColumn,
  type IssueCsvColumnInput,
  type IssueCustomFieldValue,
  type CustomFieldOptionRef,
  CUSTOM_GROUP_PREFIX,
  type IssueGroup,
  type IssueGroupBy,
  type IssueLinkSnapshot,
  type IssueListItem,
  type IssueRef,
  type IssueWatcher,
  type MemberRef,
  type LabelColor,
  type Pagination,
  type Principal,
  viaOf,
  type StatusCategory,
  type SprintRef,
  type SprintState,
  type ToggleTask,
  type UpdateIssue,
  type WatcherSource,
} from '@nothingleft/types';
import {
  systemContext,
  type AttachmentsRepository,
  type CommentsRepository,
  type CustomFieldsRepository,
  type IssueFieldValueRow,
  type IssueActivityRepository,
  type IssuePerson,
  type IssueSearchRepository,
  type IssueRow,
  type IssuesRepository,
  type IssueTypeRow,
  type OrganizationsRepository,
  type PriorityRow,
  type ProjectSchemaRepository,
  type ProjectRow,
  type ProjectsRepository,
  type SprintRow,
  type SprintsRepository,
  type TagsRepository,
  type TenantContext,
  type WorkflowStatusRow,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { formatDuration, formatIssueKey, parseDuration, parseIssueKey } from '@nothingleft/format';
import { checkMarkdownSize, extractReferences, toggleTaskItem } from '@nothingleft/markdown';
import { ISSUE_EXPORT_MAX_ROWS, ISSUE_EXPORT_PAGE_SIZE } from '@config/constants';
import { csvLine } from '@lib/csv';
import { AppError } from '@lib/errors';
import { denial, type AccessService, type OrgAccess, type ProjectAccess } from '@services/access';
import { commentDto } from '@services/comment-dto';
import { checkParent, recordParentChange, refreshSpentRollup } from '@services/issue-hierarchy';
import {
  keyer,
  linkNamed,
  readableProjects,
  resolveTargets,
  writeLinks,
  type LinkName,
} from '@services/issue-link-writer';
import { claimDrafts } from '@services/attachment-writer';
import type { ObjectStores } from '@services/object-stores';
import { purgeDeleted } from '@services/deleted-purge';
import { applyTags, wantedTags, type WantedTag } from '@services/issue-tag-writer';
import {
  appliesTo,
  checkApplicable,
  completeRequired,
  findField,
  HISTORY_PREFIX,
  issueCustomFields,
  loadCatalogue,
  planInput,
  userIdsIn,
  writePlanned,
  type FieldCatalogue,
  type ValueContext,
} from '@services/custom-field-values';
import { recordFieldChanges, recordIssueEvent, type FieldChange } from '@services/issue-history';
import { placeIssues } from '@services/sprint-placement';
import { can, type Capability } from '@services/permissions';
import { isResolvedCategory } from '@services/project-schema.service';
import type { SearchService } from '@services/search.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface IssuesDeps {
  access: AccessService;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  schema: ProjectSchemaRepository;
  issues: IssuesRepository;
  issueActivity: IssueActivityRepository;
  issueSearch: IssueSearchRepository;
  comments: CommentsRepository;
  tags: TagsRepository;
  search: SearchService;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  stores: ObjectStores;
  attachments: AttachmentsRepository;
  sprints: SprintsRepository;
  customFields: CustomFieldsRepository;
  /** Injected so coalescing can be tested across its window without waiting. */
  now?: () => Date;
}

export interface IssueListQuery {
  project?: string | undefined;
  q?: string | undefined;
  group_by?: IssueGroupBy | undefined;
  group_limit?: number | undefined;
  sort?: string | undefined;
  deleted: boolean;
  limit: number;
  offset: number;
}

export interface IssueExportQuery {
  project?: string | undefined;
  q?: string | undefined;
  sort?: string | undefined;
  columns?: IssueCsvColumnInput[] | undefined;
}

const page = (query: { limit: number; offset: number }, count: number, total: number): Pagination => ({
  total,
  limit: query.limit,
  offset: query.offset,
  next_cursor: null,
  has_more: query.offset + count < total,
});

export interface ActivityPageQuery {
  cursor?: string | undefined;
  limit: number;
  kinds?: IssueActivityKind[] | undefined;
}

export interface IssueRefQuery {
  keys?: string[] | undefined;
  q?: string | undefined;
  project?: string | undefined;
  limit?: number | undefined;
}

export interface Located {
  project: ProjectAccess;
  issue: IssueRow;
}

interface ProjectValues {
  statuses: WorkflowStatusRow[];
  priorities: PriorityRow[];
  types: IssueTypeRow[];
}

/** Input resolved to rows and ids; `undefined` still means "not supplied". */
interface Resolved {
  title?: string | undefined;
  description_md?: string | null | undefined;
  status?: WorkflowStatusRow | undefined;
  priority?: PriorityRow | undefined;
  type?: IssueTypeRow | undefined;
  assignees?: { id: number; username: string }[] | undefined;
  estimate_minutes?: number | null | undefined;
  start_date?: string | null | undefined;
  due_date?: string | null | undefined;
  parent?: IssueRow | null | undefined;
  story_points?: number | null | undefined;
  sprint?: SprintRow | null | undefined;
}

/** Lookups shared by many creates in one project: an import checks thousands of rows against the same lists. */
export interface CreateMemo {
  readonly cache: Map<string, Promise<unknown>>;
}

export const createMemo = (): CreateMemo => ({ cache: new Map() });

function remember<T>(memo: CreateMemo | undefined, key: string, load: () => Promise<T>): Promise<T> {
  if (!memo) return load();
  let hit = memo.cache.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = load();
    // A refusal is cached too, and rethrown to every row that asks again; nobody awaits the original.
    hit.catch(() => undefined);
    memo.cache.set(key, hit);
  }
  return hit;
}

/** A create checked against everything that can be checked before the transaction. */
export interface PlannedCreate {
  input: CreateIssue;
  resolved: Resolved;
  status: WorkflowStatusRow;
  priority: PriorityRow;
  type: IssueTypeRow;
  assignees: { id: number; username: string }[];
  wanted: Map<string, WantedTag> | undefined;
  links: { plan: { link: LinkName; targets: IssueRow[] }[]; keyOf: ReturnType<typeof keyer> } | undefined;
  catalogue: FieldCatalogue;
  custom: { plan: Awaited<ReturnType<typeof planInput>>; redirected: boolean };
}

const DAY_MS = 86_400_000;
const sprintRef = (sprint: SprintRow | undefined): SprintRef | null =>
  sprint ? { name: sprint.name, slug: sprint.slug, state: sprint.state as SprintState } : null;
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const byUsername = (a: string, b: string) => a.localeCompare(b);

const LINK_KINDS = new Set<string>(['linked', 'unlinked']);

// Redacted rather than dropped, so the history's count and paging read the same for every reader.
function redactLink(value: unknown, readable: ReadonlyMap<string, ProjectRow>): unknown {
  if (value === null || typeof value !== 'object') return value;
  const side = value as IssueLinkSnapshot;
  const parsed = typeof side.issue === 'string' ? parseIssueKey(side.issue) : null;
  if (parsed && readable.has(parsed.projectKey)) return value;
  return { link: side.link, issue: null } satisfies IssueLinkSnapshot;
}

// The snapshots that name people by username: an assignee set, a work item's author.
function usernamesIn(
  row: { kind: string; field: string | null; old_value: unknown; new_value: unknown },
  personFields: ReadonlySet<string>,
): string[] {
  const sides = [row.old_value, row.new_value];
  if (row.kind === 'field_changed' && (row.field === 'assignees' || personFields.has(row.field ?? ''))) {
    return [
      ...new Set(
        sides.flatMap(v =>
          Array.isArray(v) ? v.filter(u => typeof u === 'string') : typeof v === 'string' ? [v] : [],
        ),
      ),
    ];
  }
  if (row.kind === 'time_logged') {
    return [
      ...new Set(
        sides.flatMap(v => {
          const author = (v as { author?: unknown } | null)?.author;
          return typeof author === 'string' ? [author] : [];
        }),
      ),
    ];
  }
  return [];
}

export const encodeCursor = (afterId: number) => Buffer.from(JSON.stringify({ after: afterId })).toString('base64url');

export function decodeCursor(cursor: string): number {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { after?: unknown };
    if (typeof parsed.after === 'number' && Number.isInteger(parsed.after) && parsed.after > 0) return parsed.after;
  } catch {
    // fall through to the catalogue error
  }
  throw new AppError('activity.invalid_cursor', 400, {}, 'cursor');
}

export function issuesService(deps: IssuesDeps) {
  const {
    access,
    organizations,
    projects,
    schema,
    issues,
    issueActivity,
    issueSearch,
    comments,
    tags,
    search,
    inTransaction,
    analytics,
  } = deps;
  const now = deps.now ?? (() => new Date());

  const notFound = (key: string) => new AppError('issue.not_found', 404, { key }, 'key');

  const memberRef = (person: IssuePerson | undefined): MemberRef =>
    person
      ? access.memberRef(person.user, person.membership)
      : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false };

  /** Anything the caller cannot read is absent - permissions.md rule 4. */
  async function locate(
    principal: Principal,
    key: string,
    hints: OrgHints,
    options: { includeDeleted?: boolean } = {},
  ): Promise<Located> {
    const parsed = parseIssueKey(key);
    if (!parsed) throw notFound(key);
    let project: ProjectAccess;
    try {
      project = await access.project(principal, parsed.projectKey, hints);
    } catch (err) {
      if (err instanceof AppError && err.code === 'project.not_found') throw notFound(key);
      throw err;
    }
    if (!can(principal, 'issue.read', project.scope)) throw notFound(key);
    const issue = await issues.findByNumber(project.ctx, project.project.id, parsed.number, options);
    if (!issue) throw notFound(key);
    return { project, issue };
  }

  function requireWritable(principal: Principal, project: ProjectAccess, capability: Capability) {
    access.require(principal, capability, project.scope);
    if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
  }

  async function valuesOf(project: ProjectAccess, memo?: CreateMemo): Promise<ProjectValues> {
    return remember(memo, 'values', () => loadValues(project));
  }

  async function loadValues(project: ProjectAccess): Promise<ProjectValues> {
    const [statuses, priorities, types] = await Promise.all([
      schema.list(project.ctx, 'statuses', project.project.id),
      schema.list(project.ctx, 'priorities', project.project.id),
      schema.list(project.ctx, 'types', project.project.id),
    ]);
    return { statuses, priorities, types };
  }

  /** Rows from any readable projects of one organisation → DTOs, in the order given. */
  async function hydrateMany(
    principal: Principal,
    ctx: TenantContext,
    rows: IssueRow[],
    projectsById: ReadonlyMap<number, Pick<ProjectRow, 'key' | 'name'>>,
  ): Promise<Issue[]> {
    const unique = [...new Map(rows.map(r => [r.id, r])).values()];
    const ids = unique.map(r => r.id);
    const projectIds = [...new Set(unique.map(r => r.project_id))];
    const sprintIds = [...new Set(unique.flatMap(r => (r.sprint_id === null ? [] : [r.sprint_id])))];
    const [
      statuses,
      priorities,
      types,
      assignees,
      people,
      signals,
      watchers,
      parents,
      tagRows,
      files,
      sprintRows,
      subtasks,
      rollups,
      catalogue,
      fieldValues,
    ] = await Promise.all([
      schema.listForProjects(ctx, 'statuses', projectIds),
      schema.listForProjects(ctx, 'priorities', projectIds),
      schema.listForProjects(ctx, 'types', projectIds),
      issues.listAssignees(ctx, ids),
      issues.findPeople(
        ctx,
        unique.flatMap(r => [r.created_by, r.updated_by]),
      ),
      issues.signalsFor(ctx, ids, principal.userId),
      issues.watcherCounts(ctx, ids),
      issues.keyNumbers(
        ctx,
        unique.flatMap(r => (r.parent_id === null ? [] : [r.parent_id])),
      ),
      tags.listForIssues(ctx, ids),
      deps.attachments.readyCounts(ctx, ids),
      deps.sprints.findByIds(ctx, sprintIds),
      issues.subtaskProgress(ctx, ids),
      issues.storyPointsRollup(ctx, ids),
      loadCatalogue(deps.customFields, ctx, projectIds),
      deps.customFields.listValues(ctx, ids),
    ]);
    const valuePeople = await issues.findPeople(ctx, userIdsIn(fieldValues));
    const person = new Map([...people, ...valuePeople].map(p => [p.user.id, p]));
    const refs = new Map([...person].map(([id, p]) => [id, memberRef(p)]));
    const sprintById = new Map(sprintRows.map(sp => [sp.id, sp]));

    return rows.map(row => {
      const { key, name } = projectsById.get(row.project_id)!;
      const status = statuses.find(s => s.id === row.status_id)!;
      const priority = priorities.find(p => p.id === row.priority_id)!;
      const type = types.find(t => t.id === row.type_id)!;
      const parentNumber = row.parent_id === null ? undefined : parents.get(row.parent_id);
      return {
        key: formatIssueKey(key, row.key_number),
        project: { key, name },
        title: row.title,
        description_md: row.description_md,
        status: {
          name: status.name,
          category: status.category as StatusCategory,
          color: status.color as LabelColor,
          short_label: status.short_label,
        },
        priority: { name: priority.name, color: priority.color as LabelColor, short_label: priority.short_label },
        type: { name: type.name, icon: type.icon, color: type.color as LabelColor, short_label: type.short_label },
        assignees: assignees.filter(a => a.issue_id === row.id).map(memberRef),
        created_by: memberRef(person.get(row.created_by)),
        updated_by: memberRef(person.get(row.updated_by)),
        parent: parentNumber === undefined ? null : formatIssueKey(key, parentNumber),
        tags: tagRows
          .filter(t => t.issue_id === row.id)
          .map(({ tag }) => ({ name: tag.name, slug: tag.slug, color: tag.color as LabelColor })),
        estimate_minutes: effectiveEstimate(catalogue, row, fieldValues),
        spent_minutes: row.spent_minutes,
        story_points: row.story_points,
        story_points_rollup: rollups.get(row.id) ?? null,
        sprint: sprintRef(row.sprint_id === null ? undefined : sprintById.get(row.sprint_id)),
        subtasks: subtasks.get(row.id) ?? { resolved: 0, total: 0 },
        start_date: row.start_date,
        due_date: row.due_date,
        resolved_at: row.resolved_at?.toISOString() ?? null,
        vote_count: row.vote_count,
        comment_count: row.comment_count,
        watcher_count: watchers.get(row.id) ?? 0,
        attachment_count: files.get(row.id) ?? 0,
        custom_fields: issueCustomFields(
          catalogue,
          row,
          fieldValues.filter(v => v.issue_id === row.id),
          refs,
        ),
        me: signals.get(row.id) ?? { starred: false, voted: false, watching: false },
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        deleted_at: row.deleted_at?.toISOString() ?? null,
        restorable_until: row.deleted_at
          ? new Date(row.deleted_at.getTime() + ISSUE_RESTORE_WINDOW_DAYS * DAY_MS).toISOString()
          : null,
      };
    });
  }

  function effectiveEstimate(cat: FieldCatalogue, row: IssueRow, values: readonly IssueFieldValueRow[]): number | null {
    const fieldId = cat.roles.get(row.project_id)?.estimation ?? null;
    if (fieldId === null) return row.estimate_minutes;
    const value = values.find(v => v.issue_id === row.id && v.field_id === fieldId)?.value_number;
    return value === undefined || value === null ? null : value;
  }

  const valueContext = (project: ProjectAccess): ValueContext => ({
    ctx: project.ctx,
    projectId: project.project.id,
    projectKey: project.project.key,
    calendar: {
      workdayMinutes: project.organization.workday_minutes,
      workweekDays: project.organization.workweek_days,
    },
  });
  const valueDeps = { organizations, projects };

  /**
   * `custom_fields` of a request, with `estimate` redirected to the project's Estimation field
   * when it has one, resolved against the type the issue will have.
   */
  async function planCustomFields(
    project: ProjectAccess,
    cat: FieldCatalogue,
    input: CreateIssue | UpdateIssue,
    type: { id: number; name: string },
    current: readonly IssueFieldValueRow[],
  ) {
    const estimationId = cat.roles.get(project.project.id)?.estimation ?? null;
    const custom = { ...(input.custom_fields ?? {}) };
    const estimationField = estimationId === null ? undefined : cat.fields.find(f => f.id === estimationId);
    const redirected = estimationField !== undefined && input.estimate !== undefined;
    if (redirected) {
      const named = Object.keys(custom).some(k => findField([estimationField], k));
      if (!named) custom[estimationField.slug] = input.estimate ?? null;
    }
    const vc = valueContext(project);
    const plan = await planInput(valueDeps, vc, cat, Object.keys(custom).length ? custom : undefined, current);
    checkApplicable(cat, plan, type.id, type.name);
    return { plan, vc, redirected };
  }

  const hydrate = (principal: Principal, project: ProjectAccess, rows: IssueRow[]) =>
    hydrateMany(principal, project.ctx, rows, new Map([[project.project.id, project.project]]));

  const one = async (principal: Principal, project: ProjectAccess, row: IssueRow) =>
    (await hydrate(principal, project, [row]))[0]!;

  /** Chips for linked and referenced issues, in the order given; the caller has checked they are readable. */
  async function refsOf(
    principal: Principal,
    ctx: TenantContext,
    rows: IssueRow[],
    projectsById: ReadonlyMap<number, Pick<ProjectRow, 'key'>>,
  ): Promise<IssueRef[]> {
    if (rows.length === 0) return [];
    const projectIds = [...new Set(rows.map(r => r.project_id))];
    const [statuses, types, signals] = await Promise.all([
      schema.listForProjects(ctx, 'statuses', projectIds),
      schema.listForProjects(ctx, 'types', projectIds),
      issues.signalsFor(
        ctx,
        rows.map(r => r.id),
        principal.userId,
      ),
    ]);
    return rows.map(row => {
      const status = statuses.find(s => s.id === row.status_id)!;
      const type = types.find(t => t.id === row.type_id)!;
      return {
        key: formatIssueKey(projectsById.get(row.project_id)!.key, row.key_number),
        title: row.title,
        resolved: row.resolved_at !== null,
        status: {
          name: status.name,
          category: status.category as StatusCategory,
          color: status.color as LabelColor,
          short_label: status.short_label,
        },
        type: { name: type.name, icon: type.icon, color: type.color as LabelColor, short_label: type.short_label },
        starred: signals.get(row.id)?.starred ?? false,
      };
    });
  }

  function pick<T extends { id: number; name: string }>(
    rows: T[],
    name: string,
    code: 'issue.unknown_status' | 'issue.unknown_priority' | 'issue.unknown_type',
    field: 'status' | 'priority' | 'type',
    project: ProjectAccess,
    currentId?: number,
  ): T {
    // An archived status stays on the issues that have it but cannot be newly chosen.
    const choosable = rows.filter(r => r.id === currentId || !('is_archived' in r && r.is_archived));
    const row = choosable.find(r => sameName(r.name, name));
    if (!row) {
      throw new AppError(
        code,
        400,
        { [field]: name, project: project.project.key },
        field,
        choosable.map(r => r.name),
      );
    }
    return row;
  }

  /** Assignable and addable as a watcher: someone who can open the issue. */
  async function eligiblePeople(
    project: ProjectAccess,
    usernames: string[],
    code: 'issue.unknown_assignee' | 'issue.watcher_not_in_project',
    field: string,
  ): Promise<{ id: number; username: string }[]> {
    const wanted = usernames.map(u => u.replace(/^@/, ''));
    const found = await organizations.findMembersByUsernames(project.ctx, wanted);
    const assignable = new Set(
      (await projects.listAssignable(project.ctx, project.project.id, { userIds: found.map(f => f.user.id) })).map(
        r => r.user.id,
      ),
    );
    const out = new Map<number, string>();
    for (const name of wanted) {
      const m = found.find(f => sameName(f.membership.username, name));
      if (!m || !assignable.has(m.user.id)) {
        throw new AppError(code, 400, { username: `@${name}`, project: project.project.key }, field);
      }
      out.set(m.user.id, m.membership.username);
    }
    return [...out].map(([id, username]) => ({ id, username }));
  }

  function parseEstimate(project: ProjectAccess, value: number | string | null): number | null {
    if (value === null || typeof value === 'number') return value;
    const minutes = parseDuration(value, {
      workdayMinutes: project.organization.workday_minutes,
      workweekDays: project.organization.workweek_days,
    });
    if (minutes === null) throw new AppError('issue.invalid_duration', 400, { value }, 'estimate');
    return minutes;
  }

  function checkDescription(description: string | null | undefined) {
    if (!description) return;
    const size = checkMarkdownSize(description);
    if (size.level === 'too_large') {
      throw new AppError('issue.description_too_large', 400, { size: Math.ceil(size.bytes / 1024) }, 'description_md');
    }
  }

  function checkDates(start: string | null, due: string | null) {
    if (start && due && start > due) throw new AppError('issue.dates_out_of_order', 400, {}, 'start_date');
  }

  const keyIn = (project: ProjectAccess) => (row: Pick<IssueRow, 'key_number'>) =>
    formatIssueKey(project.project.key, row.key_number);

  async function parentOf(project: ProjectAccess, key: string | null): Promise<IssueRow | null> {
    if (key === null) return null;
    const parsed = parseIssueKey(key);
    if (!parsed) throw new AppError('issue.parent_not_found', 400, { key }, 'parent');
    if (parsed.projectKey.toUpperCase() !== project.project.key.toUpperCase()) {
      throw new AppError('issue.parent_other_project', 400, { parent: key }, 'parent');
    }
    const row = await issues.findByNumber(project.ctx, project.project.id, parsed.number);
    if (!row) throw new AppError('issue.parent_not_found', 400, { key }, 'parent');
    return row;
  }

  /** A sprint an issue may join: any of the project's, by name or slug, except a completed one. */
  async function sprintOf(
    project: ProjectAccess,
    value: string | null,
    currentId?: number | null,
  ): Promise<SprintRow | null> {
    if (value === null) return null;
    const row = await deps.sprints.find(project.ctx, project.project.id, value);
    if (!row) {
      const open = await deps.sprints.list(project.ctx, [project.project.id], ['planned', 'active']);
      throw new AppError(
        'issue.unknown_sprint',
        400,
        { sprint: value, project: project.project.key },
        'sprint',
        open.map(sp => sp.name),
      );
    }
    if (row.state === 'completed' && row.id !== currentId) {
      throw new AppError('sprint.completed', 409, { name: row.name }, 'sprint');
    }
    return row;
  }

  /** Links named at creation, resolved before the transaction; the issue itself does not exist yet. */
  async function planLinks(principal: Principal, project: ProjectAccess, input: CreateIssue) {
    if (!input.links?.length) return undefined;
    const projects = readableProjects(await search.readableProjects(principal, project));
    const plan: { link: LinkName; targets: IssueRow[] }[] = [];
    let parents = input.parent ? 1 : 0;
    for (const group of input.links) {
      const link = linkNamed(group.link, 'links');
      access.require(principal, link.type === 'subtask' ? 'issue.parent_set' : 'issue.link', project.scope);
      const targets = await resolveTargets(issues, project.ctx, projects, link, group.issues, 'links');
      if (link.type === 'subtask' && link.direction === 'inward') parents += targets.length;
      plan.push({ link, targets });
    }
    if (parents > 1) throw new AppError('link.parent_conflict', 400, {}, 'links');
    return { plan, keyOf: keyer(projects.byId) };
  }

  /** The source with one checkbox set, read under the row lock so a concurrent edit is never lost. */
  function toggledTask(markdown: string, task: ToggleTask): string {
    const next = toggleTaskItem(markdown, task.index, task.checked);
    if (next === markdown && toggleTaskItem(markdown, task.index, !task.checked) === markdown) {
      throw new AppError('issue.no_task', 400, { index: task.index }, 'index');
    }
    return next;
  }

  async function resolve(
    project: ProjectAccess,
    input: CreateIssue | UpdateIssue,
    current?: IssueRow,
    memo?: CreateMemo,
  ): Promise<Resolved> {
    checkDescription(input.description_md);
    const needsValues = input.status !== undefined || input.priority !== undefined || input.type !== undefined;
    const values = needsValues ? await valuesOf(project, memo) : undefined;
    return {
      title: input.title,
      description_md: input.description_md,
      status:
        input.status === undefined
          ? undefined
          : pick(values!.statuses, input.status, 'issue.unknown_status', 'status', project, current?.status_id),
      priority:
        input.priority === undefined
          ? undefined
          : pick(values!.priorities, input.priority, 'issue.unknown_priority', 'priority', project),
      type:
        input.type === undefined ? undefined : pick(values!.types, input.type, 'issue.unknown_type', 'type', project),
      assignees:
        input.assignees === undefined
          ? undefined
          : await remember(memo, `people:${[...input.assignees].sort().join(' ')}`, () =>
              eligiblePeople(project, input.assignees!, 'issue.unknown_assignee', 'assignees'),
            ),
      estimate_minutes: input.estimate === undefined ? undefined : parseEstimate(project, input.estimate),
      start_date: input.start_date,
      due_date: input.due_date,
      parent:
        input.parent === undefined
          ? undefined
          : await remember(memo, `parent:${input.parent}`, () => parentOf(project, input.parent!)),
      story_points: input.story_points,
      sprint:
        input.sprint === undefined
          ? undefined
          : await remember(memo, `sprint:${input.sprint}`, () => sprintOf(project, input.sprint!, current?.sprint_id)),
    };
  }

  async function writeMentions(repos: TenantRepos, project: ProjectAccess, issueId: number, markdown: string | null) {
    const usernames = markdown ? extractReferences(markdown).mentions : [];
    const found = await repos.organizations.findMembersByUsernames(project.ctx, usernames);
    await repos.issues.replaceMentions(
      project.ctx,
      { type: 'issue', id: issueId, issueId },
      found.map(f => f.user.id),
    );
  }

  async function recordEvent(
    repos: TenantRepos,
    project: ProjectAccess,
    issueId: number,
    actorId: number,
    kind: Exclude<IssueActivityKind, 'field_changed'>,
  ) {
    await recordIssueEvent(
      repos.issueActivity,
      { ctx: project.ctx, issueId, actorId, changeGroupId: Bun.randomUUIDv7(), at: now() },
      kind,
    );
  }

  async function signal(
    principal: Principal,
    key: string,
    hints: OrgHints,
    act: (repos: TenantRepos, located: Located) => Promise<void>,
  ): Promise<Issue> {
    const located = await locate(principal, key, hints);
    access.require(principal, 'issue.personal_signal', located.project.scope);
    await inTransaction(repos => act(repos, located));
    const fresh = await issues.findByNumber(located.project.ctx, located.project.project.id, located.issue.key_number);
    return one(principal, located.project, fresh!);
  }

  const watcherDto = (w: IssuePerson & { source: string }): IssueWatcher => ({
    ...memberRef(w),
    source: w.source as WatcherSource,
  });

  /** Every check a create makes before its transaction. Nothing is written. */
  async function planCreate(
    principal: Principal,
    project: ProjectAccess,
    input: CreateIssue,
    memo?: CreateMemo,
  ): Promise<PlannedCreate> {
    requireWritable(principal, project, 'issue.create');
    if (input.assignees?.length) access.require(principal, 'issue.assign', project.scope);
    if (input.parent) access.require(principal, 'issue.parent_set', project.scope);
    if (input.attachment_ids?.length) access.require(principal, 'attachment.upload', project.scope);
    const resolved = await resolve(project, input, undefined, memo);
    const values = await valuesOf(project, memo);
    const status = resolved.status ?? values.statuses.find(s => s.is_default)!;
    const priority = resolved.priority ?? values.priorities.find(p => p.is_default)!;
    const type = resolved.type ?? values.types.find(t => t.is_default)!;
    checkDates(resolved.start_date ?? null, resolved.due_date ?? null);
    const assignees = resolved.assignees ?? [];
    const wanted = input.tags?.length ? wantedTags(input.tags, undefined, 'tags') : undefined;
    if (wanted) access.require(principal, 'tag.apply', project.scope);
    const links = await planLinks(principal, project, input);
    const catalogue = await remember(memo, 'catalogue', () =>
      loadCatalogue(deps.customFields, project.ctx, [project.project.id]),
    );
    const custom = await planCustomFields(project, catalogue, input, type, []);
    await completeRequired(valueDeps, custom.vc, catalogue, custom.plan, {
      typeId: type.id,
      currentValues: [],
      candidates: () => true,
    });
    return {
      input,
      resolved,
      status,
      priority,
      type,
      assignees,
      wanted,
      links,
      catalogue,
      custom: { plan: custom.plan, redirected: custom.redirected },
    };
  }

  /**
   * Writes a planned create in one transaction. `watch: false` leaves the creator off the
   * watchers (an import does not subscribe its importer to every row); `also` joins the
   * transaction, so a job's progress commits with the issue it counts.
   */
  async function insertPlanned(
    principal: Principal,
    project: ProjectAccess,
    planned: PlannedCreate,
    options: { watch: boolean; also?: (repos: TenantRepos) => Promise<void> },
  ): Promise<IssueRow> {
    const { input, resolved, status, priority, type, assignees, wanted, links, catalogue, custom } = planned;
    const at = now();

    return inTransaction(async repos => {
      const keyNumber = await repos.projects.claimIssueNumber(project.ctx, project.project.id);
      const issue = await repos.issues.insert(project.ctx, {
        project_id: project.project.id,
        key_number: keyNumber,
        title: resolved.title!,
        description_md: resolved.description_md ?? null,
        status_id: status.id,
        priority_id: priority.id,
        type_id: type.id,
        created_by: principal.userId,
        updated_by: principal.userId,
        estimate_minutes: custom.redirected ? null : (resolved.estimate_minutes ?? null),
        story_points: resolved.story_points ?? null,
        // Unranked sorts last in its container, which is where a new issue belongs.
        sprint_id: resolved.sprint?.id ?? null,
        start_date: resolved.start_date ?? null,
        due_date: resolved.due_date ?? null,
        resolved_at: isResolvedCategory(status.category) ? at : null,
        parent_id: resolved.parent?.id ?? null,
        created_at: at,
        updated_at: at,
      });
      if (resolved.parent) {
        await checkParent(repos, { ctx: project.ctx, child: issue, parent: resolved.parent, keyOf: keyIn(project) });
        await recordIssueEvent(
          repos.issueActivity,
          {
            ctx: project.ctx,
            issueId: resolved.parent.id,
            actorId: principal.userId,
            changeGroupId: Bun.randomUUIDv7(),
            at,
          },
          'linked',
          { new_value: { link: 'parent for', issue: keyIn(project)(issue) } satisfies IssueLinkSnapshot },
        );
      }
      await repos.issues.addAssignees(
        project.ctx,
        issue.id,
        assignees.map(a => a.id),
      );
      const watchers = [...(options.watch ? [principal.userId] : []), ...assignees.map(a => a.id)];
      await repos.issues.watch(project.ctx, issue.id, watchers, 'auto');
      await writePlanned(
        repos.customFields,
        { ctx: project.ctx, projectId: project.project.id, issueId: issue.id, at },
        catalogue,
        custom.plan,
        [],
        new Map(),
      );
      await writeMentions(repos, project, issue.id, issue.description_md);
      const created = {
        ctx: project.ctx,
        issueId: issue.id,
        actorId: principal.userId,
        changeGroupId: Bun.randomUUIDv7(),
        at,
      };
      await recordIssueEvent(repos.issueActivity, created, 'created');
      await claimDrafts(repos, { change: created, key: keyIn(project)(issue) }, input.attachment_ids);
      if (wanted) {
        const onCreate = () => access.require(principal, 'tag.create', project.scope);
        await applyTags(
          repos,
          { ctx: project.ctx, issueId: issue.id, actorId: principal.userId, at, onCreate },
          wanted,
        );
      }
      for (const { link, targets } of links?.plan ?? []) {
        const w = { ctx: project.ctx, actorId: principal.userId, keyOf: links!.keyOf, at, field: 'links' };
        await writeLinks(repos, w, link, issue, targets);
      }
      await options.also?.(repos);
      // A `subtask of` link moved parent_id after the insert.
      return (await repos.issues.findById(project.ctx, issue.id))!;
    });
  }

  return {
    async list(
      principal: Principal,
      query: IssueListQuery,
      hints: OrgHints = {},
    ): Promise<{ data: IssueListItem[]; pagination: Pagination; groups?: IssueGroup[] | undefined }> {
      if (query.deleted) {
        if (!query.project) throw new AppError('search.project_required', 400, {}, 'project');
        const project = await access.project(principal, query.project, hints);
        access.require(principal, 'issue.delete', project.scope);
        const { rows, total } = await issues.list(project.ctx, {
          projectId: project.project.id,
          deleted: true,
          limit: query.limit,
          offset: query.offset,
        });
        return { data: await hydrate(principal, project, rows), pagination: page(query, rows.length, total) };
      }

      const sc = await search.context(principal, hints, query.project);
      const result = await search.search(principal, sc, {
        q: query.q,
        sort: query.sort,
        groupBy: query.group_by,
        groupLimit: query.group_limit,
        limit: query.limit,
        offset: query.offset,
      });
      const dtos = await hydrateMany(
        principal,
        sc.ctx,
        result.entries.map(e => e.row),
        new Map(sc.projects.map(p => [p.id, p])),
      );
      analytics.capture(
        'issues_searched',
        {
          via: principal.via,
          clause_count: query.q?.trim() ? query.q.trim().split(/\s+/).length : 0,
          grouped: Boolean(query.group_by),
          result_count: result.total,
          custom_attribute_count: result.customAttributeCount,
        },
        { userId: principal.userId, orgId: sc.org.organization.id },
      );
      return {
        data: dtos.map((dto, i) => (query.group_by ? { ...dto, group: result.entries[i]!.group } : dto)),
        pagination: {
          ...page(query, dtos.length, result.total),
          has_more: query.offset + dtos.length < result.reachable,
        },
        groups: result.groupsDto,
      };
    },

    /** The list's own query, streamed as CSV; a bad query fails before the first byte. */
    async exportCsv(
      principal: Principal,
      query: IssueExportQuery,
      hints: OrgHints = {},
    ): Promise<{ filename: string; rows: AsyncIterable<string> }> {
      const sc = await search.context(principal, hints, query.project);
      access.require(principal, 'report.export', sc.org.scope);
      const compiled = await search.compile(principal, sc, query.q, query.sort);
      const columns: readonly IssueCsvColumnInput[] = query.columns?.length ? query.columns : ISSUE_CSV_COLUMNS;
      const customCell = (entry: IssueCustomFieldValue | undefined): unknown => {
        if (!entry || entry.value === null) return null;
        const value: unknown = entry.value;
        switch (entry.type) {
          case 'select':
            return (value as CustomFieldOptionRef).name;
          case 'multi_select':
            return (value as CustomFieldOptionRef[]).map(o => o.name).join(', ') || null;
          case 'user':
            return (value as MemberRef).username;
          case 'multi_user':
            return (value as MemberRef[]).map(p => p.username).join(', ') || null;
          case 'duration':
            return formatDuration(value as number, calendar);
          case 'checkbox':
            return value ? 'true' : 'false';
          default:
            return value;
        }
      };
      const projectsById = new Map(sc.projects.map(p => [p.id, p]));
      const calendar = sc.scope.calendar;
      const cell = (issue: Issue, column: IssueCsvColumnInput): unknown => {
        if (column.startsWith(CUSTOM_GROUP_PREFIX)) {
          const slug = column.slice(CUSTOM_GROUP_PREFIX.length);
          return customCell(issue.custom_fields.find(f => f.slug === slug));
        }
        switch (column as IssueCsvColumn) {
          case 'project':
            return issue.project.key;
          case 'status':
          case 'priority':
          case 'type':
            return issue[column as 'status' | 'priority' | 'type'].name;
          case 'assignees':
            return issue.assignees.map(a => a.username).join(', ');
          case 'created_by':
            return issue.created_by.username;
          case 'estimation':
            return issue.estimate_minutes === null ? null : formatDuration(issue.estimate_minutes, calendar);
          case 'spent_time':
            return issue.spent_minutes === 0 ? null : formatDuration(issue.spent_minutes, calendar);
          case 'sprint':
            return issue.sprint?.name ?? null;
          default:
            return issue[
              column as Exclude<
                IssueCsvColumn,
                | 'project'
                | 'status'
                | 'priority'
                | 'type'
                | 'assignees'
                | 'created_by'
                | 'estimation'
                | 'spent_time'
                | 'sprint'
              >
            ];
        }
      };
      async function* rows(): AsyncIterable<string> {
        yield csvLine([...columns]);
        for (let offset = 0; offset < ISSUE_EXPORT_MAX_ROWS; offset += ISSUE_EXPORT_PAGE_SIZE) {
          const batch = await issueSearch.search(sc.ctx, sc.scope, compiled.query, {
            sort: compiled.sort,
            limit: Math.min(ISSUE_EXPORT_PAGE_SIZE, ISSUE_EXPORT_MAX_ROWS - offset),
            offset,
          });
          const dtos = await hydrateMany(
            principal,
            sc.ctx,
            batch.entries.map(e => e.row),
            projectsById,
          );
          for (const dto of dtos) yield csvLine(columns.map(c => cell(dto, c)));
          if (batch.entries.length < ISSUE_EXPORT_PAGE_SIZE) return;
        }
      }
      analytics.capture(
        'issues_exported',
        { via: principal.via },
        { userId: principal.userId, orgId: sc.org.organization.id },
      );
      const date = sc.scope.today;
      return { filename: `${sc.org.organization.slug}-issues-${date}.csv`, rows: rows() };
    },

    /** Each issue in its own transaction: one refusal never undoes the others. */
    async bulkUpdate(principal: Principal, input: BulkUpdateIssues, hints: OrgHints = {}): Promise<BulkUpdateResult[]> {
      const seen = new Set<string>();
      for (const key of input.issues) {
        const folded = key.toUpperCase();
        if (seen.has(folded)) throw new AppError('issue.bulk_duplicate', 400, { key }, 'issues');
        seen.add(folded);
      }
      const { add_assignees, remove_assignees, ...changes } = input.changes;
      const results: BulkUpdateResult[] = [];
      for (const key of input.issues) {
        try {
          const { project, issue } = await locate(principal, key, hints);
          access.require(principal, 'issue.bulk_update', project.scope);
          const before = await one(principal, project, issue);
          const patch: UpdateIssue = { ...changes };
          if (add_assignees || remove_assignees) {
            const base = new Map(
              (patch.assignees ?? before.assignees.map(a => a.username)).map(u => [
                u.replace(/^@/, '').toLowerCase(),
                u,
              ]),
            );
            for (const u of add_assignees ?? []) base.set(u.replace(/^@/, '').toLowerCase(), u);
            for (const u of remove_assignees ?? []) base.delete(u.replace(/^@/, '').toLowerCase());
            patch.assignees = [...base.values()];
          }
          const after = await this.update(principal, before.key, patch, hints);
          results.push({ key: after.key, result: after.updated_at === before.updated_at ? 'unchanged' : 'updated' });
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          results.push({
            key,
            result: 'failed',
            error: {
              code: err.code,
              message: err.message,
              ...(err.field ? { field: err.field } : {}),
              ...(err.validValues ? { valid_values: err.validValues } : {}),
            },
          });
        }
      }
      const failed = results.filter(r => r.result === 'failed').length;
      analytics.capture(
        'issues_bulk_updated',
        {
          via: principal.via,
          requested: results.length,
          updated: results.filter(r => r.result === 'updated').length,
          failed,
        },
        { userId: principal.userId },
      );
      return results;
    },

    async get(principal: Principal, key: string, hints: OrgHints = {}): Promise<Issue> {
      const { project, issue } = await locate(principal, key, hints);
      return one(principal, project, issue);
    },

    async create(principal: Principal, input: CreateIssue, hints: OrgHints = {}): Promise<Issue> {
      const project = await access.project(principal, input.project, hints);
      const planned = await planCreate(principal, project, input);
      const row = await insertPlanned(principal, project, planned, { watch: true });
      const valuedFields = [...planned.custom.plan.values()].filter(p => p.rows.length > 0).length;
      if (valuedFields > 0) {
        analytics.capture(
          'custom_field_values_set',
          { via: viaOf(principal), field_count: valuedFields },
          { userId: principal.userId, orgId: project.organization.id },
        );
      }
      analytics.capture(
        'issue_created',
        {
          via: viaOf(principal),
          has_description: Boolean(row.description_md),
          assignee_count: planned.assignees.length,
        },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return one(principal, project, row);
    },

    planCreate,
    insertPlanned,
    /** Rows of any readable projects of one organisation as the API's Issue, in the order given. */
    dtosFor: hydrateMany,

    async update(
      principal: Principal,
      key: string,
      input: UpdateIssue,
      hints: OrgHints = {},
      options: { toggleTask?: ToggleTask } = {},
    ): Promise<Issue> {
      const { project, issue } = await locate(principal, key, hints);
      const touchesOther = Object.keys(input).some(k => k !== 'status' && k !== 'assignees' && k !== 'parent');
      if (input.status !== undefined) requireWritable(principal, project, 'issue.status_change');
      if (input.assignees !== undefined) requireWritable(principal, project, 'issue.assign');
      if (input.parent !== undefined) requireWritable(principal, project, 'issue.parent_set');
      if (touchesOther || Object.keys(input).length === 0) requireWritable(principal, project, 'issue.update');
      const resolved = await resolve(project, input, issue);
      const values = await valuesOf(project);
      const catalogue = await loadCatalogue(deps.customFields, project.ctx, [project.project.id]);
      const heldBefore = await deps.customFields.listValues(project.ctx, [issue.id]);
      const nextType = resolved.type ?? values.types.find(ty => ty.id === issue.type_id)!;
      const custom = await planCustomFields(project, catalogue, input, nextType, heldBefore);
      if (custom.redirected) resolved.estimate_minutes = undefined;
      const typeChanged = nextType.id !== issue.type_id;
      await completeRequired(valueDeps, custom.vc, catalogue, custom.plan, {
        typeId: nextType.id,
        currentValues: heldBefore,
        candidates: field => typeChanged && !appliesTo(catalogue, field, issue.type_id),
      });

      let customChanged = 0;
      const updated = await inTransaction(async repos => {
        const current = await repos.issues.lockById(project.ctx, issue.id);
        if (!current || current.deleted_at) throw notFound(key);
        if (options.toggleTask) {
          resolved.description_md = toggledTask(current.description_md ?? '', options.toggleTask);
        }
        const at = now();
        const changeGroupId = Bun.randomUUIDv7();
        const changes: FieldChange[] = [];
        const patch: Parameters<IssuesRepository['update']>[2] = {};
        const nameOf = (rows: { id: number; name: string }[], id: number) => ({
          name: rows.find(r => r.id === id)!.name,
        });

        if (resolved.title !== undefined && resolved.title !== current.title) {
          patch.title = resolved.title;
          changes.push({ field: 'title', old_value: current.title, new_value: resolved.title });
        }
        if (resolved.description_md !== undefined && resolved.description_md !== current.description_md) {
          patch.description_md = resolved.description_md;
          changes.push({ field: 'description', old_value: null, new_value: null });
        }
        if (resolved.status && resolved.status.id !== current.status_id) {
          const before = values.statuses.find(s => s.id === current.status_id)!;
          patch.status_id = resolved.status.id;
          const was = isResolvedCategory(before.category);
          const will = isResolvedCategory(resolved.status.category);
          if (!was && will) patch.resolved_at = at;
          if (was && !will) patch.resolved_at = null;
          changes.push({
            field: 'status',
            old_value: { name: before.name },
            new_value: { name: resolved.status.name },
          });
        }
        if (resolved.priority && resolved.priority.id !== current.priority_id) {
          patch.priority_id = resolved.priority.id;
          changes.push({
            field: 'priority',
            old_value: nameOf(values.priorities, current.priority_id),
            new_value: { name: resolved.priority.name },
          });
        }
        if (resolved.type && resolved.type.id !== current.type_id) {
          patch.type_id = resolved.type.id;
          changes.push({
            field: 'type',
            old_value: nameOf(values.types, current.type_id),
            new_value: { name: resolved.type.name },
          });
        }
        if (resolved.estimate_minutes !== undefined && resolved.estimate_minutes !== current.estimate_minutes) {
          patch.estimate_minutes = resolved.estimate_minutes;
          changes.push({
            field: 'estimate',
            old_value: current.estimate_minutes,
            new_value: resolved.estimate_minutes,
          });
        }
        if (resolved.story_points !== undefined && resolved.story_points !== current.story_points) {
          patch.story_points = resolved.story_points;
          changes.push({ field: 'story_points', old_value: current.story_points, new_value: resolved.story_points });
        }
        for (const field of ['start_date', 'due_date'] as const) {
          if (resolved[field] !== undefined && resolved[field] !== current[field]) {
            patch[field] = resolved[field];
            changes.push({ field, old_value: current[field], new_value: resolved[field] });
          }
        }
        let parentMove: { previous: IssueRow | null; parent: IssueRow | null } | undefined;
        if (resolved.parent !== undefined && (resolved.parent?.id ?? null) !== current.parent_id) {
          const keyOf = keyIn(project);
          const previous = await checkParent(repos, {
            ctx: project.ctx,
            child: current,
            parent: resolved.parent,
            keyOf,
          });
          patch.parent_id = resolved.parent?.id ?? null;
          parentMove = { previous, parent: resolved.parent };
        }
        checkDates(
          patch.start_date !== undefined ? patch.start_date : current.start_date,
          patch.due_date !== undefined ? patch.due_date : current.due_date,
        );

        let added: number[] = [];
        if (resolved.assignees) {
          const existing = await repos.issues.listAssignees(project.ctx, [current.id]);
          const before = existing.map(a => a.membership?.username ?? '').sort(byUsername);
          const after = resolved.assignees.map(a => a.username).sort(byUsername);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            const wanted = new Set(resolved.assignees.map(a => a.id));
            const had = new Set(existing.map(a => a.user_id));
            added = [...wanted].filter(id => !had.has(id));
            await repos.issues.removeAssignees(
              project.ctx,
              current.id,
              [...had].filter(id => !wanted.has(id)),
            );
            await repos.issues.addAssignees(project.ctx, current.id, added);
            changes.push({ field: 'assignees', old_value: before, new_value: after });
          }
        }

        const before = changes.length;
        if (custom.plan.size > 0) {
          const held = await repos.customFields.listValues(project.ctx, [current.id]);
          const plannedRows = [...custom.plan.values()].flatMap(p => p.rows);
          const named = await repos.issues.findPeople(project.ctx, userIdsIn([...held, ...plannedRows]));
          const usernames = new Map(named.map(p => [p.user.id, p.membership?.username ?? '']));
          changes.push(
            ...(await writePlanned(
              repos.customFields,
              { ctx: project.ctx, projectId: project.project.id, issueId: current.id, at },
              catalogue,
              custom.plan,
              held,
              usernames,
            )),
          );
        }
        customChanged = changes.length - before;

        const sprintMove = resolved.sprint !== undefined && (resolved.sprint?.id ?? null) !== current.sprint_id;
        if (sprintMove) {
          await placeIssues(repos, {
            ctx: project.ctx,
            projectId: project.project.id,
            actorId: principal.userId,
            changeGroupId,
            at,
            sprint: resolved.sprint!,
            issues: [current],
          });
        }
        if (changes.length === 0 && !parentMove) {
          return sprintMove ? (await repos.issues.findById(project.ctx, current.id))! : current;
        }
        const row = await repos.issues.update(project.ctx, current.id, {
          ...patch,
          updated_by: principal.userId,
          updated_at: at,
        });
        await repos.issues.watch(project.ctx, current.id, added, 'auto');
        if (patch.description_md !== undefined) {
          await writeMentions(repos, project, current.id, patch.description_md);
        }
        await recordFieldChanges(
          repos.issueActivity,
          { ctx: project.ctx, issueId: current.id, actorId: principal.userId, changeGroupId, at },
          changes,
        );
        if (parentMove) {
          await recordParentChange(
            repos,
            { ctx: project.ctx, actorId: principal.userId, changeGroupId, at },
            { ctx: project.ctx, child: current, keyOf: keyIn(project), ...parentMove },
          );
        }
        return row!;
      });
      if (customChanged > 0) {
        analytics.capture(
          'custom_field_values_set',
          { via: viaOf(principal), field_count: customChanged },
          { userId: principal.userId, orgId: project.organization.id },
        );
      }
      return one(principal, project, updated);
    },

    async remove(principal: Principal, key: string, hints: OrgHints = {}): Promise<Issue> {
      const { project, issue } = await locate(principal, key, hints);
      requireWritable(principal, project, 'issue.delete');
      const row = await inTransaction(async repos => {
        const deleted = await repos.issues.update(project.ctx, issue.id, { deleted_at: now() });
        await refreshSpentRollup(repos, project.ctx, [issue.parent_id]);
        await recordEvent(repos, project, issue.id, principal.userId, 'deleted');
        return deleted!;
      });
      return one(principal, project, row);
    },

    async restore(principal: Principal, key: string, hints: OrgHints = {}): Promise<Issue> {
      const { project, issue } = await locate(principal, key, hints, { includeDeleted: true });
      if (!issue.deleted_at) return one(principal, project, issue);
      if (!can(principal, 'issue.delete', project.scope)) {
        throw denial(principal, 'issue.delete', project.scope, () => notFound(key));
      }
      requireWritable(principal, project, 'issue.delete');
      if (now().getTime() - issue.deleted_at.getTime() >= ISSUE_RESTORE_WINDOW_DAYS * DAY_MS) throw notFound(key);
      const row = await inTransaction(async repos => {
        const restored = await repos.issues.update(project.ctx, issue.id, { deleted_at: null });
        await refreshSpentRollup(repos, project.ctx, [issue.parent_id]);
        await recordEvent(repos, project, issue.id, principal.userId, 'restored');
        return restored!;
      });
      return one(principal, project, row);
    },

    star: (principal: Principal, key: string, hints: OrgHints = {}) =>
      signal(principal, key, hints, async (repos, { project, issue }) => {
        await repos.issues.star(project.ctx, issue.id, principal.userId);
        await repos.issues.watch(project.ctx, issue.id, [principal.userId], 'explicit');
      }),

    unstar: (principal: Principal, key: string, hints: OrgHints = {}) =>
      signal(principal, key, hints, (repos, { project, issue }) =>
        repos.issues.unstar(project.ctx, issue.id, principal.userId),
      ),

    vote: (principal: Principal, key: string, hints: OrgHints = {}) =>
      signal(principal, key, hints, (repos, { project, issue }) =>
        repos.issues.vote(project.ctx, issue.id, principal.userId),
      ),

    unvote: (principal: Principal, key: string, hints: OrgHints = {}) =>
      signal(principal, key, hints, (repos, { project, issue }) =>
        repos.issues.unvote(project.ctx, issue.id, principal.userId),
      ),

    watch: (principal: Principal, key: string, hints: OrgHints = {}) =>
      signal(principal, key, hints, (repos, { project, issue }) =>
        repos.issues.watch(project.ctx, issue.id, [principal.userId], 'explicit'),
      ),

    unwatch: (principal: Principal, key: string, hints: OrgHints = {}) =>
      signal(principal, key, hints, async (repos, { project, issue }) => {
        await repos.issues.unwatch(project.ctx, issue.id, principal.userId);
      }),

    async listWatchers(principal: Principal, key: string, hints: OrgHints = {}): Promise<IssueWatcher[]> {
      const { project, issue } = await locate(principal, key, hints);
      access.require(principal, 'issue.watchers.read', project.scope);
      return (await issues.listWatchers(project.ctx, issue.id)).map(watcherDto);
    },

    async addWatcher(principal: Principal, key: string, username: string, hints: OrgHints = {}): Promise<IssueWatcher> {
      const { project, issue } = await locate(principal, key, hints);
      const [target] = await eligiblePeople(project, [username], 'issue.watcher_not_in_project', 'username');
      access.require(
        principal,
        target!.id === principal.userId ? 'issue.personal_signal' : 'issue.watchers.manage',
        project.scope,
      );
      await issues.watch(project.ctx, issue.id, [target!.id], 'explicit');
      const watcher = (await issues.listWatchers(project.ctx, issue.id)).find(w => w.user_id === target!.id)!;
      return watcherDto(watcher);
    },

    async removeWatcher(
      principal: Principal,
      key: string,
      username: string,
      hints: OrgHints = {},
    ): Promise<IssueWatcher> {
      const { project, issue } = await locate(principal, key, hints);
      const name = username.replace(/^@/, '');
      const watcher = (await issues.listWatchers(project.ctx, issue.id)).find(w =>
        sameName(w.membership?.username ?? '', name),
      );
      if (!watcher) throw new AppError('issue.not_watching', 404, { username: `@${name}` }, 'username');
      access.require(
        principal,
        watcher.user_id === principal.userId ? 'issue.personal_signal' : 'issue.watchers.manage',
        project.scope,
      );
      await issues.unwatch(project.ctx, issue.id, watcher.user_id);
      return watcherDto(watcher);
    },

    async listVoters(principal: Principal, key: string, hints: OrgHints = {}): Promise<MemberRef[]> {
      const { project, issue } = await locate(principal, key, hints);
      access.require(principal, 'issue.watchers.read', project.scope);
      return (await issues.listVoters(project.ctx, issue.id)).map(memberRef);
    },

    async activity(
      principal: Principal,
      key: string,
      query: ActivityPageQuery,
      hints: OrgHints = {},
    ): Promise<{ data: IssueActivity[]; pagination: Pagination }> {
      const { project, issue } = await locate(principal, key, hints);
      const afterId = query.cursor ? decodeCursor(query.cursor) : undefined;
      const filter = { kinds: query.kinds };
      const [rows, total] = await Promise.all([
        issueActivity.list(project.ctx, issue.id, { afterId, limit: query.limit + 1 }, filter),
        issueActivity.count(project.ctx, issue.id, filter),
      ]);
      const page = rows.slice(0, query.limit);
      const has_more = rows.length > query.limit;
      const readableKeys = page.some(r => LINK_KINDS.has(r.activity.kind))
        ? readableProjects(await search.readableProjects(principal, project)).byKey
        : null;
      const shown = (kind: string, value: unknown) =>
        readableKeys && LINK_KINDS.has(kind) ? redactLink(value, readableKeys) : value;
      const commentIdOf = (value: unknown) =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { comment_id?: unknown }).comment_id === 'number'
          ? (value as { comment_id: number }).comment_id
          : undefined;
      const commentIds = page.flatMap(r => {
        const id = r.activity.kind === 'comment_deleted' ? undefined : commentIdOf(r.activity.new_value);
        return id === undefined ? [] : [id];
      });
      const personFields = page.some(r => r.activity.field?.startsWith(HISTORY_PREFIX))
        ? new Set(
            (await deps.customFields.listForProjects(project.ctx, [project.project.id]))
              .filter(f => f.type === 'user' || f.type === 'multi_user')
              .map(f => `${HISTORY_PREFIX}${f.slug}`),
          )
        : new Set<string>();
      const namedBy = new Map(page.map(r => [r.activity.id, usernamesIn(r.activity, personFields)]));
      const found = await organizations.findMembersByUsernames(
        project.ctx,
        [...new Set([...namedBy.values()].flat())],
        {
          includeRemoved: true,
        },
      );
      const personOf = new Map(
        found.map(m => [m.membership.username.toLowerCase(), access.memberRef(m.user, m.membership)]),
      );
      const issueKey = keyIn(project)(issue);
      const commentsById = new Map(
        (await comments.findLive(project.ctx, commentIds)).map(c => [
          c.comment.id,
          commentDto(access, principal, project, issueKey, c),
        ]),
      );
      return {
        data: page.map(r => {
          const commentId = r.activity.kind === 'comment_deleted' ? undefined : commentIdOf(r.activity.new_value);
          return {
            id: r.activity.id,
            kind: r.activity.kind as IssueActivityKind,
            actor: {
              ...access.memberRef(r.actor, r.actor_membership),
              username: r.actor_membership?.username ?? null,
            },
            change_group_id: r.activity.change_group_id,
            field: r.activity.field,
            old_value: shown(r.activity.kind, r.activity.old_value ?? null),
            new_value: shown(r.activity.kind, r.activity.new_value ?? null),
            people: (namedBy.get(r.activity.id) ?? []).flatMap(u => personOf.get(u.toLowerCase()) ?? []),
            created_at: r.activity.created_at.toISOString(),
            updated_at: r.activity.updated_at.toISOString(),
            comment: commentId === undefined ? null : (commentsById.get(commentId) ?? null),
          };
        }),
        pagination: {
          total,
          limit: query.limit,
          offset: 0,
          next_cursor: has_more ? encodeCursor(page.at(-1)!.activity.id) : null,
          has_more,
        },
      };
    },

    toggleDescriptionTask(principal: Principal, key: string, task: ToggleTask, hints: OrgHints = {}): Promise<Issue> {
      return this.update(principal, key, {}, hints, { toggleTask: task });
    },

    /** Issue chips by key (rendering `PMS-12` in markdown) or by picker text; unreadable issues are absent. */
    async refs(principal: Principal, query: IssueRefQuery, hints: OrgHints = {}): Promise<IssueRef[]> {
      const org: OrgAccess = await access.current(principal, hints);
      const readable = await search.readableProjects(principal, org);
      const byKey = new Map(readable.map(p => [p.key.toUpperCase(), p]));
      const byId = new Map(readable.map(p => [p.id, p]));
      if (query.keys) {
        const wanted = query.keys.flatMap(k => {
          const parsed = parseIssueKey(k);
          const project = parsed && byKey.get(parsed.projectKey.toUpperCase());
          return project ? [{ projectId: project.id, number: parsed.number }] : [];
        });
        const rows = await issues.findByKeys(org.ctx, wanted);
        const order = wanted.map(w => rows.find(r => r.project_id === w.projectId && r.key_number === w.number));
        const found = [...new Set(order.filter((r): r is IssueRow => r !== undefined))];
        return refsOf(principal, org.ctx, found, byId);
      }
      const text = (query.q ?? '').trim();
      const prefer = query.project ? byKey.get(query.project.toUpperCase()) : undefined;
      const keyMatch = /^([a-z][a-z0-9]*)-(\d*)$/i.exec(text);
      const keyProject = keyMatch ? byKey.get(keyMatch[1]!.toUpperCase()) : undefined;
      const numberOnly = /^\d+$/.test(text) ? prefer : undefined;
      const key = keyProject
        ? { projectId: keyProject.id, numberPrefix: keyMatch![2]! }
        : numberOnly
          ? { projectId: numberOnly.id, numberPrefix: text }
          : undefined;
      const rows = await issues.pick(org.ctx, {
        projectIds: readable.map(p => p.id),
        text,
        key,
        preferProjectId: prefer?.id,
        limit: query.limit ?? ISSUE_REF_PICKER_LIMIT,
      });
      return refsOf(principal, org.ctx, rows, byId);
    },

    // For the services that hang off an issue - comments, links, tags - so they locate and render it one way.
    locate,
    requireWritable,
    dto: one,
    dtos: hydrate,
    dtosMany: hydrateMany,
    refsOf,
    keyIn,
    readableProjects: (principal: Principal, org: OrgAccess) => search.readableProjects(principal, org),

    /** The nightly issues.purge job. */
    async purgeExpired(): Promise<number> {
      const cutoff = new Date(now().getTime() - ISSUE_RESTORE_WINDOW_DAYS * DAY_MS);
      const orgIds = await issues.orgsWithDeletedBefore(
        systemContext('the nightly purge has no actor and spans every organisation'),
        cutoff,
      );
      return purgeDeleted(
        { inTransaction, stores: deps.stores, analytics, storageLimit: access.storageLimit, now },
        orgIds,
        {
          claim: (repos, ctx, limit) => repos.issues.idsDeletedBefore(ctx, cutoff, limit),
          files: (repos, ctx, ids) => repos.attachments.onIssuesDeletedBefore(ctx, cutoff, ids),
          purge: (repos, ctx, ids) => repos.issues.purgeDeletedBefore(ctx, cutoff, ids),
          holder: file => file.issue_id,
        },
      );
    },
  };
}

export type IssuesService = ReturnType<typeof issuesService>;
