import { and, eq, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Queryable } from '../client.ts';
import {
  articles,
  notification_digests,
  notification_preferences,
  notifications,
  type NewNotificationRow,
  type NotificationPreferenceRow,
  type NotificationRow,
} from '../schema/index.ts';
import { articleVisible } from '../search/article-query.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

/** One organisation the reader belongs to, and the projects in it they can open now. */
export interface InboxOrg {
  ctx: TenantContext;
  projectIds: number[];
  ownDraftProjectIds: number[];
  adminProjectIds: number[];
}

export interface InboxScope {
  userId: number;
  orgs: InboxOrg[];
}

export interface InboxFilter {
  kinds?: readonly string[] | undefined;
  unread?: boolean | undefined;
  issueId?: number | undefined;
  articleId?: number | undefined;
  createdAfter?: Date | undefined;
  ids?: readonly number[] | undefined;
}

export interface NotificationView {
  notification: NotificationRow;
  group_key: string;
  project: { id: number; key: string; name: string };
  organization: { id: number; slug: string; name: string };
  issue: { key_number: number; title: string } | null;
  article: { slug: string; title: string } | null;
  sprint: { slug: string; name: string } | null;
  actor: {
    user: {
      name: string;
      avatar_url: string | null;
      avatar_object_key: string | null;
      deactivated_at: Date | null;
      deleted_at: Date | null;
    };
    membership: { username: string; removed_at: Date | null } | null;
  } | null;
}

export interface NotificationGroupRow {
  group_key: string;
  latest_id: number;
  latest_at: Date;
  count: number;
  unread_count: number;
  kinds: string[];
}

export interface NotificationRecipient {
  user_id: number;
  email: string;
  name: string;
  timezone: string;
  username: string;
}

export interface DigestCandidate {
  user_id: number;
  org_id: number;
  email: string;
  name: string;
  timezone: string;
  sent_at: Date | null;
}

export interface DueIssue {
  issue_id: number;
  project_id: number;
  project_key: string;
  key_number: number;
  title: string;
  due_date: string;
  created_by: number;
  assignee_ids: number[];
}

const ids = (values: readonly number[]) =>
  sql.join(
    values.map(v => sql`${v}`),
    sql`, `,
  );
const texts = (values: readonly string[]) =>
  sql.join(
    values.map(v => sql`${v}`),
    sql`, `,
  );
const num = (v: unknown): number => Number(v);

const inboxArticle = alias(articles, 'a') as unknown as typeof articles;

/**
 * The rows a reader may see now: their own, in organisations they still belong to, on
 * projects they can still open, never on a trashed issue or on a draft they may not read.
 */
function visible(scope: InboxScope, filter: InboxFilter): SQL | null {
  const orgs = scope.orgs.filter(o => o.projectIds.length > 0);
  if (orgs.length === 0) return null;
  const inOrgs = sql.join(
    orgs.map(o => {
      const article = articleVisible(
        {
          orgId: o.ctx.orgId,
          userId: scope.userId,
          projectIds: o.projectIds,
          ownDraftProjectIds: o.ownDraftProjectIds,
          adminProjectIds: o.adminProjectIds,
        },
        inboxArticle,
      );
      return sql`(n.org_id = ${o.ctx.orgId} and coalesce(i.project_id, a.project_id, n.project_id) in (${ids(o.projectIds)}) and (n.article_id is null or ${article}))`;
    }),
    sql` or `,
  );
  const clauses: SQL[] = [
    sql`n.user_id = ${scope.userId}`,
    sql`(${inOrgs})`,
    sql`(n.issue_id is null or i.deleted_at is null)`,
  ];
  if (filter.kinds?.length) clauses.push(sql`n.kind in (${texts(filter.kinds)})`);
  if (filter.unread) clauses.push(sql`n.read_at is null`);
  if (filter.issueId !== undefined) clauses.push(sql`n.issue_id = ${filter.issueId}`);
  if (filter.articleId !== undefined) clauses.push(sql`n.article_id = ${filter.articleId}`);
  if (filter.ids) clauses.push(filter.ids.length ? sql`n.id in (${ids(filter.ids)})` : sql`false`);
  if (filter.createdAfter) clauses.push(sql`n.created_at > ${filter.createdAfter.toISOString()}`);
  return sql`
    select n.*,
      coalesce('i' || n.issue_id, 'a' || n.article_id, 'n' || n.id) as group_key,
      coalesce(i.project_id, a.project_id, n.project_id) as live_project_id
    from notifications n
    left join issues i on i.org_id = n.org_id and i.id = n.issue_id
    left join articles a on a.org_id = n.org_id and a.id = n.article_id
    where ${sql.join(clauses, sql` and `)}`;
}

type Raw = Record<string, unknown>;

function toView(r: Raw): NotificationView {
  return {
    notification: {
      id: num(r.id),
      org_id: num(r.org_id),
      user_id: num(r.user_id),
      kind: r.kind as string,
      project_id: r.project_id === null ? null : num(r.project_id),
      issue_id: r.issue_id === null ? null : num(r.issue_id),
      comment_id: r.comment_id === null ? null : num(r.comment_id),
      article_id: r.article_id === null ? null : num(r.article_id),
      sprint_id: r.sprint_id === null ? null : num(r.sprint_id),
      actor_id: r.actor_id === null ? null : num(r.actor_id),
      payload: r.payload,
      dedupe_key: r.dedupe_key as string,
      read_at: r.read_at === null ? null : new Date(r.read_at as string),
      created_at: new Date(r.created_at as string),
    },
    group_key: r.group_key as string,
    project: { id: num(r.live_project_id), key: r.project_key as string, name: r.project_name as string },
    organization: { id: num(r.org_id), slug: r.org_slug as string, name: r.org_name as string },
    issue: r.key_number === null ? null : { key_number: num(r.key_number), title: r.issue_title as string },
    article: r.article_slug === null ? null : { slug: r.article_slug as string, title: r.article_title as string },
    sprint: r.sprint_slug === null ? null : { slug: r.sprint_slug as string, name: r.sprint_name as string },
    actor:
      r.actor_id === null
        ? null
        : {
            user: {
              name: r.actor_name as string,
              avatar_url: (r.actor_avatar_url as string | null) ?? null,
              avatar_object_key: (r.actor_avatar_object_key as string | null) ?? null,
              deactivated_at: r.actor_deactivated_at === null ? null : new Date(r.actor_deactivated_at as string),
              deleted_at: r.actor_deleted_at === null ? null : new Date(r.actor_deleted_at as string),
            },
            membership:
              r.actor_username === null
                ? null
                : {
                    username: r.actor_username as string,
                    removed_at: r.actor_removed_at === null ? null : new Date(r.actor_removed_at as string),
                  },
          },
  };
}

// Names for everything a row points at, read live so a renamed project or moved issue reads as it is now.
const hydrate = (from: SQL) => sql`
  select v.*, p.key as project_key, p.name as project_name, o.slug as org_slug, o.name as org_name,
    i.key_number, i.title as issue_title, a.slug as article_slug, a.title as article_title,
    s.slug as sprint_slug, s.name as sprint_name,
    u.name as actor_name, u.avatar_url as actor_avatar_url, u.avatar_object_key as actor_avatar_object_key,
    u.deactivated_at as actor_deactivated_at, u.deleted_at as actor_deleted_at,
    m.username as actor_username, m.removed_at as actor_removed_at
  from (${from}) v
  join projects p on p.org_id = v.org_id and p.id = v.live_project_id
  join organizations o on o.id = v.org_id
  left join issues i on i.org_id = v.org_id and i.id = v.issue_id
  left join articles a on a.org_id = v.org_id and a.id = v.article_id
  left join sprints s on s.org_id = v.org_id and s.id = v.sprint_id
  left join users u on u.id = v.actor_id
  left join org_members m on m.org_id = v.org_id and m.user_id = v.actor_id`;

export function notificationsRepository(db: Queryable) {
  return {
    /** A retried fan-out inserts nothing twice: (user, dedupe_key) is unique. Returns only the new rows. */
    async insertMany(ctx: TenantContext, rows: Omit<NewNotificationRow, 'org_id'>[]): Promise<NotificationRow[]> {
      if (rows.length === 0) return [];
      return db
        .insert(notifications)
        .values(rows.map(r => ({ ...r, org_id: ctx.orgId })))
        .onConflictDoNothing({ target: [notifications.user_id, notifications.dedupe_key] })
        .returning();
    },

    async listGroups(
      scope: InboxScope,
      filter: InboxFilter,
      page: { limit: number; beforeId?: number | undefined },
    ): Promise<{ groups: NotificationGroupRow[]; total: number }> {
      const v = visible(scope, filter);
      if (!v) return { groups: [], total: 0 };
      const before = page.beforeId === undefined ? sql`true` : sql`g.latest_id < ${page.beforeId}`;
      const [result, total] = await Promise.all([
        db.execute<Raw>(sql`
          with v as (${v}),
          g as (
            select group_key, max(id) as latest_id, max(created_at) as latest_at, count(*)::int as count,
              (count(*) filter (where read_at is null))::int as unread_count,
              array_agg(distinct kind) as kinds
            from v group by group_key
          )
          select g.* from g where ${before}
          order by g.latest_id desc
          limit ${page.limit}`),
        this.countGroups(scope, filter),
      ]);
      return {
        total,
        groups: result.rows.map(r => ({
          group_key: r.group_key as string,
          latest_id: num(r.latest_id),
          latest_at: new Date(r.latest_at as string),
          count: num(r.count),
          unread_count: num(r.unread_count),
          kinds: r.kinds as string[],
        })),
      };
    },

    async countGroups(scope: InboxScope, filter: InboxFilter): Promise<number> {
      const v = visible(scope, filter);
      if (!v) return 0;
      const result = await db.execute<Raw>(sql`with v as (${v}) select count(distinct group_key)::int as n from v`);
      return num(result.rows[0]?.n ?? 0);
    },

    async listInGroups(
      scope: InboxScope,
      filter: InboxFilter,
      groupKeys: string[],
      perGroup: number,
    ): Promise<NotificationView[]> {
      const v = visible(scope, filter);
      if (!v || groupKeys.length === 0) return [];
      const result = await db.execute<Raw>(sql`
        with v as (${v}),
        ranked as (
          select v.*, row_number() over (partition by group_key order by id desc) as rn
          from v where group_key in (${texts(groupKeys)})
        )
        select * from (${hydrate(sql`select * from ranked where rn <= ${perGroup}`)}) x
        order by x.id desc`);
      return result.rows.map(toView);
    },

    /** One subject's notifications, or a digest's, newest first by id. */
    async list(
      scope: InboxScope,
      filter: InboxFilter,
      page: { limit: number; beforeId?: number | undefined },
    ): Promise<{ rows: NotificationView[]; total: number }> {
      const v = visible(scope, filter);
      if (!v) return { rows: [], total: 0 };
      const before = page.beforeId === undefined ? sql`true` : sql`v.id < ${page.beforeId}`;
      const [rows, total] = await Promise.all([
        db.execute<Raw>(sql`
          with v as (${v})
          select * from (${hydrate(sql`select * from v where ${before}`)}) x
          order by x.id desc limit ${page.limit}`),
        db.execute<Raw>(sql`with v as (${v}) select count(*)::int as n from v`),
      ]);
      return { rows: rows.rows.map(toView), total: num(total.rows[0]?.n ?? 0) };
    },

    /** The projects with anything in the reader's inbox, for its filter. */
    async projectsInInbox(
      scope: InboxScope,
    ): Promise<{ org_id: number; project_id: number; key: string; name: string }[]> {
      const v = visible(scope, {});
      if (!v) return [];
      const result = await db.execute<Raw>(sql`
        with v as (${v})
        select distinct p.org_id, p.id, p.key, p.name from v
        join projects p on p.org_id = v.org_id and p.id = v.live_project_id
        order by p.name, p.key`);
      return result.rows.map(r => ({
        org_id: num(r.org_id),
        project_id: num(r.id),
        key: r.key as string,
        name: r.name as string,
      }));
    },

    /** Entries with anything unread, per organisation: the header count. */
    async unreadGroupsByOrg(scope: InboxScope): Promise<Map<number, number>> {
      const v = visible(scope, { unread: true });
      if (!v) return new Map();
      const result = await db.execute<Raw>(sql`
        with v as (${v}) select org_id, count(distinct group_key)::int as n from v group by org_id`);
      return new Map(result.rows.map(r => [num(r.org_id), num(r.n)]));
    },

    async markRead(
      scope: InboxScope,
      target: {
        ids?: number[] | undefined;
        issueIds?: number[] | undefined;
        articleIds?: number[] | undefined;
        kinds?: readonly string[] | undefined;
        projectIds?: number[] | undefined;
      },
      at: Date,
    ): Promise<number> {
      const orgIds = scope.orgs.map(o => o.ctx.orgId);
      if (orgIds.length === 0) return 0;
      const subject = or(
        target.ids ? inArray(notifications.id, target.ids) : undefined,
        target.issueIds ? inArray(notifications.issue_id, target.issueIds) : undefined,
        target.articleIds ? inArray(notifications.article_id, target.articleIds) : undefined,
      );
      const rows = await db
        .update(notifications)
        .set({ read_at: at })
        .where(
          and(
            eq(notifications.user_id, scope.userId),
            inArray(notifications.org_id, orgIds),
            isNull(notifications.read_at),
            subject,
            target.kinds?.length ? inArray(notifications.kind, [...target.kinds]) : undefined,
            target.projectIds ? inArray(notifications.project_id, target.projectIds) : undefined,
          ),
        )
        .returning({ id: notifications.id });
      return rows.length;
    },

    /**
     * Who can receive a notification in this organisation: live members, not deactivated or
     * erased, who can open the project (the owner and Org Admins see every project).
     */
    async eligibleRecipients(
      ctx: TenantContext,
      projectId: number,
      userIds: readonly number[],
    ): Promise<NotificationRecipient[]> {
      if (userIds.length === 0) return [];
      const result = await db.execute<Raw>(sql`
        select u.id as user_id, u.email, u.name, u.timezone, m.username
        from org_members m
        join users u on u.id = m.user_id
        join organizations o on o.id = m.org_id
        where m.org_id = ${ctx.orgId} and m.removed_at is null
          and u.deleted_at is null and u.deactivated_at is null
          and m.user_id in (${ids([...new Set(userIds)])})
          and (o.owner_user_id = m.user_id or m.role = 'org_admin' or exists (
            select 1 from project_members pm
            where pm.org_id = m.org_id and pm.project_id = ${projectId} and pm.user_id = m.user_id))`);
      return result.rows.map(r => ({
        user_id: num(r.user_id),
        email: r.email as string,
        name: r.name as string,
        timezone: r.timezone as string,
        username: r.username as string,
      }));
    },

    /** Everyone explicitly on the project: an article's publication goes to its members. */
    async projectMemberIds(ctx: TenantContext, projectId: number): Promise<number[]> {
      const result = await db.execute<Raw>(sql`
        select pm.user_id from project_members pm
        where pm.org_id = ${ctx.orgId} and pm.project_id = ${projectId}`);
      return result.rows.map(r => num(r.user_id));
    },

    async articleWatcherIds(ctx: TenantContext, articleId: number): Promise<number[]> {
      const result = await db.execute<Raw>(sql`
        select w.user_id from article_watchers w where w.org_id = ${ctx.orgId} and w.article_id = ${articleId}`);
      return result.rows.map(r => num(r.user_id));
    },

    /** Mentions in an article's live comments written or edited after `after`, with each comment's author. */
    async articleCommentMentions(
      ctx: TenantContext,
      articleId: number,
      after: Date,
    ): Promise<{ comment_id: number; user_id: number; author_id: number }[]> {
      const result = await db.execute<Raw>(sql`
        select m.source_id as comment_id, m.mentioned_user_id as user_id, c.author_id
        from mentions m join comments c on c.org_id = m.org_id and c.id = m.source_id
        where m.org_id = ${ctx.orgId} and m.article_id = ${articleId} and m.source_type = 'comment'
          and c.deleted_at is null and (c.created_at > ${after.toISOString()} or c.edited_at > ${after.toISOString()})`);
      return result.rows.map(r => ({
        comment_id: num(r.comment_id),
        user_id: num(r.user_id),
        author_id: num(r.author_id),
      }));
    },

    // Preferences belong to the account, not to an organisation.
    async preferences(_ctx: SystemContext, userIds: readonly number[]): Promise<NotificationPreferenceRow[]> {
      if (userIds.length === 0) return [];
      return db
        .select()
        .from(notification_preferences)
        .where(inArray(notification_preferences.user_id, [...new Set(userIds)]));
    },

    async setPreferences(
      _ctx: SystemContext,
      userId: number,
      entries: { kind: string; email: string }[],
    ): Promise<void> {
      if (entries.length === 0) return;
      await db
        .insert(notification_preferences)
        .values(entries.map(e => ({ user_id: userId, kind: e.kind, email: e.email })))
        .onConflictDoUpdate({
          target: [notification_preferences.user_id, notification_preferences.kind],
          set: { email: sql`excluded.email` },
        });
    },

    /** Every live membership of anyone with a kind on this cadence, for the hourly digest run. */
    async digestCandidates(_ctx: SystemContext, option: string, cadence: string): Promise<DigestCandidate[]> {
      const result = await db.execute<Raw>(sql`
        select m.user_id, m.org_id, u.email, u.name, u.timezone, d.sent_at
        from org_members m
        join users u on u.id = m.user_id
        join organizations o on o.id = m.org_id
        left join notification_digests d on d.user_id = m.user_id and d.org_id = m.org_id and d.cadence = ${cadence}
        where m.removed_at is null and o.deleted_at is null
          and u.deleted_at is null and u.deactivated_at is null
          and exists (select 1 from notification_preferences p where p.user_id = m.user_id and p.email = ${option})`);
      return result.rows.map(r => ({
        user_id: num(r.user_id),
        org_id: num(r.org_id),
        email: r.email as string,
        name: r.name as string,
        timezone: r.timezone as string,
        sent_at: r.sent_at === null ? null : new Date(r.sent_at as string),
      }));
    },

    /** Claims this run's digest, so a restart inside the hour cannot send it twice. */
    async claimDigest(
      ctx: TenantContext,
      userId: number,
      cadence: string,
      at: Date,
      claimedBefore: Date,
    ): Promise<boolean> {
      const rows = await db
        .insert(notification_digests)
        .values({ user_id: userId, org_id: ctx.orgId, cadence, sent_at: at })
        .onConflictDoUpdate({
          target: [notification_digests.user_id, notification_digests.org_id, notification_digests.cadence],
          set: { sent_at: at },
          setWhere: lt(notification_digests.sent_at, claimedBefore),
        })
        .returning({ user_id: notification_digests.user_id });
      return rows.length > 0;
    },

    /** The due producer's one cross-tenant read: organisations with an open issue due in the range. */
    async orgsWithDueBetween(_ctx: SystemContext, from: string, to: string): Promise<number[]> {
      const result = await db.execute<Raw>(sql`
        select distinct i.org_id from issues i
        where i.deleted_at is null and i.resolved_at is null and i.due_date between ${from} and ${to}`);
      return result.rows.map(r => num(r.org_id));
    },

    async dueBetween(ctx: TenantContext, from: string, to: string): Promise<DueIssue[]> {
      const result = await db.execute<Raw>(sql`
        select i.id, i.project_id, p.key, i.key_number, i.title, i.due_date::text as due_date, i.created_by,
          coalesce((select array_agg(a.user_id) from issue_assignees a
                    where a.org_id = i.org_id and a.issue_id = i.id), '{}') as assignee_ids
        from issues i join projects p on p.org_id = i.org_id and p.id = i.project_id
        where i.org_id = ${ctx.orgId} and i.deleted_at is null and i.resolved_at is null
          and not p.is_archived and i.due_date between ${from} and ${to}`);
      return result.rows.map(r => ({
        issue_id: num(r.id),
        project_id: num(r.project_id),
        project_key: r.key as string,
        key_number: num(r.key_number),
        title: r.title as string,
        due_date: r.due_date as string,
        created_by: num(r.created_by),
        assignee_ids: (r.assignee_ids as (string | number)[]).map(num),
      }));
    },

    /** The nightly purge's one cross-tenant read. */
    async orgsWithExpired(_ctx: SystemContext, readBefore: Date, unreadBefore: Date): Promise<number[]> {
      const rows = await db
        .selectDistinct({ org_id: notifications.org_id })
        .from(notifications)
        .where(
          or(
            and(isNotNull(notifications.read_at), lt(notifications.read_at, readBefore)),
            and(isNull(notifications.read_at), lt(notifications.created_at, unreadBefore)),
          ),
        );
      return rows.map(r => r.org_id);
    },

    async purgeExpired(ctx: TenantContext, readBefore: Date, unreadBefore: Date): Promise<number> {
      const rows = await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.org_id, ctx.orgId),
            or(
              and(isNotNull(notifications.read_at), lt(notifications.read_at, readBefore)),
              and(isNull(notifications.read_at), lt(notifications.created_at, unreadBefore)),
            ),
          ),
        )
        .returning({ id: notifications.id });
      return rows.length;
    },
  };
}

export type NotificationsRepository = ReturnType<typeof notificationsRepository>;
