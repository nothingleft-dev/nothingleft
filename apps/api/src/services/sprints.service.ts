import { recordSprintEvent } from '@services/notify-outbox';
import {
  BACKLOG_TARGET,
  SPRINT_GOAL_MAX_BYTES,
  type BacklogMove,
  type CreateSprint,
  type FinishSprint,
  type Issue,
  type IssueListItem,
  type LabelColor,
  type Pagination,
  type Principal,
  type Sprint,
  type SprintFinishResult,
  type SprintState,
  type StartSprint,
  type StatusCategory,
  type StatusCount,
  type UpdateSprint,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type IssueRow,
  type IssuesRepository,
  type ProjectSchemaRepository,
  type SprintFigures,
  type SprintRow,
  type SprintsRepository,
  type TenantContext,
  type WorkflowStatusRow,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { parseIssueKey, uniqueSlug } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import { withUniqueAs } from '@lib/pg-errors';
import type { AccessService, OrgAccess, ProjectAccess } from '@services/access';
import { dailyOnce, type DailyOnceStore } from '@services/daily-once';
import type { IssuesService } from '@services/issues.service';
import { placeIssues } from '@services/sprint-placement';
import type { SearchContext, SearchService } from '@services/search.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

export interface SprintsDeps {
  access: AccessService;
  search: SearchService;
  issuesService: IssuesService;
  sprints: SprintsRepository;
  issues: IssuesRepository;
  schema: ProjectSchemaRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  redis: DailyOnceStore;
  /** A snapshot changes what burndown reports read; the report cache hears of it here. */
  onSnapshot?: (orgId: number) => Promise<void>;
  now?: () => Date;
}

export interface BacklogQuery {
  sprint?: string | undefined;
  q?: string | undefined;
  limit: number;
  offset: number;
}

const DAY_MS = 86_400_000;
const utcDate = (at: Date) => at.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const NO_FIGURES = (sprint_id: number): SprintFigures => ({
  sprint_id,
  issues: 0,
  resolved_issues: 0,
  points: 0,
  resolved_points: 0,
  remaining_estimate_minutes: 0,
  mine_issues: 0,
  mine_resolved_issues: 0,
});

/** Status counts in the project's status order, statuses with no issue left out. */
export function statusCountsOf(statuses: WorkflowStatusRow[], counts: Map<number, number>): StatusCount[] {
  return statuses.flatMap(s => {
    const count = counts.get(s.id) ?? 0;
    return count === 0
      ? []
      : [{ name: s.name, category: s.category as StatusCategory, color: s.color as LabelColor, count }];
  });
}

export function sprintsService(deps: SprintsDeps) {
  const { access, search, issuesService, sprints, issues, schema, inTransaction, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  const assigneeIds = async (ctx: TenantContext, issueIds: number[]) => [
    ...new Set((await issues.listAssignees(ctx, issueIds)).map(a => a.user_id)),
  ];

  function requireManage(principal: Principal, project: ProjectAccess) {
    issuesService.requireWritable(principal, project, 'project.agile.manage');
  }

  async function resolveSprint(project: ProjectAccess, value: string): Promise<SprintRow> {
    const row = await sprints.find(project.ctx, project.project.id, value);
    if (row) return row;
    const all = await sprints.list(project.ctx, [project.project.id]);
    throw new AppError(
      'sprint.not_found',
      404,
      { sprint: value, project: project.project.key },
      'sprint',
      all.map(s => s.name),
    );
  }

  async function present(
    principal: Principal,
    org: OrgAccess,
    rows: SprintRow[],
    today: string,
    projectsById: ReadonlyMap<number, { key: string; name: string }>,
    options: { snapshots?: boolean } = {},
  ): Promise<Sprint[]> {
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.id);
    const projectIds = [...new Set(rows.map(r => r.project_id))];
    const [figures, counts, statuses, people, snapshots] = await Promise.all([
      sprints.figures(org.ctx, ids, principal.userId),
      sprints.valueCounts(org.ctx, ids),
      schema.listForProjects(org.ctx, 'statuses', projectIds),
      issues.findPeople(
        org.ctx,
        rows.map(r => r.created_by),
      ),
      options.snapshots ? Promise.all(rows.map(r => sprints.snapshots(org.ctx, r.id))) : null,
    ]);
    return rows.map((row, i) => {
      const f = figures.get(row.id) ?? NO_FIGURES(row.id);
      const byStatus = new Map(counts.filter(c => c.sprint_id === row.id).map(c => [c.value_id, c.n]));
      const creator = people.find(p => p.user.id === row.created_by);
      return {
        name: row.name,
        slug: row.slug,
        state: row.state as SprintState,
        project: projectsById.get(row.project_id)!,
        goal_md: row.goal_md,
        start_date: row.start_date,
        end_date: row.end_date,
        started_at: row.started_at?.toISOString() ?? null,
        completed_at: row.completed_at?.toISOString() ?? null,
        days_left: row.state === 'active' && row.end_date ? Math.max(0, daysBetween(today, row.end_date)) : null,
        progress: {
          issues: f.issues,
          resolved_issues: f.resolved_issues,
          points: f.points,
          resolved_points: f.resolved_points,
          remaining_estimate_minutes: f.remaining_estimate_minutes,
          by_status: statusCountsOf(
            statuses.filter(s => s.project_id === row.project_id),
            byStatus,
          ),
          mine: { issues: f.mine_issues, resolved_issues: f.mine_resolved_issues },
        },
        snapshots: snapshots
          ? snapshots[i]!.map(s => ({
              date: s.snapshot_date,
              total_points: s.total_points,
              completed_points: s.completed_points,
              total_issues: s.total_issues,
              completed_issues: s.completed_issues,
              remaining_estimate_minutes: s.remaining_estimate_minutes,
            }))
          : null,
        created_by: creator
          ? access.memberRef(creator.user, creator.membership)
          : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false },
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  async function projectContext(principal: Principal, key: string, hints: OrgHints) {
    const sc = await search.context(principal, hints, key);
    return { sc, project: sc.project! };
  }

  const one = async (principal: Principal, sc: SearchContext, project: ProjectAccess, row: SprintRow, full = true) =>
    (
      await present(principal, project, [row], sc.scope.today, new Map([[project.project.id, project.project]]), {
        snapshots: full,
      })
    )[0]!;

  function checkGoal(goal: string | null | undefined) {
    if (!goal) return;
    const bytes = Buffer.byteLength(goal, 'utf8');
    if (bytes > SPRINT_GOAL_MAX_BYTES) {
      throw new AppError('sprint.goal_too_large', 400, { size: Math.ceil(bytes / 1024) }, 'goal_md');
    }
  }

  function checkDates(start: string | null, end: string | null) {
    if (start && end && start > end) throw new AppError('sprint.dates_out_of_order', 400, {}, 'end_date');
  }

  async function checkName(project: ProjectAccess, name: string, self?: number) {
    const all = await sprints.list(project.ctx, [project.project.id]);
    if (all.some(s => s.id !== self && s.name.toLowerCase() === name.toLowerCase())) {
      throw new AppError('sprint.name_taken', 409, { name, project: project.project.key }, 'name');
    }
  }

  const slugFor = async (project: ProjectAccess, name: string) =>
    uniqueSlug(name, await sprints.slugsInProject(project.ctx, project.project.id)) ||
    uniqueSlug('sprint', await sprints.slugsInProject(project.ctx, project.project.id));

  /** "backlog", or a planned sprint other than `except`. */
  async function carryTarget(project: ProjectAccess, value: string, except: SprintRow): Promise<SprintRow | null> {
    if (value.trim().toLowerCase() === BACKLOG_TARGET) return null;
    const row = await sprints.find(project.ctx, project.project.id, value);
    if (!row || row.state !== 'planned' || row.id === except.id) {
      const planned = await sprints.list(project.ctx, [project.project.id], ['planned']);
      throw new AppError(
        row ? 'sprint.invalid_target' : 'sprint.not_found',
        400,
        { name: value, sprint: value, project: project.project.key },
        'move_unfinished_to',
        [BACKLOG_TARGET, ...planned.filter(s => s.id !== except.id).map(s => s.name)],
      );
    }
    return row;
  }

  return {
    resolveSprint,
    present,

    async list(principal: Principal, key: string, states: SprintState[] | undefined, hints: OrgHints = {}) {
      const { sc, project } = await projectContext(principal, key, hints);
      const rows = await sprints.list(project.ctx, [project.project.id], states);
      return present(principal, project, rows, sc.scope.today, new Map([[project.project.id, project.project]]));
    },

    /** Sprints across every project the caller can read in the organisation: the dashboard's rail and cards. */
    async listAcross(principal: Principal, states: SprintState[] | undefined, hints: OrgHints = {}) {
      const sc = await search.context(principal, hints);
      const rows = await sprints.list(sc.ctx, sc.scope.projectIds, states);
      return present(principal, sc.org, rows, sc.scope.today, new Map(sc.projects.map(p => [p.id, p])));
    },

    async get(principal: Principal, key: string, value: string, hints: OrgHints = {}): Promise<Sprint> {
      const { sc, project } = await projectContext(principal, key, hints);
      return one(principal, sc, project, await resolveSprint(project, value));
    },

    async create(principal: Principal, key: string, input: CreateSprint, hints: OrgHints = {}): Promise<Sprint> {
      const { sc, project } = await projectContext(principal, key, hints);
      requireManage(principal, project);
      checkGoal(input.goal_md);
      checkDates(input.start_date ?? null, input.end_date ?? null);
      await checkName(project, input.name);
      const source = input.add_unresolved_from ? await resolveSprint(project, input.add_unresolved_from) : undefined;
      const slug = await slugFor(project, input.name);
      const at = now();
      let carried = 0;
      const row = await inTransaction(async repos => {
        const created = await withUniqueAs(
          () =>
            repos.sprints.insert(project.ctx, {
              project_id: project.project.id,
              name: input.name,
              slug,
              goal_md: input.goal_md ?? null,
              start_date: input.start_date ?? null,
              end_date: input.end_date ?? null,
              created_by: principal.userId,
              created_at: at,
              updated_at: at,
            }),
          ['sprints_project_lower_name_unique'],
          () => new AppError('sprint.name_taken', 409, { name: input.name, project: project.project.key }, 'name'),
        );
        if (source) {
          const moving = await repos.issues.listInSprint(project.ctx, source.id, { unresolved: true });
          const changed = await placeIssues(repos, {
            ctx: project.ctx,
            projectId: project.project.id,
            actorId: principal.userId,
            changeGroupId: Bun.randomUUIDv7(),
            at,
            sprint: created,
            issues: moving,
            sprintsById: new Map([[source.id, source]]),
          });
          carried = changed.length;
        }
        return created;
      });
      analytics.capture(
        'sprint_created',
        { via: principal.via, scheduled: row.start_date !== null && row.end_date !== null, carried_over: carried },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return one(principal, sc, project, row);
    },

    async update(
      principal: Principal,
      key: string,
      value: string,
      input: UpdateSprint,
      hints: OrgHints = {},
    ): Promise<Sprint> {
      const { sc, project } = await projectContext(principal, key, hints);
      requireManage(principal, project);
      const current = await resolveSprint(project, value);
      checkGoal(input.goal_md);
      const start = input.start_date !== undefined ? input.start_date : current.start_date;
      const end = input.end_date !== undefined ? input.end_date : current.end_date;
      checkDates(start, end);
      // A running sprint keeps a start and an end: the countdown and the burndown read them.
      if (current.state === 'active' && (start === null || end === null)) {
        throw new AppError('sprint.end_date_required', 400, { name: current.name }, 'end_date');
      }
      const patch: Parameters<SprintsRepository['update']>[2] = { updated_at: now() };
      if (input.name !== undefined && input.name !== current.name) {
        await checkName(project, input.name, current.id);
        patch.name = input.name;
        if (input.name.toLowerCase() !== current.name.toLowerCase()) patch.slug = await slugFor(project, input.name);
      }
      if (input.goal_md !== undefined) patch.goal_md = input.goal_md;
      if (input.start_date !== undefined) patch.start_date = input.start_date;
      if (input.end_date !== undefined) patch.end_date = input.end_date;
      const row = await withUniqueAs(
        () => sprints.update(project.ctx, current.id, patch),
        ['sprints_project_lower_name_unique'],
        () =>
          new AppError(
            'sprint.name_taken',
            409,
            { name: input.name ?? current.name, project: project.project.key },
            'name',
          ),
      );
      return one(principal, sc, project, row!);
    },

    async start(
      principal: Principal,
      key: string,
      value: string,
      input: StartSprint,
      hints: OrgHints = {},
    ): Promise<Sprint> {
      const { sc, project } = await projectContext(principal, key, hints);
      requireManage(principal, project);
      const current = await resolveSprint(project, value);
      if (current.state !== 'planned') throw new AppError('sprint.not_planned', 409, { name: current.name });
      const active = await sprints.findActive(project.ctx, project.project.id);
      if (active) {
        throw new AppError('sprint.active_exists', 409, { name: active.name, project: project.project.key });
      }
      const start = input.start_date ?? sc.scope.today;
      const end = input.end_date ?? current.end_date;
      if (!end) throw new AppError('sprint.end_date_required', 400, { name: current.name }, 'end_date');
      checkDates(start, end);
      const at = now();
      const row = await inTransaction(async repos => {
        const started = await repos.sprints.update(project.ctx, current.id, {
          state: 'active',
          start_date: start,
          end_date: end,
          started_at: at,
          updated_at: at,
        });
        await repos.sprints.writeSnapshot(project.ctx, current.id, utcDate(at));
        return started!;
      });
      const inSprint = await issues.listInSprint(project.ctx, current.id);
      recordSprintEvent(
        {
          type: 'sprint',
          org_id: project.ctx.orgId,
          sprint_id: current.id,
          kind: 'sprint_started',
          actor_id: principal.userId,
          user_ids: await assigneeIds(
            project.ctx,
            inSprint.map(i => i.id),
          ),
        },
        at,
      );
      const figures = (await sprints.figures(project.ctx, [row.id], principal.userId)).get(row.id);
      analytics.capture(
        'sprint_started',
        { via: principal.via, issue_count: figures?.issues ?? 0, points: figures?.points ?? 0 },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return one(principal, sc, project, row);
    },

    async finish(
      principal: Principal,
      key: string,
      value: string,
      input: FinishSprint,
      hints: OrgHints = {},
    ): Promise<SprintFinishResult> {
      const { sc, project } = await projectContext(principal, key, hints);
      requireManage(principal, project);
      const current = await resolveSprint(project, value);
      if (current.state !== 'active') throw new AppError('sprint.not_active', 409, { name: current.name });
      const target = await carryTarget(project, input.move_unfinished_to, current);
      const at = now();
      const { row, moved, completed } = await inTransaction(async repos => {
        const locked = await repos.sprints.lock(project.ctx, current.id);
        if (locked?.state !== 'active') throw new AppError('sprint.not_active', 409, { name: current.name });
        const all = await repos.issues.listInSprint(project.ctx, current.id);
        const unfinished = all.filter(i => i.resolved_at === null);
        // Captured before the carry-over: everyone who had work in the sprint hears it finished.
        recordSprintEvent(
          {
            type: 'sprint',
            org_id: project.ctx.orgId,
            sprint_id: current.id,
            kind: 'sprint_finished',
            actor_id: principal.userId,
            user_ids: await assigneeIds(
              project.ctx,
              all.map(i => i.id),
            ),
          },
          at,
        );
        const changed = await placeIssues(repos, {
          ctx: project.ctx,
          projectId: project.project.id,
          actorId: principal.userId,
          changeGroupId: Bun.randomUUIDv7(),
          at,
          sprint: target,
          issues: unfinished,
          sprintsById: new Map([[current.id, current]]),
        });
        // The last point of the burndown, taken before the carried-over issues leave it.
        await repos.sprints.writeSnapshot(project.ctx, current.id, utcDate(at));
        const finished = await repos.sprints.update(project.ctx, current.id, {
          state: 'completed',
          completed_at: at,
          updated_at: at,
        });
        return { row: finished!, moved: changed, completed: all.length - unfinished.length };
      });
      analytics.capture(
        'sprint_finished',
        { via: principal.via, completed, unfinished: moved.length, moved_to: target ? 'sprint' : 'backlog' },
        { userId: principal.userId, orgId: project.organization.id },
      );
      const keyOf = issuesService.keyIn(project);
      return {
        sprint: await one(principal, sc, project, row),
        moved: moved.map(keyOf),
        moved_to: target ? { name: target.name, slug: target.slug, state: target.state as SprintState } : null,
      };
    },

    async remove(principal: Principal, key: string, value: string, hints: OrgHints = {}): Promise<Sprint> {
      const { sc, project } = await projectContext(principal, key, hints);
      requireManage(principal, project);
      const current = await resolveSprint(project, value);
      if (current.state !== 'planned') throw new AppError('sprint.delete_not_planned', 409, { name: current.name });
      const before = await one(principal, sc, project, current, false);
      const at = now();
      await inTransaction(async repos => {
        const members = await repos.issues.listInSprint(project.ctx, current.id);
        // Soft-deleted issues keep a sprint too; the key would block the delete.
        await placeIssues(repos, {
          ctx: project.ctx,
          projectId: project.project.id,
          actorId: principal.userId,
          changeGroupId: Bun.randomUUIDv7(),
          at,
          sprint: null,
          issues: members,
          sprintsById: new Map([[current.id, current]]),
        });
        await repos.issues.clearSprint(project.ctx, current.id);
        await repos.sprints.remove(project.ctx, current.id);
      });
      return before;
    },

    /** One container - the backlog, or a sprint - in drag order, filtered by `q`. */
    async backlog(
      principal: Principal,
      key: string,
      query: BacklogQuery,
      hints: OrgHints = {},
    ): Promise<{ data: IssueListItem[]; pagination: Pagination }> {
      const { sc, project } = await projectContext(principal, key, hints);
      const sprint = query.sprint ? await resolveSprint(project, query.sprint) : null;
      const result = await search.search(principal, sc, {
        q: query.q,
        container: { projectId: project.project.id, sprintId: sprint?.id ?? null },
        limit: query.limit,
        offset: query.offset,
      });
      const data = await issuesService.dtos(
        principal,
        project,
        result.entries.map(e => e.row),
        { catalogue: sc.catalogue },
      );
      if (await dailyOnce(deps.redis, `backlog:${principal.userId}:${project.project.id}`, now())) {
        analytics.capture(
          'backlog_viewed',
          { via: principal.via },
          { userId: principal.userId, orgId: project.organization.id },
        );
      }
      return {
        data,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          next_cursor: null,
          has_more: query.offset + data.length < result.total,
        },
      };
    },

    /** Drag in the backlog: into a sprint or the backlog, before or after an issue, or to the bottom. */
    async move(principal: Principal, key: string, input: BacklogMove, hints: OrgHints = {}): Promise<Issue[]> {
      const project = await access.project(principal, key, hints);
      issuesService.requireWritable(principal, project, 'issue.update');
      const seen = new Set<number>();
      const rows: IssueRow[] = [];
      for (const issueKey of input.issues) {
        const parsed = parseIssueKey(issueKey);
        const row =
          parsed && parsed.projectKey.toUpperCase() === project.project.key.toUpperCase()
            ? await issues.findByNumber(project.ctx, project.project.id, parsed.number)
            : undefined;
        if (!row) {
          throw new AppError(
            'backlog.issue_other_project',
            400,
            { key: issueKey, project: project.project.key },
            'issues',
          );
        }
        if (seen.has(row.id)) throw new AppError('backlog.duplicate_issue', 400, { key: issueKey }, 'issues');
        seen.add(row.id);
        rows.push(row);
      }
      const target =
        input.sprint === undefined
          ? undefined
          : input.sprint === null || input.sprint.trim().toLowerCase() === BACKLOG_TARGET
            ? null
            : await resolveSprint(project, input.sprint);
      if (target?.state === 'completed') throw new AppError('sprint.completed', 409, { name: target.name }, 'sprint');
      const anchorKey = input.before ?? input.after;
      const field = input.before ? 'before' : 'after';
      let anchor: IssueRow | undefined;
      if (anchorKey) {
        const parsed = parseIssueKey(anchorKey);
        anchor =
          parsed && parsed.projectKey.toUpperCase() === project.project.key.toUpperCase()
            ? await issues.findByNumber(project.ctx, project.project.id, parsed.number)
            : undefined;
        if (!anchor) {
          throw new AppError(
            'backlog.issue_other_project',
            400,
            { key: anchorKey, project: project.project.key },
            field,
          );
        }
        if (seen.has(anchor.id)) throw new AppError('backlog.anchor_moving', 400, { key: anchorKey }, field);
      }
      // Without a sprint named, the issues stay where the anchor is, or where the first of them is.
      const container: SprintRow | null =
        target !== undefined
          ? target
          : await (async () => {
              const id = anchor ? anchor.sprint_id : rows[0]!.sprint_id;
              return id === null ? null : ((await sprints.findByIds(project.ctx, [id]))[0] ?? null);
            })();
      if (anchor && anchor.sprint_id !== (container?.id ?? null)) {
        throw new AppError(
          'backlog.anchor_not_in_container',
          400,
          { key: anchorKey!, container: container ? container.name : BACKLOG_TARGET },
          field,
        );
      }
      if (container?.state === 'completed') {
        throw new AppError('sprint.completed', 409, { name: container.name }, 'sprint');
      }
      const at = now();
      const changed = await inTransaction(repos =>
        placeIssues(repos, {
          ctx: project.ctx,
          projectId: project.project.id,
          actorId: principal.userId,
          changeGroupId: Bun.randomUUIDv7(),
          at,
          sprint: container,
          issues: rows,
          anchor: anchor ? { issueId: anchor.id, side: input.before ? 'before' : 'after' } : undefined,
        }),
      );
      analytics.capture(
        'backlog_moved',
        { via: principal.via, count: rows.length, sprint_changed: changed.length > 0 },
        { userId: principal.userId, orgId: project.organization.id },
      );
      const fresh = await issues.findByIds(
        project.ctx,
        rows.map(r => r.id),
      );
      return issuesService.dtos(principal, project, fresh);
    },

    /** The nightly sprint.snapshot job: yesterday's figures, UTC, for every active sprint. */
    async snapshotActive(): Promise<number> {
      const day = utcDate(new Date(now().getTime() - DAY_MS));
      const active = await sprints.listActiveEverywhere(
        systemContext('the nightly sprint snapshot has no actor and spans every organisation'),
      );
      for (const sprint of active) {
        await sprints.writeSnapshot(tenantContext(sprint.org_id), sprint.id, day);
        await deps.onSnapshot?.(sprint.org_id);
      }
      return active.length;
    },
  };
}

export type SprintsService = ReturnType<typeof sprintsService>;
