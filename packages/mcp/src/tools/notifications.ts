import { z } from 'zod';
import {
  NOTIFICATION_KINDS,
  type NotificationArea,
  type MarkedRead,
  type Notification,
  type NotificationEmail,
  type NotificationGroup,
  type NotificationKind,
  type NotificationPreferences,
  type UnreadCount,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { code, instant, join, moreByCursor, table } from '../render.ts';
import { defineTool } from '../tool.ts';
import { article, articleSlug, commentTarget } from './articles.ts';

const kind = z.enum(NOTIFICATION_KINDS);
const kinds = (what: string) => z.array(kind).min(1).max(NOTIFICATION_KINDS.length).describe(what);
const projectKey = (key: string) => key.trim().toUpperCase();

const subjectCell = (g: NotificationGroup) => {
  const s = g.subject;
  if (s.type === 'issue') return `${code(s.key)} ${s.title}`;
  if (s.type === 'article') return `${s.title} (${code(`${s.project.key}/${s.slug}`)})`;
  return `Sprint ${s.name} (${code(s.project.key)})`;
};

const read = (n: Notification) => (n.read_at ? '' : '●');

export const listNotifications = defineTool({
  name: 'list_notifications',
  title: 'List notifications',
  description:
    'Your inbox across every organisation you belong to: one row per issue or article (twelve changes to one issue are one entry), newest first, with what happened and how much is unread. Name an issue, or a project and article, to see all of its notifications. Filter by kind, project, organisation or unread. A change arrives ten minutes after it was made, as it settled: a correction inside that window is one notification, and a change undone is none. Reading marks nothing read. Needs issues:read.',
  input: z.strictObject({
    unread_only: z.boolean().optional().describe('Only entries with something unread.'),
    kind: kinds('Only these kinds, e.g. ["mentioned", "assigned"].').optional(),
    project: arg.project.optional(),
    issue: arg.issue.optional().describe('One issue\'s notifications, e.g. "PP-12".'),
    article: article.optional().describe("One article's notifications; needs project."),
    org: arg.org,
    limit: arg.limit,
    cursor: arg.cursor,
  }),
  kind: 'read',
  endpoints: [
    'GET /v1/notifications',
    'GET /v1/notifications/unread-count',
    'GET /v1/issues/{key}/notifications',
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}/notifications',
  ],
  async run(ctx, args) {
    const zone = await ctx.timeZone();
    const limit = args.limit ?? arg.DEFAULT_LIMIT;
    const scope = args.org ? { org: args.org } : {};
    if (args.issue || args.article) {
      const target = await commentTarget(ctx, args);
      const res = await ctx.api.get<Notification[]>(`${target.base}/notifications`, {
        ...scope,
        query: { limit, cursor: args.cursor, unread: args.unread_only ? true : undefined, org: args.org },
      });
      return {
        markdown: join(
          `**Notifications on ${target.label}** — ${res.pagination?.total ?? res.data.length}`,
          res.data.length
            ? table(
                ['', 'When', 'Kind', 'What happened'],
                res.data.map(n => [read(n), instant(n.created_at, zone), n.kind, n.summary]),
              )
            : 'Nothing yet.',
          moreByCursor(res.pagination, res.data.length),
        ),
      };
    }
    const res = await ctx.api.get<NotificationGroup[]>('/v1/notifications', {
      query: {
        limit,
        cursor: args.cursor,
        unread: args.unread_only ? true : undefined,
        kind: args.kind?.join(','),
        project: args.project ? projectKey(args.project) : undefined,
        org: args.org,
      },
    });
    const { data: unread } = await ctx.api.get<UnreadCount>('/v1/notifications/unread-count');
    const orgs = new Set(res.data.map(g => g.subject.organization.slug));
    const perOrg =
      unread.organizations.length > 1
        ? ` (${unread.organizations.map(o => `${code(o.slug)} ${o.count}`).join(', ')})`
        : '';
    const rows = res.data.map(g => {
      const lines = g.notifications.slice(0, 3).map(n => n.summary);
      if (g.count > lines.length) lines.push(`+${g.count - lines.length} more`);
      return [
        ...(orgs.size > 1 ? [code(g.subject.organization.slug)] : []),
        subjectCell(g),
        instant(g.latest_at, zone),
        g.unread_count ? `${g.unread_count} of ${g.count}` : `0 of ${g.count}`,
        lines.join('; '),
      ];
    });
    return {
      markdown: join(
        `**Inbox** — ${res.pagination?.total ?? res.data.length} entries; ${unread.count} with something unread${perOrg}`,
        rows.length
          ? table([...(orgs.size > 1 ? ['Org'] : []), 'About', 'Latest', 'Unread', 'What happened'], rows)
          : 'Nothing here.',
        moreByCursor(res.pagination, res.data.length),
      ),
    };
  },
});

export const markNotificationsRead = defineTool({
  name: 'mark_notifications_read',
  title: 'Mark notifications read',
  description:
    'Marks notifications read: every one on the issues or articles named, or with all: true everything matching kind, project and org (the inbox\'s "Mark all read"). Returns how many changed and what is still unread. Needs a token with issues:write.',
  input: z.strictObject({
    issues: z.array(arg.issue).min(1).max(100).optional().describe('Issue keys, e.g. ["PP-12"].'),
    project: arg.project.optional().describe("With article, the article's project; with all, only this project."),
    article: article.optional(),
    all: z.boolean().optional().describe('Everything matching kind, project and org.'),
    kind: kinds('With all: only these kinds.').optional(),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/notifications/read', 'GET /v1/projects/{key}/articles'],
  async run(ctx, args) {
    const key = args.project ? projectKey(args.project) : undefined;
    const slug = args.article && key ? await articleSlug(ctx, key, args.article, args.org) : undefined;
    const { data } = await ctx.api.send<MarkedRead>('POST', '/v1/notifications/read', {
      body: {
        ...(args.issues ? { issues: args.issues.map(i => i.trim().toUpperCase()) } : {}),
        ...(slug && key ? { articles: [{ project: key, slug }] } : {}),
        ...(args.all ? { all: true } : {}),
        ...(args.kind ? { kind: args.kind } : {}),
        ...(key && args.all ? { project: key } : {}),
        ...(args.org ? { org: args.org } : {}),
      },
    });
    const left = data.unread.organizations.map(o => `${code(o.slug)} ${o.count}`).join(', ');
    return {
      markdown: `Marked **${data.marked}** read. Unread entries left: ${data.unread.count}${left ? ` (${left})` : ''}.`,
    };
  },
});

const LABEL: Record<NotificationEmail, string> = {
  off: 'Off',
  instant: 'Instant',
  daily_digest: 'Daily digest',
  weekly_digest: 'Weekly digest',
};
const AREA: Record<NotificationArea, string> = {
  issues: 'Issues',
  comments: 'Comments',
  agile: 'Agile',
  knowledge_base: 'Knowledge base',
  development: 'Development',
};

function preferencesTable(p: NotificationPreferences): string {
  return table(
    ['Area', 'Kind', 'Email'],
    p.preferences.map(pref => [
      AREA[pref.area],
      `${pref.kind}${pref.most_commonly_enabled ? ' (most commonly enabled)' : ''}${pref.options.length === 1 ? ' (in-app only)' : ''}`,
      LABEL[pref.email],
    ]),
  );
}

export const getNotificationPreferences = defineTool({
  name: 'get_notification_preferences',
  title: 'Get notification preferences',
  description:
    'Your email choice for every notification kind: off, instant, daily digest (9am your time) or weekly digest (Monday 9am). In-app notifications are always on. Needs a token with issues:read.',
  input: z.strictObject({}),
  kind: 'read',
  endpoints: ['GET /v1/notifications/preferences'],
  async run(ctx) {
    const { data } = await ctx.api.get<NotificationPreferences>('/v1/notifications/preferences');
    return { markdown: join('**Notification email**', preferencesTable(data)) };
  },
});

export const setNotificationPreferences = defineTool({
  name: 'set_notification_preferences',
  title: 'Set notification preferences',
  description:
    'Chooses how each kind reaches you by email, by listing kinds under the option they get, e.g. instant: ["mentioned"], everything_else: "daily digest". all_off turns every email off first. Kinds not named keep their choice; reaction is in-app only. Needs a token with issues:write.',
  input: z.strictObject({
    instant: kinds('Kinds to email at once.').optional(),
    daily_digest: kinds('Kinds for the daily digest, 9am your time.').optional(),
    weekly_digest: kinds('Kinds for the weekly digest, Monday 9am your time.').optional(),
    off: kinds('Kinds with no email.').optional(),
    everything_else: z
      .enum(['off', 'instant', 'daily_digest', 'weekly_digest'])
      .optional()
      .describe('The option for every kind not named above (reaction stays off).'),
    all_off: z.boolean().optional().describe('Turn every email off before applying the rest.'),
  }),
  kind: 'write',
  endpoints: ['GET /v1/notifications/preferences', 'PATCH /v1/notifications/preferences'],
  async run(ctx, args) {
    const email: Partial<Record<NotificationKind, NotificationEmail>> = {};
    const named = new Set<NotificationKind>();
    for (const option of ['off', 'instant', 'daily_digest', 'weekly_digest'] as const) {
      for (const k of args[option] ?? []) {
        email[k] = option;
        named.add(k);
      }
    }
    if (args.everything_else) {
      const { data } = await ctx.api.get<NotificationPreferences>('/v1/notifications/preferences');
      for (const pref of data.preferences) {
        if (named.has(pref.kind) || !pref.options.includes(args.everything_else)) continue;
        email[pref.kind] = args.everything_else;
      }
    }
    const { data } = await ctx.api.send<NotificationPreferences>('PATCH', '/v1/notifications/preferences', {
      body: { ...(args.all_off ? { all: 'off' } : {}), email },
    });
    return { markdown: join('**Notification email updated**', preferencesTable(data)) };
  },
});
