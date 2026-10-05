import type {
  MarkedRead,
  MarkNotificationsRead,
  Notification,
  NotificationFacets,
  NotificationGroup,
  NotificationKind,
  NotificationPreferences,
  Unsubscribe,
  UnreadCount,
  UpdateNotificationPreferences,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

export interface InboxFilter {
  kind?: readonly NotificationKind[];
  project?: string;
  org?: string;
  unread?: boolean;
}

export interface InboxQuery extends InboxFilter {
  cursor?: string;
  limit?: number;
}

/** What a "show all" list is keyed and fetched by: an issue or an article, in its organisation. */
export type NotificationSubjectRef =
  { type: 'issue'; org: string; key: string } | { type: 'article'; org: string; project: string; slug: string };

export const listNotifications = ({ kind, unread, ...rest }: InboxQuery = {}) =>
  api.get<NotificationGroup[]>('/v1/notifications', {
    query: { ...rest, kind: kind?.length ? kind.join(',') : undefined, unread: unread ? 'true' : undefined },
  });

export const listSubjectNotifications = (subject: NotificationSubjectRef, cursor?: string) =>
  api.get<Notification[]>(
    subject.type === 'issue'
      ? `/v1/issues/${encodeURIComponent(subject.key)}/notifications`
      : `/v1/projects/${encodeURIComponent(subject.project)}/articles/${encodeURIComponent(subject.slug)}/notifications`,
    { query: { org: subject.org, cursor } },
  );

export const getNotificationFacets = () => api.get<NotificationFacets>('/v1/notifications/facets');

export const getUnreadCount = () => api.get<UnreadCount>('/v1/notifications/unread-count');

export const markNotificationsRead = (body: MarkNotificationsRead) =>
  api.post<MarkedRead>('/v1/notifications/read', { body });

export const getNotificationPreferences = () => api.get<NotificationPreferences>('/v1/notifications/preferences');

export const updateNotificationPreferences = (body: UpdateNotificationPreferences) =>
  api.patch<NotificationPreferences>('/v1/notifications/preferences', { body });

export const previewUnsubscribe = (token: string) =>
  api.get<Unsubscribe>('/v1/notifications/unsubscribe', { query: { token } });

export const applyUnsubscribe = (token: string) =>
  api.post<Unsubscribe>('/v1/notifications/unsubscribe', { query: { token } });
