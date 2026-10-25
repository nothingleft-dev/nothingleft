import type { Analytics } from '@nothingleft/analytics';
import { addCalendarDays, parseIssueKey } from '@nothingleft/format';
import { clockInZone, dateInZone } from '@nothingleft/query';
import {
  systemContext,
  tenantContext,
  type ArticlesRepository,
  type AutomationsRepository,
  type GitEntitiesRepository,
  type GitLinksRepository,
  type GitRepositoriesRepository,
  type InboxOrg,
  type CommentsRepository,
  type IssueActivityRepository,
  type IssueActivityRow,
  type IssuesRepository,
  type NotificationRecipient,
  type NotificationRow,
  type NotificationsRepository,
  type OrganizationsRepository,
  type ProjectSchemaRepository,
  type ProjectsRepository,
  type SprintsRepository,
  type TenantContext,
} from '@nothingleft/db';
import {
  ACTIVITY_COALESCE_WINDOW_MS,
  DIGEST_CADENCES,
  DIGEST_LOCAL_HOUR,
  DIGEST_WEEKLY_DAY,
  NOTIFICATION_FANOUT_DELAY_MS,
  NOTIFICATION_IN_APP_ONLY_KINDS,
  NOTIFICATIONS_READ_RETENTION_DAYS,
  NOTIFICATIONS_UNREAD_RETENTION_DAYS,
  type DigestCadence,
  type OrgRole,
  type Principal,
  type IssueLinkSnapshot,
  type NotificationDetail,
  type NotificationKind,
} from '@nothingleft/types';
import { DUE_OVERDUE_GRACE_DAYS } from '@config/constants';
import type { Mailer } from '@lib/email';
import type { FanoutJob, JobQueue } from '@lib/jobs';
import { inboxOrg } from '@services/inbox-scope';
import { digestMessage, instantMessage, type MailLinks } from '@services/notification-mail';
import { isResolvedCategory } from '@services/project-schema.service';

export interface FanoutDeps {
  notifications: NotificationsRepository;
  issueActivity: IssueActivityRepository;
  issues: IssuesRepository;
  comments: CommentsRepository;
  articles: ArticlesRepository;
  sprints: SprintsRepository;
  projects: ProjectsRepository;
  schema: ProjectSchemaRepository;
  organizations: OrganizationsRepository;
  automations: AutomationsRepository;
  gitLinks: GitLinksRepository;
  gitEntities: GitEntitiesRepository;
  gitRepositories: GitRepositoriesRepository;
  queue: () => JobQueue;
  mailer: Mailer;
  analytics: Analytics;
  links: MailLinks;
}

/** Someone who may hear about an event, before the checks that they still can. */
interface Candidate {
  user_id: number;
  kind: NotificationKind;
  project_id: number;
  dedupe_key: string;
  /** What happened; someone in several recipient sets for one event gets one row. Defaults to the dedupe key. */
  event?: string;
  actor_id: number | null;
  /** The person whose git action made an automation change it: they did it, so they are not told. */
  exclude?: number | null;
  payload: NotificationDetail;
  issue_id?: number;
  comment_id?: number;
  article_id?: number;
  sprint_id?: number;
}

const DAY_MS = 86_400_000;
const sys = systemContext('notification jobs have no actor and span every organisation');
const IN_APP_ONLY = new Set<string>(NOTIFICATION_IN_APP_ONLY_KINDS);
// The most specific reason wins when one event reaches someone twice.
const PRIORITY: NotificationKind[] = ['assigned', 'unassigned', 'mentioned', 'resolved'];

const nameOf = (value: unknown): string | null =>
  value && typeof value === 'object' && 'name' in value ? String((value as { name: unknown }).name) : null;
const listOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const fieldOf = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
const idIn = (value: unknown, key: string): number | null => {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  return typeof v === 'number' ? v : null;
};

function safeClock(now: Date, timezone: string) {
  try {
    return { ...clockInZone(now, timezone), today: dateInZone(now, timezone) };
  } catch {
    return { ...clockInZone(now, 'UTC'), today: dateInZone(now, 'UTC') };
  }
}

export function notificationFanout(deps: FanoutDeps) {
  const { notifications, issueActivity, issues, comments, articles, sprints, projects, schema, organizations } = deps;

  /** Who among `userIds` can open the project an issue key names; a key that no longer resolves names nobody. */
  async function openersOf(
    ctx: TenantContext,
    key: string | null,
    subjectProjectId: number,
    userIds: number[],
  ): Promise<ReadonlySet<number>> {
    const parsed = key ? parseIssueKey(key) : null;
    const project = parsed ? await projects.findByKey(ctx, parsed.projectKey) : undefined;
    if (!project) return new Set();
    if (project.id === subjectProjectId) return new Set(userIds);
    return new Set((await notifications.eligibleRecipients(ctx, project.id, userIds)).map(r => r.user_id));
  }

  /** Who merged the issue's linked pull request `repo#number`, when they are a member. */
  async function mergerOf(ctx: TenantContext, issueId: number, repo: string, number: number): Promise<number | null> {
    const live = (await deps.gitLinks.liveForIssues(ctx, [issueId])).filter(l => l.target_type === 'pull_request');
    const pulls = (
      await deps.gitEntities.pullRequestsByIds(
        ctx,
        live.map(l => l.target_id),
      )
    ).filter(p => p.number === number);
    const repos = await deps.gitRepositories.findByIds(ctx, [...new Set(pulls.map(p => p.repository_id))]);
    const named = (id: number) => repos.find(r => r.id === id)?.full_name.toLowerCase() === repo.toLowerCase();
    return pulls.find(p => named(p.repository_id))?.merged_by_user_id ?? null;
  }

  /** What a recipient may open and read in one organisation, derived as the inbox derives it. */
  async function inboxOrgOf(orgId: number, userId: number): Promise<InboxOrg> {
    const principal: Principal = { via: 'session', userId, sessionId: 0, currentOrgId: orgId };
    const ctx = tenantContext(orgId, userId);
    const [membership, organization] = await Promise.all([
      organizations.findMembership(ctx, userId),
      organizations.findById(ctx),
    ]);
    if (!membership || !organization) return { ctx, projectIds: [], ownDraftProjectIds: [], adminProjectIds: [] };
    const member = { orgRole: membership.role as OrgRole, isOwner: organization.owner_user_id === userId };
    return inboxOrg(projects, principal, ctx, member);
  }

  /**
   * The checks every notification passes at the moment it is written: never the actor,
   * only live members who are not deactivated or erased and can open the project.
   * Returns the rows actually inserted, a retried run inserting nothing twice.
   */
  async function deliver(ctx: TenantContext, candidates: Candidate[]): Promise<NotificationRow[]> {
    const byProject = new Map<number, Candidate[]>();
    const seen = new Set<string>();
    const rank = (k: NotificationKind) => (PRIORITY.includes(k) ? PRIORITY.indexOf(k) : PRIORITY.length);
    const ranked = [...candidates].sort((a, b) => rank(a.kind) - rank(b.kind));
    for (const c of ranked) {
      if (c.user_id === c.actor_id || c.user_id === c.exclude) continue;
      const keys = [`${c.user_id}:${c.dedupe_key}`, `${c.user_id}:e:${c.event ?? c.dedupe_key}`];
      if (keys.some(k => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
      byProject.set(c.project_id, [...(byProject.get(c.project_id) ?? []), c]);
    }
    const recipients = new Map<number, NotificationRecipient>();
    const rows: Candidate[] = [];
    for (const [projectId, list] of byProject) {
      const eligible = await notifications.eligibleRecipients(
        ctx,
        projectId,
        list.map(c => c.user_id),
      );
      for (const r of eligible) recipients.set(r.user_id, r);
      const ok = new Set(eligible.map(r => r.user_id));
      rows.push(...list.filter(c => ok.has(c.user_id)));
    }
    const inserted = await notifications.insertMany(
      ctx,
      rows.map(c => ({
        user_id: c.user_id,
        kind: c.kind,
        project_id: c.project_id,
        issue_id: c.issue_id ?? null,
        comment_id: c.comment_id ?? null,
        article_id: c.article_id ?? null,
        sprint_id: c.sprint_id ?? null,
        actor_id: c.actor_id,
        payload: c.payload,
        dedupe_key: c.dedupe_key,
      })),
    );
    await emailInstant(ctx, inserted, recipients);
    return inserted;
  }

  /** One email per person per run, for the kinds they chose instant email for. */
  async function emailInstant(
    ctx: TenantContext,
    inserted: NotificationRow[],
    recipients: Map<number, NotificationRecipient>,
  ): Promise<void> {
    if (inserted.length === 0) return;
    const prefs = await notifications.preferences(sys, [...new Set(inserted.map(r => r.user_id))]);
    const instant = new Set(prefs.filter(p => p.email === 'instant').map(p => `${p.user_id}:${p.kind}`));
    const byUser = new Map<number, NotificationRow[]>();
    for (const row of inserted) {
      if (IN_APP_ONLY.has(row.kind) || !instant.has(`${row.user_id}:${row.kind}`)) continue;
      byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
    }
    for (const [userId, rows] of byUser) {
      const to = recipients.get(userId);
      if (!to) continue;
      const scope = {
        userId,
        orgs: [await inboxOrgOf(ctx.orgId, userId)],
      };
      const { rows: views } = await notifications.list(scope, { ids: rows.map(r => r.id) }, { limit: rows.length });
      if (views.length === 0) continue;
      await deps.mailer.send(instantMessage(deps.links, to, views.reverse()));
      deps.analytics.capture(
        'notification_email_sent',
        { kinds: [...new Set(views.map(v => v.notification.kind as NotificationKind))], count: views.length },
        { userId, orgId: ctx.orgId },
      );
    }
  }

  async function issueRun(job: Extract<FanoutJob, { type: 'issue' }>, now: Date): Promise<number> {
    const ctx = tenantContext(job.org_id);
    const issue = await issues.findById(ctx, job.issue_id);
    if (!issue || issue.deleted_at) return 0;
    const settledBefore = new Date(now.getTime() - ACTIVITY_COALESCE_WINDOW_MS);
    const rows = await issueActivity.listCreatedAfter(ctx, issue.id, new Date(job.since));
    const settled = rows.filter(r => r.created_at <= settledBefore);
    const waiting = rows.filter(r => r.created_at > settledBefore);
    if (waiting.length > 0) {
      await deps.queue().send(
        'notify.fanout',
        { ...job, since: settledBefore.toISOString() },
        {
          startAfter: new Date(waiting[0]!.created_at.getTime() + NOTIFICATION_FANOUT_DELAY_MS),
          singletonKey: `issue:${issue.id}`,
        },
      );
    }
    if (settled.length === 0) return 0;

    const base = { project_id: issue.project_id, issue_id: issue.id };
    const watchers = (await issues.listWatchers(ctx, issue.id)).map(w => w.user_id);
    const assignees = (await issues.listAssignees(ctx, [issue.id])).map(a => a.user_id);
    const candidates: Candidate[] = [...(await assignmentCandidates(ctx, settled, assignees, base))];
    const categories = new Map(
      (await schema.list(ctx, 'statuses', issue.project_id)).map(s => [s.name.toLowerCase(), s.category]),
    );
    const resolvedName = (name: string | null) =>
      name !== null && isResolvedCategory(categories.get(name.toLowerCase()) ?? '');
    const mentionsOf = async (
      type: 'issue' | 'comment' | 'work_item',
      id: number,
      row: IssueActivityRow,
      extra: Partial<Candidate> = {},
    ) =>
      (await issues.listMentionedUserIds(ctx, { type, id })).map((user_id): Candidate => ({
        ...base,
        ...extra,
        user_id,
        kind: 'mentioned',
        dedupe_key: `m:${type}:${id}`,
        event: `a:${row.id}`,
        actor_id: row.actor_id,
        payload: { source: type === 'issue' ? 'description' : type, ...(extra.payload ?? {}) },
      }));
    const runIds = settled.flatMap(r => (r.automation_run_id === null ? [] : [r.automation_run_id]));
    const causers = new Map(
      (await deps.automations.runsByIds(ctx, runIds)).map(run => [run.id, run.caused_by] as const),
    );
    const toEach = (
      users: number[],
      row: IssueActivityRow,
      kind: NotificationKind,
      payload: NotificationDetail,
      extra: Partial<Candidate> = {},
    ) =>
      users.map((user_id): Candidate => ({
        ...base,
        ...extra,
        user_id,
        kind,
        dedupe_key: extra.dedupe_key ?? `a:${row.id}`,
        actor_id: row.actor_id,
        exclude:
          extra.exclude ?? (row.automation_run_id === null ? null : (causers.get(row.automation_run_id) ?? null)),
        payload,
      }));

    for (const row of settled) {
      if (row.kind === 'created' || (row.kind === 'field_changed' && row.field === 'description')) {
        candidates.push(...(await mentionsOf('issue', issue.id, row)));
      } else if (row.kind === 'field_changed' && row.field === 'status') {
        const from = nameOf(row.old_value);
        const to = nameOf(row.new_value);
        const payload: NotificationDetail = { field: 'status', from, to };
        // Resolution is one event with one kind; the creator hears it even without watching.
        if (resolvedName(to) && !resolvedName(from)) {
          candidates.push(...toEach([...new Set([issue.created_by, ...watchers])], row, 'resolved', payload));
        } else {
          candidates.push(...toEach(watchers, row, 'status_changed', payload));
        }
      } else if (row.kind === 'commented' || row.kind === 'comment_edited') {
        const commentId = idIn(row.new_value, 'comment_id');
        if (commentId === null || (await comments.findLive(ctx, [commentId])).length === 0) continue;
        const extra = { comment_id: commentId, payload: { comment: commentId } };
        const mentioned = await mentionsOf('comment', commentId, row, extra);
        candidates.push(...mentioned);
        if (row.kind === 'commented') {
          const named = new Set(mentioned.map(m => m.user_id));
          candidates.push(
            ...toEach(
              watchers.filter(w => !named.has(w)),
              row,
              'commented',
              { comment: commentId },
              { comment_id: commentId },
            ),
          );
        }
      } else if (row.kind === 'linked') {
        const link = row.new_value as Partial<IssueLinkSnapshot> | null;
        const other = link?.issue ?? null;
        const openers = await openersOf(ctx, other, issue.project_id, watchers);
        for (const user_id of watchers) {
          candidates.push(
            ...toEach([user_id], row, 'linked', {
              link: link?.link ?? '',
              other_issue: openers.has(user_id) ? other : null,
            }),
          );
        }
      } else if (row.kind === 'git_pr_changed') {
        const repo = String(fieldOf(row.new_value, 'repo'));
        const number = Number(fieldOf(row.new_value, 'number'));
        const pullRequest = `${repo}#${number}`;
        const pullRequestTitle = String(fieldOf(row.new_value, 'title') ?? '');
        const changed = (key: string, to: string) =>
          fieldOf(row.new_value, key) === to && fieldOf(row.old_value, key) !== to;
        if (changed('state', 'merged')) {
          const merger = await mergerOf(ctx, issue.id, repo, number);
          candidates.push(
            ...toEach(
              [...new Set([...assignees, ...watchers])],
              row,
              'pull_request_merged',
              {
                pull_request: pullRequest,
                pull_request_title: pullRequestTitle,
              },
              { exclude: merger, dedupe_key: `a:${row.id}:merged` },
            ),
          );
        }
        if (changed('ci', 'failing')) {
          candidates.push(
            ...toEach(
              assignees,
              row,
              'ci_failed',
              { pull_request: pullRequest, pull_request_title: pullRequestTitle },
              { dedupe_key: `a:${row.id}:ci` },
            ),
          );
        }
      } else if (row.kind === 'time_logged' && row.new_value && !row.old_value) {
        const workItem = idIn(row.new_value, 'work_item_id');
        const minutes = idIn(row.new_value, 'minutes') ?? 0;
        const payload: NotificationDetail = { minutes, ...(workItem === null ? {} : { work_item: workItem }) };
        candidates.push(...toEach([...new Set([...watchers, ...assignees])], row, 'time_logged', payload));
        if (workItem !== null)
          candidates.push(...(await mentionsOf('work_item', workItem, row, { payload: { work_item: workItem } })));
      }
    }
    return (await deliver(ctx, candidates)).length;
  }

  /**
   * The net change in assignees over the settled rows: assign-then-correct inside the window
   * tells only the person finally assigned. An issue created in this batch starts with nobody.
   */
  async function assignmentCandidates(
    ctx: TenantContext,
    settled: IssueActivityRow[],
    current: number[],
    base: { project_id: number; issue_id: number },
  ): Promise<Candidate[]> {
    const rows = settled.filter(r => r.kind === 'field_changed' && r.field === 'assignees');
    const created = settled.find(r => r.kind === 'created');
    if (rows.length === 0 && !created) return [];
    const names = [...new Set(rows.flatMap(r => [...listOf(r.old_value), ...listOf(r.new_value)]))];
    const members = await organizations.findMembersByUsernames(ctx, names, { includeRemoved: true });
    const idOf = new Map(members.map(m => [m.membership.username.toLowerCase(), m.user.id]));
    const ids = (value: unknown) =>
      new Set(listOf(value).flatMap(n => (idOf.has(n.toLowerCase()) ? [idOf.get(n.toLowerCase())!] : [])));

    const lastTouch = new Map<number, IssueActivityRow>();
    let start: Set<number>;
    let state: Set<number>;
    if (created) {
      start = new Set();
      state = rows.length > 0 ? ids(rows[0]!.old_value) : new Set(current);
      for (const u of state) lastTouch.set(u, created);
    } else {
      start = ids(rows[0]!.old_value);
      state = new Set(start);
    }
    for (const row of rows) {
      const next = ids(row.new_value);
      for (const u of new Set([...state, ...next])) if (state.has(u) !== next.has(u)) lastTouch.set(u, row);
      state = next;
    }
    const out: Candidate[] = [];
    for (const [user_id, row] of lastTouch) {
      const now = state.has(user_id);
      if (now === start.has(user_id)) continue;
      out.push({
        ...base,
        user_id,
        kind: now ? 'assigned' : 'unassigned',
        dedupe_key: `a:${row.id}`,
        actor_id: row.actor_id,
        payload: { field: 'assignees' },
      });
    }
    return out;
  }

  async function articleRun(job: Extract<FanoutJob, { type: 'article' }>): Promise<number> {
    const ctx = tenantContext(job.org_id);
    const article = await articles.findById(ctx, job.article_id);
    // A draft is read by its author and the project's admins only, so it notifies nobody.
    if (!article || article.deleted_at || article.status !== 'published') return 0;
    const since = new Date(job.since);
    const actor = article.updated_by ?? article.created_by;
    const base = { project_id: article.project_id, article_id: article.id };
    const candidates: Candidate[] = [];
    const event = `article:${article.id}:${job.since}`;
    if (article.published_at && article.published_at > since) {
      for (const user_id of await notifications.projectMemberIds(ctx, article.project_id)) {
        candidates.push({
          ...base,
          user_id,
          kind: 'article_published',
          dedupe_key: `article_published:${article.id}:${article.published_at.getTime()}`,
          event,
          actor_id: actor,
          payload: {},
        });
      }
    } else if (article.updated_at > since) {
      for (const user_id of await notifications.articleWatcherIds(ctx, article.id)) {
        candidates.push({
          ...base,
          user_id,
          kind: 'article_updated',
          dedupe_key: `article_updated:${article.id}:${job.since}`,
          event,
          actor_id: actor,
          payload: {},
        });
      }
    }
    for (const m of await articles.mentionsOf(ctx, { type: 'article', id: article.id })) {
      candidates.push({
        ...base,
        user_id: m.mentioned_user_id,
        kind: 'mentioned',
        dedupe_key: `m:article:${article.id}`,
        event,
        actor_id: actor,
        payload: { source: 'article' },
      });
    }
    for (const m of await notifications.articleCommentMentions(ctx, article.id, since)) {
      candidates.push({
        ...base,
        user_id: m.user_id,
        kind: 'mentioned',
        comment_id: m.comment_id,
        dedupe_key: `m:comment:${m.comment_id}`,
        actor_id: m.author_id,
        payload: { source: 'comment', comment: m.comment_id },
      });
    }
    return (await deliver(ctx, candidates)).length;
  }

  async function sprintRun(job: Extract<FanoutJob, { type: 'sprint' }>): Promise<number> {
    const ctx = tenantContext(job.org_id);
    const [sprint] = await sprints.findByIds(ctx, [job.sprint_id]);
    if (!sprint) return 0;
    const candidates = job.user_ids.map((user_id): Candidate => ({
      user_id,
      kind: job.kind,
      project_id: sprint.project_id,
      sprint_id: sprint.id,
      dedupe_key: `${job.kind}:${sprint.id}`,
      actor_id: job.actor_id,
      payload: {},
    }));
    return (await deliver(ctx, candidates)).length;
  }

  return {
    async fanout(job: FanoutJob, now: Date = new Date()): Promise<number> {
      switch (job.type) {
        case 'issue':
          return issueRun(job, now);
        case 'article':
          return articleRun(job);
        case 'sprint':
          return sprintRun(job);
      }
    },

    /**
     * Hourly: `due_soon` the day before the due date, `overdue` once it has passed, each in the
     * recipient's own timezone and from 9am there, once per issue. Nothing is stamped on the issue.
     */
    async due(now: Date = new Date()): Promise<number> {
      const today = dateInZone(now, 'UTC');
      const from = addCalendarDays(today, -(DUE_OVERDUE_GRACE_DAYS + 1));
      const to = addCalendarDays(today, 2);
      let written = 0;
      for (const orgId of await notifications.orgsWithDueBetween(sys, from, to)) {
        const ctx = tenantContext(orgId);
        const candidates: Candidate[] = [];
        for (const issue of await notifications.dueBetween(ctx, from, to)) {
          const users = issue.assignee_ids.length > 0 ? issue.assignee_ids : [issue.created_by];
          for (const r of await notifications.eligibleRecipients(ctx, issue.project_id, users)) {
            const local = safeClock(now, r.timezone);
            if (local.hour < DIGEST_LOCAL_HOUR) continue;
            const kind: NotificationKind | null =
              issue.due_date === addCalendarDays(local.today, 1)
                ? 'due_soon'
                : issue.due_date < local.today &&
                    issue.due_date >= addCalendarDays(local.today, -DUE_OVERDUE_GRACE_DAYS)
                  ? 'overdue'
                  : null;
            if (!kind) continue;
            candidates.push({
              user_id: r.user_id,
              kind,
              project_id: issue.project_id,
              issue_id: issue.issue_id,
              dedupe_key: `${kind}:${issue.issue_id}`,
              actor_id: null,
              payload: { due_date: issue.due_date },
            });
          }
        }
        written += (await deliver(ctx, candidates)).length;
      }
      return written;
    },

    /** Hourly: whoever it is 9am for (Monday, for the weekly) gets what they chose, never an empty one. */
    async digest(now: Date = new Date()): Promise<number> {
      let sent = 0;
      for (const cadence of DIGEST_CADENCES) {
        const option = `${cadence}_digest` as const;
        const period = cadence === 'daily' ? DAY_MS : 7 * DAY_MS;
        for (const c of await notifications.digestCandidates(sys, option, cadence)) {
          const local = safeClock(now, c.timezone);
          if (local.hour !== DIGEST_LOCAL_HOUR) continue;
          if (cadence === 'weekly' && local.weekday !== DIGEST_WEEKLY_DAY) continue;
          const ctx = tenantContext(c.org_id, c.user_id);
          const claimedBefore = new Date(now.getTime() - period + 2 * 60 * 60 * 1000);
          if (!(await notifications.claimDigest(ctx, c.user_id, cadence, now, claimedBefore))) continue;
          sent += await sendDigest(ctx, c, cadence, option, period, now);
        }
      }
      return sent;
    },

    async purge(now: Date = new Date()): Promise<number> {
      const readBefore = new Date(now.getTime() - NOTIFICATIONS_READ_RETENTION_DAYS * DAY_MS);
      const unreadBefore = new Date(now.getTime() - NOTIFICATIONS_UNREAD_RETENTION_DAYS * DAY_MS);
      let purged = 0;
      for (const orgId of await notifications.orgsWithExpired(sys, readBefore, unreadBefore)) {
        purged += await notifications.purgeExpired(tenantContext(orgId), readBefore, unreadBefore);
      }
      return purged;
    },
  };

  async function sendDigest(
    ctx: TenantContext,
    c: Awaited<ReturnType<NotificationsRepository['digestCandidates']>>[number],
    cadence: DigestCadence,
    option: 'daily_digest' | 'weekly_digest',
    period: number,
    now: Date,
  ): Promise<number> {
    const kinds = (await notifications.preferences(sys, [c.user_id]))
      .filter(p => p.email === option)
      .map(p => p.kind as NotificationKind);
    if (kinds.length === 0) return 0;
    const floor = new Date(now.getTime() - period);
    const since = c.sent_at && c.sent_at > floor && c.sent_at < now ? c.sent_at : floor;
    const { rows } = await notifications.list(
      { userId: c.user_id, orgs: [await inboxOrgOf(ctx.orgId, c.user_id)] },
      { kinds, unread: true, createdAfter: since },
      { limit: 1000 },
    );
    if (rows.length === 0) return 0;
    const views = rows.reverse();
    await deps.mailer.send(digestMessage(deps.links, c, views[0]!.organization, cadence, kinds, views));
    deps.analytics.capture(
      'digest_sent',
      {
        cadence,
        notifications: views.length,
        projects: new Set(views.map(v => v.project.id)).size,
        kinds: new Set(views.map(v => v.notification.kind)).size,
      },
      { userId: c.user_id, orgId: ctx.orgId },
    );
    return 1;
  }
}

export type NotificationFanout = ReturnType<typeof notificationFanout>;
