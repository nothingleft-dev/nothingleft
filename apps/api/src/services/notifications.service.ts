import type { Analytics } from '@nothingleft/analytics';
import {
  systemContext,
  type InboxFilter,
  type InboxScope,
  type ArticlesRepository,
  type IssuesRepository,
  type NotificationsRepository,
  type NotificationView,
  type OrganizationsRepository,
  type ProjectsRepository,
} from '@nothingleft/db';
import {
  NOTIFICATION_EMAIL_OPTIONS,
  NOTIFICATION_GROUP_PREVIEW,
  NOTIFICATION_IN_APP_ONLY_KINDS,
  NOTIFICATION_KIND_AREAS,
  NOTIFICATION_KINDS,
  NOTIFICATION_MOST_COMMONLY_ENABLED,
  viaOf,
  type MarkedRead,
  type NotificationFacets,
  type MarkNotificationsRead,
  type Notification,
  type NotificationEmail,
  type NotificationGroup,
  type NotificationKind,
  type NotificationPreferences,
  type Pagination,
  type Principal,
  type UnreadCount,
  type Unsubscribe,
  type UpdateNotificationPreferences,
} from '@nothingleft/types';
import { parseIssueKey } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import type { AccessService } from '@services/access';
import type { ArticlesService } from '@services/articles.service';
import { articleVisibleTo } from '@services/article-visibility';
import { inboxScope } from '@services/inbox-scope';
import { decodeCursor, encodeCursor, type IssuesService } from '@services/issues.service';
import { readUnsubscribeToken } from '@services/notification-mail';
import { subjectOf, subjectPath, toNotification } from '@services/notification-render';
import { missingSelfServiceScope, type SelfServiceCapability } from '@services/permissions';
import type { OrgHints } from '@services/tenancy.service';

export interface NotificationsDeps {
  access: AccessService;
  issues: IssuesService;
  articles: () => ArticlesService;
  notifications: NotificationsRepository;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  issuesRepo: IssuesRepository;
  articlesRepo: ArticlesRepository;
  analytics: Analytics;
  linkSecret: string;
  now?: () => Date;
}

export interface InboxQuery {
  kind?: NotificationKind[] | undefined;
  project?: string | undefined;
  org?: string | undefined;
  unread?: boolean | undefined;
  limit: number;
  cursor?: string | undefined;
}

const IN_APP_ONLY = new Set<string>(NOTIFICATION_IN_APP_ONLY_KINDS);
const sys = systemContext('notification preferences belong to the account');

export function notificationsService(deps: NotificationsDeps) {
  const { access, notifications, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  function requireScope(principal: Principal, capability: SelfServiceCapability) {
    const lacking = missingSelfServiceScope(principal, capability);
    if (lacking) throw AppError.scopeMissing(lacking);
  }

  /** The reader's scope, narrowed to one organisation and one project key when asked. */
  async function scopeFor(principal: Principal, filter: { org?: string | undefined; project?: string | undefined }) {
    const { scope, orgs } = await inboxScope(deps, principal);
    let narrowed: InboxScope = scope;
    if (filter.org !== undefined) {
      const wanted = orgs.find(o => o.slug.toLowerCase() === filter.org!.toLowerCase());
      if (!wanted) {
        throw new AppError(
          'organization.not_found',
          404,
          { slug: filter.org },
          'org',
          orgs.map(o => o.slug),
        );
      }
      narrowed = { ...scope, orgs: scope.orgs.filter(o => o.ctx.orgId === wanted.orgId) };
    }
    if (filter.project !== undefined) {
      const key = filter.project.toUpperCase();
      const matches = await Promise.all(
        narrowed.orgs.map(async o => {
          const project = await deps.projects.findByKey(o.ctx, key);
          return project && o.projectIds.includes(project.id) ? { ...o, projectIds: [project.id] } : null;
        }),
      );
      const found = matches.filter(m => m !== null);
      if (found.length === 0) throw new AppError('project.not_found', 404, { key: filter.project }, 'project');
      narrowed = { ...narrowed, orgs: found };
    }
    return { scope: narrowed, orgs };
  }

  /**
   * An issue or article named with its organisation, found within the reader's inbox scope rather
   * than the session's current organisation, so an entry from any organisation can be expanded and
   * marked read. Anything the reader cannot open is absent.
   */
  async function subjectIn(
    principal: Principal,
    org: string,
    subject: { issue: string } | { project: string; slug: string },
  ): Promise<{ issueId?: number; articleId?: number }> {
    const { scope } = await scopeFor(principal, { org });
    const reach = scope.orgs[0]!;
    const { ctx, projectIds } = reach;
    if ('issue' in subject) {
      const notFound = new AppError('issue.not_found', 404, { key: subject.issue }, 'key');
      const parsed = parseIssueKey(subject.issue);
      if (!parsed) throw notFound;
      const project = await deps.projects.findByKey(ctx, parsed.projectKey);
      if (!project || !projectIds.includes(project.id)) throw notFound;
      const issue = await deps.issuesRepo.findByNumber(ctx, project.id, parsed.number);
      if (!issue) throw notFound;
      return { issueId: issue.id };
    }
    const notFound = new AppError('article.not_found', 404, { project: subject.project, slug: subject.slug }, 'slug');
    const project = await deps.projects.findByKey(ctx, subject.project.toUpperCase());
    if (!project || !projectIds.includes(project.id)) throw notFound;
    const article = await deps.articlesRepo.findLiveBySlug(ctx, project.id, subject.slug);
    if (!article || !articleVisibleTo({ ...reach, userId: principal.userId }, article)) throw notFound;
    return { articleId: article.id };
  }

  const memberRef = (actor: NonNullable<NotificationView['actor']>) => access.memberRef(actor.user, actor.membership);
  const dto = (view: NotificationView): Notification => toNotification(view, memberRef);

  async function unreadCount(principal: Principal): Promise<UnreadCount> {
    const { scope, orgs } = await inboxScope(deps, principal);
    const byOrg = await notifications.unreadGroupsByOrg(scope);
    const counts = orgs.map(o => ({ slug: o.slug, count: byOrg.get(o.orgId) ?? 0 }));
    return { count: counts.reduce((n, o) => n + o.count, 0), organizations: counts.filter(o => o.count > 0) };
  }

  const pagination = (total: number, limit: number, next: number | null): Pagination => ({
    total,
    limit,
    offset: 0,
    next_cursor: next === null ? null : encodeCursor(next),
    has_more: next !== null,
  });

  async function subjectList(
    principal: Principal,
    filter: InboxFilter,
    query: { limit: number; cursor?: string | undefined; unread?: boolean | undefined },
  ): Promise<{ data: Notification[]; pagination: Pagination }> {
    const { scope } = await inboxScope(deps, principal);
    const beforeId = query.cursor ? decodeCursor(query.cursor) : undefined;
    const { rows, total } = await notifications.list(
      scope,
      { ...filter, unread: query.unread },
      { limit: query.limit + 1, beforeId },
    );
    const page = rows.slice(0, query.limit);
    const more = rows.length > query.limit ? page[page.length - 1]!.notification.id : null;
    return { data: page.map(dto), pagination: pagination(total, query.limit, more) };
  }

  function preferencesOf(rows: { kind: string; email: string }[]): NotificationPreferences {
    const chosen = new Map(rows.map(r => [r.kind, r.email as NotificationEmail]));
    return {
      preferences: NOTIFICATION_KINDS.map(kind => ({
        kind,
        area: NOTIFICATION_KIND_AREAS[kind],
        email: chosen.get(kind) ?? 'off',
        options: IN_APP_ONLY.has(kind) ? ['off'] : [...NOTIFICATION_EMAIL_OPTIONS],
        most_commonly_enabled: kind === NOTIFICATION_MOST_COMMONLY_ENABLED,
      })),
    };
  }

  function unsubscribeTarget(token: string) {
    const read = readUnsubscribeToken(deps.linkSecret, token);
    if (!read) throw new AppError('notification.unsubscribe_invalid', 400, {}, 'token');
    return read;
  }

  async function kindsFor(userId: number, target: ReturnType<typeof unsubscribeTarget>['target']) {
    if ('kinds' in target) return target.kinds;
    const option = `${target.cadence}_digest`;
    return (await notifications.preferences(sys, [userId]))
      .filter(p => p.email === option)
      .map(p => p.kind as NotificationKind);
  }

  return {
    async list(
      principal: Principal,
      query: InboxQuery,
    ): Promise<{ data: NotificationGroup[]; pagination: Pagination }> {
      requireScope(principal, 'notification.read');
      const { scope } = await scopeFor(principal, query);
      const filter: InboxFilter = { kinds: query.kind, unread: query.unread };
      const beforeId = query.cursor ? decodeCursor(query.cursor) : undefined;
      const { groups, total } = await notifications.listGroups(scope, filter, { limit: query.limit + 1, beforeId });
      const page = groups.slice(0, query.limit);
      const views = await notifications.listInGroups(
        scope,
        filter,
        page.map(g => g.group_key),
        NOTIFICATION_GROUP_PREVIEW,
      );
      const byGroup = new Map<string, NotificationView[]>();
      for (const v of views) byGroup.set(v.group_key, [...(byGroup.get(v.group_key) ?? []), v]);
      const data = page.flatMap((g): NotificationGroup[] => {
        const rows = byGroup.get(g.group_key);
        if (!rows?.length) return [];
        const subject = subjectOf(rows[0]!);
        return [
          {
            subject,
            latest_at: g.latest_at.toISOString(),
            count: g.count,
            unread_count: g.unread_count,
            kinds: g.kinds as NotificationKind[],
            notifications: rows.map(dto),
            path: subjectPath(subject),
          },
        ];
      });
      const more = groups.length > query.limit ? page[page.length - 1]!.latest_id : null;
      return { data, pagination: pagination(total, query.limit, more) };
    },

    async listForIssue(
      principal: Principal,
      key: string,
      query: { limit: number; cursor?: string | undefined; unread?: boolean | undefined },
      hints: OrgHints = {},
      org?: string,
    ) {
      requireScope(principal, 'notification.read');
      const issueId = org
        ? (await subjectIn(principal, org, { issue: key })).issueId
        : (await deps.issues.locate(principal, key, hints)).issue.id;
      return subjectList(principal, { issueId }, query);
    },

    async listForArticle(
      principal: Principal,
      key: string,
      slug: string,
      query: { limit: number; cursor?: string | undefined; unread?: boolean | undefined },
      hints: OrgHints = {},
      org?: string,
    ) {
      requireScope(principal, 'notification.read');
      const articleId = org
        ? (await subjectIn(principal, org, { project: key, slug })).articleId
        : (await deps.articles().locate(principal, key, slug, hints)).article.id;
      return subjectList(principal, { articleId }, query);
    },

    /** The organisations the reader belongs to, and the projects with anything in their inbox. */
    async facets(principal: Principal): Promise<NotificationFacets> {
      requireScope(principal, 'notification.read');
      const { scope, orgs } = await inboxScope(deps, principal);
      const byId = new Map(orgs.map(o => [o.orgId, o]));
      return {
        organizations: orgs.map(o => ({ slug: o.slug, name: o.name })),
        projects: (await notifications.projectsInInbox(scope)).map(p => {
          const o = byId.get(p.org_id)!;
          return { key: p.key, name: p.name, organization: { slug: o.slug, name: o.name } };
        }),
      };
    },

    async unreadCount(principal: Principal): Promise<UnreadCount> {
      requireScope(principal, 'notification.read');
      return unreadCount(principal);
    },

    async markRead(principal: Principal, input: MarkNotificationsRead): Promise<MarkedRead> {
      requireScope(principal, 'notification.manage');
      if (!input.ids && !input.issues && !input.articles && !input.all) {
        throw new AppError('notification.mark_target_required', 400, {}, 'all');
      }
      const { scope } = await scopeFor(principal, { org: input.org, project: input.project });
      const org = input.org;
      const issueIds = input.issues
        ? await Promise.all(
            input.issues.map(async key =>
              org
                ? (await subjectIn(principal, org, { issue: key })).issueId!
                : (await deps.issues.locate(principal, key, {})).issue.id,
            ),
          )
        : undefined;
      const articleIds = input.articles
        ? await Promise.all(
            input.articles.map(async a =>
              org
                ? (await subjectIn(principal, org, { project: a.project, slug: a.slug })).articleId!
                : (await deps.articles().locate(principal, a.project, a.slug, {})).article.id,
            ),
          )
        : undefined;
      const projectIds = input.project ? scope.orgs.flatMap(o => o.projectIds) : undefined;
      const marked = await notifications.markRead(
        scope,
        { ids: input.ids, issueIds, articleIds, kinds: input.kind, projectIds },
        now(),
      );
      analytics.capture(
        'notifications_read',
        {
          via: viaOf(principal),
          how: input.all ? 'all' : input.ids?.length === 1 && !issueIds && !articleIds ? 'one' : 'subject',
          count: marked,
        },
        { userId: principal.userId },
      );
      return { marked, unread: await unreadCount(principal) };
    },

    async getPreferences(principal: Principal): Promise<NotificationPreferences> {
      requireScope(principal, 'notification.read');
      return preferencesOf(await notifications.preferences(sys, [principal.userId]));
    },

    async setPreferences(principal: Principal, input: UpdateNotificationPreferences): Promise<NotificationPreferences> {
      requireScope(principal, 'notification.manage');
      const entries = new Map<NotificationKind, NotificationEmail>();
      if (input.all === 'off') for (const kind of NOTIFICATION_KINDS) entries.set(kind, 'off');
      for (const [kind, email] of Object.entries(input.email ?? {}) as [NotificationKind, NotificationEmail][]) {
        if (IN_APP_ONLY.has(kind) && email !== 'off') {
          throw new AppError('notification.email_not_offered', 400, { kind }, `email.${kind}`, ['off']);
        }
        entries.set(kind, email);
      }
      await notifications.setPreferences(
        sys,
        principal.userId,
        [...entries].map(([kind, email]) => ({ kind, email })),
      );
      const result = preferencesOf(await notifications.preferences(sys, [principal.userId]));
      const count = (option: NotificationEmail) => result.preferences.filter(p => p.email === option).length;
      analytics.capture(
        'notification_preferences_changed',
        {
          via: viaOf(principal),
          all_off: input.all === 'off',
          changed: entries.size,
          instant: count('instant'),
          daily_digest: count('daily_digest'),
          weekly_digest: count('weekly_digest'),
        },
        { userId: principal.userId },
      );
      return result;
    },

    /** What an unsubscribe link would turn off, for the page that asks before it acts. */
    async previewUnsubscribe(token: string): Promise<Unsubscribe> {
      const { userId, target } = unsubscribeTarget(token);
      return {
        kinds: await kindsFor(userId, target),
        cadence: 'cadence' in target ? target.cadence : null,
        applied: false,
      };
    },

    /** One click turns off that kind's email, or every kind on a digest's cadence. Nothing else changes. */
    async unsubscribe(token: string, oneClick: boolean): Promise<Unsubscribe> {
      const { userId, target } = unsubscribeTarget(token);
      const kinds = await kindsFor(userId, target);
      await notifications.setPreferences(
        sys,
        userId,
        kinds.map(kind => ({ kind, email: 'off' })),
      );
      analytics.capture(
        'email_unsubscribed',
        {
          scope: 'cadence' in target ? `${target.cadence}_digest` : 'kind',
          ...('kinds' in target && target.kinds.length === 1 ? { kind: target.kinds[0] } : {}),
          one_click: oneClick,
        },
        { userId },
      );
      return { kinds, cadence: 'cadence' in target ? target.cadence : null, applied: true };
    },
  };
}

export type NotificationsService = ReturnType<typeof notificationsService>;
