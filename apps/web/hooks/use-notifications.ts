'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  MarkNotificationsRead,
  Notification,
  NotificationEmail,
  NotificationGroup,
  NotificationKind,
  NotificationPreferences,
  NotificationSubject,
  SuccessEnvelope,
  UnreadCount,
} from '@nothingleft/types';
import {
  applyUnsubscribe,
  getNotificationFacets,
  getNotificationPreferences,
  getUnreadCount,
  listNotifications,
  listSubjectNotifications,
  markNotificationsRead,
  previewUnsubscribe,
  updateNotificationPreferences,
  type InboxFilter,
  type NotificationSubjectRef,
} from '@lib/api/notifications';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

type Pages<T> = InfiniteData<SuccessEnvelope<T[]>, string | undefined>;

export const INBOX_PAGE_SIZE = 25;
export const INBOX_PREVIEW_SIZE = 5;

export function useInbox(filter: InboxFilter) {
  return useInfiniteQuery<
    SuccessEnvelope<NotificationGroup[]>,
    Error,
    Pages<NotificationGroup>,
    QueryKey,
    string | undefined
  >({
    queryKey: queryKeys.inbox(filter),
    refetchInterval: POLL.list,
    queryFn: ({ pageParam }) => listNotifications({ ...filter, cursor: pageParam, limit: INBOX_PAGE_SIZE }),
    initialPageParam: undefined,
    getNextPageParam: last => last.meta.pagination?.next_cursor ?? undefined,
  });
}

/** The dashboard rail: the newest few entries, unfiltered. */
export function useInboxPreview() {
  return useQuery({
    queryKey: queryKeys.inboxPreview(),
    refetchInterval: POLL.list,
    queryFn: () => listNotifications({ limit: INBOX_PREVIEW_SIZE }).then(r => r.data),
  });
}

/** Every notification on one issue or article, past the ten an entry carries. */
export function useSubjectNotifications(subject: NotificationSubjectRef | null) {
  return useInfiniteQuery<SuccessEnvelope<Notification[]>, Error, Pages<Notification>, QueryKey, string | undefined>({
    queryKey: subject ? queryKeys.subjectNotifications(subject) : ['notifications', 'subject', 'none'],
    refetchInterval: POLL.list,
    queryFn: ({ pageParam }) => listSubjectNotifications(subject!, pageParam),
    initialPageParam: undefined,
    getNextPageParam: last => last.meta.pagination?.next_cursor ?? undefined,
    enabled: subject !== null,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.unreadCount(),
    refetchInterval: POLL.list,
    queryFn: () => getUnreadCount().then(r => r.data),
    enabled,
  });
}

export function useNotificationFacets() {
  return useQuery({
    queryKey: queryKeys.notificationFacets(),
    refetchInterval: POLL.admin,
    queryFn: () => getNotificationFacets().then(r => r.data),
  });
}

export const subjectRef = (subject: NotificationSubject): NotificationSubjectRef | null =>
  subject.type === 'issue'
    ? { type: 'issue', org: subject.organization.slug, key: subject.key }
    : subject.type === 'article'
      ? { type: 'article', org: subject.organization.slug, project: subject.project.key, slug: subject.slug }
      : null;

const subjectId = (s: NotificationSubject) =>
  `${s.organization.slug}/${s.type}/${s.project.key}/${s.type === 'issue' ? s.key : s.slug}`;

export const entryId = (group: NotificationGroup) => subjectId(group.subject);

export type MarkTarget =
  | { how: 'one'; group: NotificationGroup; notification: Notification }
  | { how: 'entry'; group: NotificationGroup }
  | { how: 'all'; filter: InboxFilter };

function requestOf(target: MarkTarget): MarkNotificationsRead {
  if (target.how === 'one') return { ids: [target.notification.id] };
  if (target.how === 'all') {
    const { kind, project, org } = target.filter;
    return { all: true, kind: kind?.length ? [...kind] : undefined, project, org };
  }
  const { subject } = target.group;
  if (subject.type === 'issue') return { issues: [subject.key], org: subject.organization.slug };
  if (subject.type === 'article') {
    return { articles: [{ project: subject.project.key, slug: subject.slug }], org: subject.organization.slug };
  }
  // A sprint event stands alone, so its own lines are the whole entry.
  return { ids: target.group.notifications.map(n => n.id) };
}

function readAt<T extends Notification>(n: T, now: string, when: (n: Notification) => boolean): T {
  return n.read_at === null && when(n) ? { ...n, read_at: now } : n;
}

function markGroup(group: NotificationGroup, target: MarkTarget, now: string): NotificationGroup {
  if (target.how === 'one') {
    if (entryId(group) !== entryId(target.group) || target.notification.read_at !== null) return group;
    return {
      ...group,
      unread_count: Math.max(0, group.unread_count - 1),
      notifications: group.notifications.map(n => readAt(n, now, x => x.id === target.notification.id)),
    };
  }
  if (target.how === 'entry') {
    if (entryId(group) !== entryId(target.group)) return group;
    return { ...group, unread_count: 0, notifications: group.notifications.map(n => readAt(n, now, () => true)) };
  }
  const { org, project, kind } = target.filter;
  if (org && group.subject.organization.slug !== org) return group;
  if (project && group.subject.project.key !== project) return group;
  const wanted = (k: NotificationKind) => !kind?.length || kind.includes(k);
  if (group.kinds.every(wanted)) {
    return { ...group, unread_count: 0, notifications: group.notifications.map(n => readAt(n, now, () => true)) };
  }
  // Only some of the entry's kinds are marked; the server's answer settles its count.
  const marked = group.notifications.filter(n => n.read_at === null && wanted(n.kind)).length;
  return {
    ...group,
    unread_count: Math.max(0, group.unread_count - marked),
    notifications: group.notifications.map(n => readAt(n, now, x => wanted(x.kind))),
  };
}

function markLine(n: Notification, target: MarkTarget, subject: NotificationSubjectRef, now: string) {
  if (target.how === 'one') return readAt(n, now, x => x.id === target.notification.id);
  if (target.how === 'entry') {
    const ref = subjectRef(target.group.subject);
    return ref && JSON.stringify(ref) === JSON.stringify(subject) ? readAt(n, now, () => true) : n;
  }
  const { org, kind } = target.filter;
  if (org && subject.org !== org) return n;
  return readAt(n, now, x => !kind?.length || kind.includes(x.kind));
}

/** The count is entries with anything unread, so it drops only when an entry empties. */
function nextUnread(count: UnreadCount, target: MarkTarget): UnreadCount {
  const drop = (slug: string): UnreadCount => ({
    count: Math.max(0, count.count - 1),
    organizations: count.organizations
      .map(o => (o.slug === slug ? { ...o, count: o.count - 1 } : o))
      .filter(o => o.count > 0),
  });
  if (target.how === 'entry')
    return target.group.unread_count > 0 ? drop(target.group.subject.organization.slug) : count;
  if (target.how === 'one') {
    const emptied = target.notification.read_at === null && target.group.unread_count === 1;
    return emptied ? drop(target.group.subject.organization.slug) : count;
  }
  const { org, project, kind } = target.filter;
  if (project || kind?.length) return count;
  if (!org) return { count: 0, organizations: [] };
  const gone = count.organizations.find(o => o.slug === org)?.count ?? 0;
  return { count: Math.max(0, count.count - gone), organizations: count.organizations.filter(o => o.slug !== org) };
}

function drawMark(client: QueryClient, target: MarkTarget) {
  const now = new Date().toISOString();
  client.setQueriesData<Pages<NotificationGroup>>({ queryKey: ['notifications', 'inbox'] }, data =>
    data ? { ...data, pages: data.pages.map(p => ({ ...p, data: p.data.map(g => markGroup(g, target, now)) })) } : data,
  );
  client.setQueryData<NotificationGroup[]>(queryKeys.inboxPreview(), rows => rows?.map(g => markGroup(g, target, now)));
  for (const [key, data] of client.getQueriesData<Pages<Notification>>({ queryKey: ['notifications', 'subject'] })) {
    const subject = key[2] as NotificationSubjectRef | 'none';
    if (!data || subject === 'none') continue;
    client.setQueryData<Pages<Notification>>(key, {
      ...data,
      pages: data.pages.map(p => ({ ...p, data: p.data.map(n => markLine(n, target, subject, now)) })),
    });
  }
  client.setQueryData<UnreadCount>(queryKeys.unreadCount(), count => (count ? nextUnread(count, target) : count));
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (target: MarkTarget) => markNotificationsRead(requestOf(target)).then(r => r.data),
    onMutate: async target => {
      await client.cancelQueries({ queryKey: queryKeys.notifications() });
      const previous = client.getQueriesData({ queryKey: queryKeys.notifications() });
      drawMark(client, target);
      return { previous };
    },
    onError: (_error, _target, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSuccess: result => client.setQueryData(queryKeys.unreadCount(), result.unread),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.notifications() }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notificationPreferences(),
    queryFn: () => getNotificationPreferences().then(r => r.data),
  });
}

export type PreferenceChange = { all: 'off' } | { email: Partial<Record<NotificationKind, NotificationEmail>> };

export function useUpdateNotificationPreferences() {
  const client = useQueryClient();
  const key = queryKeys.notificationPreferences();
  return useMutation({
    mutationFn: (change: PreferenceChange) => updateNotificationPreferences(change).then(r => r.data),
    onMutate: async change => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<NotificationPreferences>(key);
      client.setQueryData<NotificationPreferences>(
        key,
        data =>
          data && {
            preferences: data.preferences.map(p => ({
              ...p,
              email: 'all' in change ? 'off' : (change.email[p.kind] ?? p.email),
            })),
          },
      );
      return { previous };
    },
    onError: (_error, _change, context) => client.setQueryData(key, context?.previous),
    onSuccess: data => client.setQueryData(key, data),
  });
}

export function useUnsubscribePreview(token: string | null) {
  return useQuery({
    queryKey: queryKeys.unsubscribe(token ?? ''),
    queryFn: () => previewUnsubscribe(token!).then(r => r.data),
    enabled: token !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useApplyUnsubscribe(token: string) {
  return useMutation({ mutationFn: () => applyUnsubscribe(token).then(r => r.data) });
}
