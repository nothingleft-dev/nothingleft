import type { Analytics } from '@nothingleft/analytics';
import { t } from '@nothingleft/i18n';
import { formatIssueKey, parseIssueKey } from '@nothingleft/format';
import {
  AUTOMATION_RUNS_RETENTION_DAYS,
  planLimits,
  type Automation,
  type AutomationAction,
  type AutomationRun,
  type AutomationRunResult,
  type AutomationRunsQuery,
  type AutomationSkipReason,
  type AutomationTemplate,
  type AutomationTestResult,
  type AutomationTrigger,
  type CreateAutomation,
  type GitLinkIntent,
  type OrgPlan,
  type Principal,
  type StatusCategory,
  type UpdateAutomation,
} from '@nothingleft/types';
import {
  systemContext,
  type AutomationRow,
  type AutomationsRepository,
  type GitEntitiesRepository,
  type GitLinksRepository,
  type GitRepositoriesRepository,
  type IssueRow,
  type IssuesRepository,
  type OrganizationsRepository,
  type ProjectSchemaRepository,
  type ProjectsRepository,
  type TenantContext,
  type WorkflowStatusRow,
} from '@nothingleft/db';
import { AppError } from '@lib/errors';
import type { AccessService, ProjectAccess } from '@services/access';
import {
  catalogue,
  sentenceOf,
  templates,
  validateAction,
  validateConditions,
  CONDITION_DEFAULTS,
} from '@services/automation-catalogue';
import { recordIssueTouched } from '@services/notify-outbox';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

/** What a trigger knows about one issue it fired for, beyond the issue itself. */
export interface FiringFacts {
  intent?: GitLinkIntent;
  base_ref?: string;
  repository_id?: number;
  pull_request_id?: number;
  draft?: boolean;
  to_default_branch?: boolean;
  child_count?: number;
}

export interface AutomationFiring {
  trigger: AutomationTrigger;
  issues: { issueId: number; facts: FiringFacts }[];
  /** What fired it, kept on each run: `{ "pull_request": "acme/web#42" }`. */
  ref: Record<string, unknown>;
  /** The same, in words, for the run log and history. */
  cause: string;
  /** The member whose git action fired it: everyone but them hears about the change. */
  causedBy: number | null;
}

export interface AutomationsDeps {
  access: AccessService;
  automations: AutomationsRepository;
  projects: ProjectsRepository;
  schema: ProjectSchemaRepository;
  issues: IssuesRepository;
  organizations: OrganizationsRepository;
  links: GitLinksRepository;
  entities: GitEntitiesRepository;
  repositories: GitRepositoriesRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `*` matches any run of characters; one backtrack point, so a hostile pattern cannot take exponential time. */
export function matchesGlob(glob: string, text: string): boolean {
  let g = 0;
  let x = 0;
  let star = -1;
  let mark = 0;
  while (x < text.length) {
    if (g < glob.length && glob[g] !== '*' && glob[g] === text[x]) {
      g++;
      x++;
    } else if (g < glob.length && glob[g] === '*') {
      star = g++;
      mark = x;
    } else if (star !== -1) {
      g = star + 1;
      x = ++mark;
    } else {
      return false;
    }
  }
  while (g < glob.length && glob[g] === '*') g++;
  return g === glob.length;
}

// `/automations/templates` is a route, so no rule may be called that.
const RESERVED_NAMES = new Set(['templates']);
const checkName = (name: string) => {
  if (RESERVED_NAMES.has(name.trim().toLowerCase()))
    throw new AppError('automation.name_reserved', 422, { name }, 'name');
};

const findStatus = (statuses: readonly WorkflowStatusRow[], name: string) =>
  statuses.find(s => !s.is_archived && s.name.toLowerCase() === name.toLowerCase());

export function automationsService(deps: AutomationsDeps) {
  const { access, automations, projects, schema, issues, organizations, links, entities, repositories } = deps;
  const now = deps.now ?? (() => new Date());

  async function readable(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'git.read', project.scope);
    return project;
  }

  async function manageable(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'project.automations.manage', project.scope);
    if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
    return project;
  }

  async function find(project: ProjectAccess, name: string): Promise<AutomationRow> {
    const row = await automations.findByName(project.ctx, project.project.id, name);
    if (!row) throw new AppError('automation.not_found', 404, { key: project.project.key, name }, 'name');
    return row;
  }

  const sentence = (row: Pick<AutomationRow, 'trigger' | 'conditions' | 'action' | 'action_params'>) =>
    sentenceOf(
      row.trigger as AutomationTrigger,
      row.conditions as Record<string, unknown>,
      row.action as AutomationAction,
      row.action_params as Record<string, unknown>,
    );

  async function toDtos(project: ProjectAccess, rows: AutomationRow[]): Promise<Automation[]> {
    const [statuses, stats, people] = await Promise.all([
      schema.list(project.ctx, 'statuses', project.project.id),
      automations.runStats(
        project.ctx,
        rows.map(r => r.id),
        new Date(now().getTime() - AUTOMATION_RUNS_RETENTION_DAYS * DAY_MS),
      ),
      organizations.findMembersByUserIds(project.ctx, [...new Set(rows.flatMap(r => [r.created_by, r.updated_by]))], {
        includeRemoved: true,
      }),
    ]);
    const ref = (id: number) => {
      const p = people.find(m => m.user.id === id);
      return p ? access.memberRef(p.user, p.membership) : null;
    };
    return rows.map(row => {
      const stat = stats.find(s => s.automation_id === row.id);
      const status = String((row.action_params as { status?: unknown }).status ?? '');
      return {
        name: row.name,
        trigger: row.trigger as AutomationTrigger,
        conditions: row.conditions as Record<string, unknown>,
        action: row.action as AutomationAction,
        action_params: row.action_params as Record<string, unknown>,
        is_enabled: row.is_enabled,
        position: row.position,
        sentence: sentence(row),
        status_missing: !findStatus(statuses, status),
        last_run_at: stat?.last_run_at ? new Date(stat.last_run_at).toISOString() : null,
        runs: stat?.runs ?? 0,
        created_by: ref(row.created_by),
        updated_by: ref(row.updated_by),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    });
  }

  async function checked(
    project: ProjectAccess,
    input: { trigger: AutomationTrigger; conditions: unknown; action: AutomationAction; action_params: unknown },
  ) {
    const conditions = validateConditions(input.trigger, input.conditions);
    const params = validateAction(input.action, input.action_params);
    const statuses = await schema.list(project.ctx, 'statuses', project.project.id);
    const status = findStatus(statuses, params.status);
    if (!status) {
      throw new AppError(
        'automation.status_missing',
        422,
        { key: project.project.key, status: params.status },
        'action_params',
      );
    }
    return { conditions, action_params: { status: status.name } };
  }

  async function recordChange(
    project: ProjectAccess,
    principal: Principal,
    verb: 'created' | 'updated' | 'deleted',
    name: string,
  ) {
    await deps.inTransaction(r =>
      r.activity.record(project.ctx, {
        actor_id: principal.userId,
        kind: 'automation_changed',
        target_type: 'project',
        target_id: String(project.project.id),
        old_value: null,
        new_value: { project: project.project.key, automation: name, change: verb },
        ip: null,
      }),
    );
  }

  /** Whether the rule's conditions hold for the issue now: live state, not the event's snapshot. */
  async function conditionsHold(
    ctx: TenantContext,
    rule: AutomationRow,
    issue: IssueRow,
    status: WorkflowStatusRow,
    facts: FiringFacts,
  ): Promise<boolean> {
    const trigger = rule.trigger as AutomationTrigger;
    const c = { ...CONDITION_DEFAULTS[trigger], ...(rule.conditions as Record<string, unknown>) };
    if (
      Array.isArray(c['issue_status_category']) &&
      !(c['issue_status_category'] as StatusCategory[]).includes(status.category as StatusCategory)
    ) {
      return false;
    }
    if (Array.isArray(c['issue_type'])) {
      const types = await schema.list(ctx, 'types', issue.project_id);
      const type = types.find(t => t.id === issue.type_id)?.name.toLowerCase();
      if (!(c['issue_type'] as string[]).some(n => n.toLowerCase() === type)) return false;
    }
    if (c['to_default_branch'] === true && facts.to_default_branch === false) return false;
    if (trigger === 'git.commit_pushed' && c['intent'] === 'closes' && facts.intent && facts.intent !== 'closes')
      return false;
    if (trigger === 'git.pull_request_merged' && facts.intent && !(c['intent'] as string[]).includes(facts.intent))
      return false;
    if (c['draft'] === 'yes' && facts.draft === false) return false;
    if (c['draft'] === 'no' && facts.draft === true) return false;
    if (trigger === 'git.pull_request_merged' && facts.base_ref !== undefined) {
      let branches = c['base_branch'] as string[] | undefined;
      if (!branches && facts.repository_id !== undefined) {
        const repo = await repositories.findById(ctx, facts.repository_id);
        branches = repo ? (repo.merge_base_branches ?? [repo.default_branch]) : undefined;
      }
      if (branches && !branches.some(b => matchesGlob(b, facts.base_ref!))) return false;
    }
    if (c['all_linked_merged'] === true || (trigger === 'git.pull_request_closed' && c['no_other_open_prs'] === true)) {
      const live = (await links.liveForIssues(ctx, [issue.id])).filter(l => l.target_type === 'pull_request');
      const pulls = await entities.pullRequestsByIds(
        ctx,
        live.map(l => l.target_id),
      );
      const open = pulls.filter(p => p.id !== facts.pull_request_id && (p.state === 'open' || p.state === 'draft'));
      if (open.length > 0) return false;
    }
    if (typeof c['child_count_min'] === 'number' && (facts.child_count ?? 0) < c['child_count_min']) return false;
    return true;
  }

  /**
   * Evaluates the trigger's rules on one issue, in order; the first that changes it ends the
   * evaluation. Every rule looked at leaves a run, so the log says why nothing happened too.
   */
  async function evaluate(
    ctx: TenantContext,
    issueId: number,
    firing: Pick<AutomationFiring, 'trigger' | 'ref' | 'cause' | 'causedBy'>,
    facts: FiringFacts,
  ): Promise<void> {
    const issue = await issues.findById(ctx, issueId);
    if (!issue || issue.deleted_at) return;
    const rules = await automations.enabledFor(ctx, [issue.project_id], firing.trigger);
    if (rules.length === 0) return;
    const project = await projects.findById(ctx, issue.project_id);
    const statuses = await schema.list(ctx, 'statuses', issue.project_id);
    const record = (rule: AutomationRow, result: AutomationRunResult, reason: AutomationSkipReason | null) =>
      automations.recordRun(ctx, {
        automation_id: rule.id,
        issue_id: issue.id,
        trigger_ref: { ...firing.ref, cause: firing.cause },
        caused_by: firing.causedBy,
        result,
        reason,
        changes: null,
      });

    /** One rule on the issue: `true` once the evaluation is over (it changed the issue, or the issue is gone). */
    async function consider(rule: AutomationRow): Promise<boolean> {
      if (!project || project.is_archived) {
        await record(rule, 'skipped', 'archived_project');
        return false;
      }
      const current = statuses.find(s => s.id === issue!.status_id)!;
      if (!(await conditionsHold(ctx, rule, issue!, current, facts))) {
        await record(rule, 'skipped', 'condition_not_met');
        return false;
      }
      const target = findStatus(statuses, String((rule.action_params as { status?: unknown }).status ?? ''));
      if (!target) {
        await record(rule, 'skipped', 'status_missing');
        return false;
      }
      if (target.id === issue!.status_id) {
        await record(rule, 'skipped', 'already_in_status');
        return false;
      }
      const outcome = await setStatus(ctx, rule, issueId, statuses, target, firing, facts);
      if (outcome === 'applied') {
        deps.analytics.capture('automation_run', { trigger: firing.trigger, result: 'applied' }, { orgId: ctx.orgId });
        return true;
      }
      if (outcome === 'gone') return true;
      await record(rule, 'skipped', outcome === 'stale' ? 'condition_not_met' : 'already_in_status');
      return false;
    }

    for (const rule of rules) {
      try {
        if (await consider(rule)) return;
      } catch (error) {
        // The status write rolled back; the run log says the rule failed rather than staying silent.
        deps.analytics.captureException(error, { org_id: ctx.orgId });
        deps.analytics.capture('automation_run', { trigger: firing.trigger, result: 'failed' }, { orgId: ctx.orgId });
        await record(rule, 'failed', null).catch(() => undefined);
        return;
      }
    }
  }

  /** One issue's evaluation; a failure is logged as a `failed` run and never undoes the event that fired it. */
  async function evaluateSafely(
    ctx: TenantContext,
    issueId: number,
    firing: Pick<AutomationFiring, 'trigger' | 'ref' | 'cause' | 'causedBy'>,
    facts: FiringFacts,
  ): Promise<void> {
    try {
      await evaluate(ctx, issueId, firing, facts);
    } catch (error) {
      deps.analytics.captureException(error, { org_id: ctx.orgId });
      deps.analytics.capture('automation_run', { trigger: firing.trigger, result: 'failed' }, { orgId: ctx.orgId });
    }
  }

  /** The one write an automation makes: the issue's status, as the system, never as a person. */
  async function setStatus(
    ctx: TenantContext,
    rule: AutomationRow,
    issueId: number,
    statuses: readonly WorkflowStatusRow[],
    target: WorkflowStatusRow,
    firing: Pick<AutomationFiring, 'ref' | 'cause' | 'causedBy'>,
    facts: FiringFacts,
  ): Promise<'applied' | 'already' | 'gone' | 'stale'> {
    const at = now();
    return deps.inTransaction(async r => {
      const current = await r.issues.lockById(ctx, issueId);
      // Deleted or moved to another project since it was read: these statuses are not its own.
      if (!current || current.deleted_at || current.project_id !== target.project_id) return 'gone';
      if (current.status_id === target.id) return 'already';
      const before = statuses.find(s => s.id === current.status_id);
      if (!before) return 'gone';
      // What was read before the lock may have changed: the rule is judged again on the locked issue.
      const [live, project] = await Promise.all([
        r.automations.findById(ctx, rule.id),
        r.projects.findById(ctx, current.project_id),
      ]);
      if (!live?.is_enabled || !project || project.is_archived) return 'stale';
      if (!(await conditionsHold(ctx, live, current, before, facts))) return 'stale';
      const changes = { status: { from: before.name, to: target.name } };
      const run = await r.automations.recordRun(ctx, {
        automation_id: rule.id,
        issue_id: issueId,
        trigger_ref: { ...firing.ref, cause: firing.cause },
        caused_by: firing.causedBy,
        result: 'applied',
        reason: null,
        changes,
      });
      const resolved = (s: WorkflowStatusRow) => s.category === 'done' || s.category === 'cancelled';
      await r.issues.update(ctx, issueId, {
        status_id: target.id,
        ...(resolved(target) && !resolved(before) ? { resolved_at: at } : {}),
        ...(!resolved(target) && resolved(before) ? { resolved_at: null } : {}),
        last_automation_at: at,
        updated_at: at,
      });
      recordIssueTouched(ctx.orgId, issueId, at);
      await r.issueActivity.record(ctx, {
        issue_id: issueId,
        actor_id: null,
        automation_run_id: run.id,
        change_group_id: Bun.randomUUIDv7(),
        kind: 'field_changed',
        field: 'status',
        old_value: { name: before.name },
        new_value: { name: target.name, automation: rule.name, cause: firing.cause },
        created_at: at,
        updated_at: at,
      });
      return 'applied' as const;
    });
  }

  return {
    /**
     * Runs a trigger's rules for each issue it fired on. Called after the change that fired it has
     * committed; a change an automation makes fires nothing (depth one).
     */
    async fire(ctx: TenantContext, firing: AutomationFiring): Promise<void> {
      for (const { issueId, facts } of firing.issues) await evaluateSafely(ctx, issueId, firing, facts);
    },

    /** After a person resolves a subtask: when it was the parent's last open one, the parent's rules run. */
    async childResolved(
      ctx: TenantContext,
      child: Pick<IssueRow, 'parent_id' | 'project_id'>,
      keyOf: (n: number) => string,
    ): Promise<void> {
      if (child.parent_id === null) return;
      const progress = (await issues.subtaskProgress(ctx, [child.parent_id])).get(child.parent_id);
      if (!progress || progress.total === 0 || progress.resolved < progress.total) return;
      const parent = await issues.findById(ctx, child.parent_id);
      if (!parent) return;
      const key = keyOf(parent.key_number);
      await this.fire(ctx, {
        trigger: 'issue.children_resolved',
        issues: [{ issueId: parent.id, facts: { child_count: progress.total } }],
        ref: { issue: key },
        cause: t('automation.cause.children', { issue: key }),
        causedBy: null,
      });
    },

    catalogue,

    async list(principal: Principal, key: string, hints: OrgHints = {}): Promise<Automation[]> {
      const project = await readable(principal, key, hints);
      return toDtos(project, await automations.listForProject(project.ctx, project.project.id));
    },

    async get(principal: Principal, key: string, name: string, hints: OrgHints = {}): Promise<Automation> {
      const project = await readable(principal, key, hints);
      return (await toDtos(project, [await find(project, name)]))[0]!;
    },

    async templates(principal: Principal, key: string, hints: OrgHints = {}): Promise<AutomationTemplate[]> {
      const project = await readable(principal, key, hints);
      const statuses = await schema.list(project.ctx, 'statuses', project.project.id);
      return templates(
        statuses.filter(s => !s.is_archived).map(s => ({ name: s.name, category: s.category as StatusCategory })),
      );
    },

    async create(
      principal: Principal,
      key: string,
      input: CreateAutomation,
      hints: OrgHints = {},
    ): Promise<Automation> {
      const project = await manageable(principal, key, hints);
      const limit = planLimits(project.organization.plan as OrgPlan).automations_per_project;
      const count = await automations.countForProject(project.ctx, project.project.id);
      if (limit !== null && count >= limit) throw new AppError('automation.limit_reached', 409, { limit });
      const valid = await checked(project, input);
      const name = (input.name ?? sentenceOf(input.trigger, valid.conditions, input.action, valid.action_params)).slice(
        0,
        100,
      );
      checkName(name);
      if (await automations.findByName(project.ctx, project.project.id, name)) {
        throw new AppError('automation.name_taken', 409, { key: project.project.key, name }, 'name');
      }
      const at = now();
      const row = await automations.insert(project.ctx, {
        project_id: project.project.id,
        name,
        trigger: input.trigger,
        conditions: valid.conditions,
        action: input.action,
        action_params: valid.action_params,
        is_enabled: input.is_enabled,
        position: input.position ?? count,
        created_by: principal.userId,
        updated_by: principal.userId,
        created_at: at,
        updated_at: at,
      });
      await recordChange(project, principal, 'created', name);
      deps.analytics.capture(
        'automation_created',
        { trigger: input.trigger, action: input.action },
        { userId: principal.userId, orgId: project.ctx.orgId },
      );
      return (await toDtos(project, [row]))[0]!;
    },

    async update(
      principal: Principal,
      key: string,
      name: string,
      input: UpdateAutomation,
      hints: OrgHints = {},
    ): Promise<Automation> {
      const project = await manageable(principal, key, hints);
      const row = await find(project, name);
      const trigger = input.trigger ?? (row.trigger as AutomationTrigger);
      const action = input.action ?? (row.action as AutomationAction);
      const valid =
        input.trigger || input.conditions || input.action || input.action_params
          ? await checked(project, {
              trigger,
              action,
              conditions: input.conditions ?? (input.trigger ? {} : row.conditions),
              action_params: input.action_params ?? row.action_params,
            })
          : null;
      if (input.name) checkName(input.name);
      if (input.name && input.name.toLowerCase() !== row.name.toLowerCase()) {
        if (await automations.findByName(project.ctx, project.project.id, input.name)) {
          throw new AppError('automation.name_taken', 409, { key: project.project.key, name: input.name }, 'name');
        }
      }
      const updated = await automations.update(project.ctx, row.id, {
        ...(input.name ? { name: input.name } : {}),
        ...(input.trigger ? { trigger } : {}),
        ...(input.action ? { action } : {}),
        ...(valid ? { conditions: valid.conditions, action_params: valid.action_params } : {}),
        ...(input.is_enabled === undefined ? {} : { is_enabled: input.is_enabled }),
        ...(input.position === undefined ? {} : { position: input.position }),
        updated_by: principal.userId,
        updated_at: now(),
      });
      await recordChange(project, principal, 'updated', updated!.name);
      return (await toDtos(project, [updated!]))[0]!;
    },

    async remove(principal: Principal, key: string, name: string, hints: OrgHints = {}): Promise<Automation[]> {
      const project = await manageable(principal, key, hints);
      const row = await find(project, name);
      await automations.remove(project.ctx, row.id);
      await recordChange(project, principal, 'deleted', row.name);
      return toDtos(project, await automations.listForProject(project.ctx, project.project.id));
    },

    /** What the rule would do to the issue now, were its trigger to fire with an event that fits it. Writes nothing. */
    async test(
      principal: Principal,
      key: string,
      name: string,
      issueKey: string,
      hints: OrgHints = {},
    ): Promise<AutomationTestResult> {
      const project = await readable(principal, key, hints);
      access.require(principal, 'project.automations.manage', project.scope);
      const rule = await find(project, name);
      const parsed = parseIssueKey(issueKey);
      const issue =
        parsed && parsed.projectKey === project.project.key
          ? await issues.findByNumber(project.ctx, project.project.id, parsed.number)
          : undefined;
      if (!issue) throw new AppError('issue.not_found', 404, { key: issueKey }, 'issue');
      const statuses = await schema.list(project.ctx, 'statuses', project.project.id);
      const answer = (
        result: AutomationTestResult['result'],
        reason: AutomationSkipReason | null,
        changes: Record<string, unknown> | null,
      ) => ({
        result,
        reason,
        changes,
        sentence: sentence(rule),
      });
      if (project.project.is_archived) return answer('would_skip', 'archived_project', null);
      const progress = (await issues.subtaskProgress(project.ctx, [issue.id])).get(issue.id);
      const current = statuses.find(s => s.id === issue.status_id)!;
      // The event that "fits" is one of the issue's own open pull requests merging or closing.
      const live = (await links.liveForIssues(project.ctx, [issue.id])).filter(l => l.target_type === 'pull_request');
      const firing = (
        await entities.pullRequestsByIds(
          project.ctx,
          live.map(l => l.target_id),
        )
      ).find(p => p.state === 'open' || p.state === 'draft');
      const facts: FiringFacts = {
        child_count: progress?.total ?? 0,
        ...(firing ? { pull_request_id: firing.id } : {}),
      };
      if (!(await conditionsHold(project.ctx, rule, issue, current, facts))) {
        return answer('would_skip', 'condition_not_met', null);
      }
      const target = findStatus(statuses, String((rule.action_params as { status?: unknown }).status ?? ''));
      if (!target) return answer('would_skip', 'status_missing', null);
      if (target.id === issue.status_id) return answer('would_skip', 'already_in_status', null);
      return answer('would_apply', null, { status: { from: current.name, to: target.name } });
    },

    async runs(
      principal: Principal,
      key: string,
      query: AutomationRunsQuery & { automation?: string | undefined },
      hints: OrgHints = {},
    ): Promise<{ data: AutomationRun[]; total: number }> {
      const project = await readable(principal, key, hints);
      const rules = query.automation
        ? [await find(project, query.automation)]
        : await automations.listForProject(project.ctx, project.project.id);
      let issueId: number | undefined;
      if (query.issue) {
        const parsed = parseIssueKey(query.issue);
        const issue =
          parsed && parsed.projectKey === project.project.key
            ? await issues.findByNumber(project.ctx, project.project.id, parsed.number, { includeDeleted: true })
            : undefined;
        if (!issue) throw new AppError('issue.not_found', 404, { key: query.issue }, 'issue');
        issueId = issue.id;
      }
      const { rows, total } = await automations.listRuns(
        project.ctx,
        { automationIds: rules.map(r => r.id), ...(issueId === undefined ? {} : { issueId }) },
        { limit: query.limit, offset: query.offset },
      );
      const numbers = new Map(
        (await links.issuesByIds(project.ctx, [...new Set(rows.map(r => r.issue_id))])).map(i => [i.id, i.key_number]),
      );
      return {
        data: rows.map(r => ({
          id: r.id,
          automation: rules.find(rule => rule.id === r.automation_id)?.name ?? '',
          issue: formatIssueKey(project.project.key, numbers.get(r.issue_id) ?? 0),
          result: r.result as AutomationRunResult,
          reason: r.reason as AutomationSkipReason | null,
          changes: r.changes as Record<string, unknown> | null,
          cause: String((r.trigger_ref as { cause?: unknown }).cause ?? ''),
          trigger_ref: r.trigger_ref as Record<string, unknown>,
          created_at: r.created_at.toISOString(),
        })),
        total,
      };
    },

    async purge(at = now()): Promise<number> {
      const before = new Date(at.getTime() - AUTOMATION_RUNS_RETENTION_DAYS * DAY_MS);
      let total = 0;
      for (;;) {
        const n = await automations.purgeRuns(
          systemContext('automation runs retention spans every organisation'),
          before,
          5_000,
        );
        total += n;
        if (n < 5_000) return total;
      }
    },
  };
}

export type AutomationsService = ReturnType<typeof automationsService>;
