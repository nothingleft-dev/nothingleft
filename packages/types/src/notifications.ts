import { z } from 'zod';
import {
  DIGEST_CADENCES,
  NOTIFICATION_AREAS,
  NOTIFICATION_EMAIL_OPTIONS,
  NOTIFICATION_KINDS,
  NOTIFICATIONS_MARK_MAX,
} from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

const PlaceSchema = z.object({
  project: z.object({ key: z.string(), name: z.string() }),
  organization: z.object({ slug: z.string(), name: z.string() }),
});

export const NotificationSubjectSchema = z.discriminatedUnion('type', [
  PlaceSchema.extend({ type: z.literal('issue'), key: z.string(), title: z.string() }),
  PlaceSchema.extend({ type: z.literal('article'), slug: z.string(), title: z.string() }),
  PlaceSchema.extend({ type: z.literal('sprint'), slug: z.string(), name: z.string() }),
]);
export type NotificationSubject = z.infer<typeof NotificationSubjectSchema>;

// The facts behind the summary line, as they were when the event settled. Names, never ids,
// except the comment and work item numbers every listing shows.
export const NotificationDetailSchema = z.object({
  field: z.enum(['assignees', 'status']).optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  comment: z.number().int().optional(),
  work_item: z.number().int().optional(),
  link: z.string().optional(),
  // Null when the recipient could not open the other issue's project when the notification was written.
  other_issue: z.string().nullable().optional(),
  minutes: z.number().int().optional(),
  due_date: z.string().optional(),
  source: z.enum(['description', 'comment', 'work_item', 'article']).optional(),
});
export type NotificationDetail = z.infer<typeof NotificationDetailSchema>;

export const NotificationSchema = z.object({
  id: z.number().int(),
  kind: z.enum(NOTIFICATION_KINDS),
  // Null for due_soon and overdue, which nobody's action produced.
  actor: MemberRefSchema.nullable(),
  summary: z.string(),
  detail: NotificationDetailSchema,
  read_at: z.string().nullable(),
  created_at: z.string(),
  // The web page it opens, e.g. /issue/PP-12#comment-42.
  path: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

// Twelve changes to one issue are one entry: notifications.md § Notification centre.
export const NotificationGroupSchema = z.object({
  subject: NotificationSubjectSchema,
  latest_at: z.string(),
  count: z.number().int(),
  unread_count: z.number().int(),
  kinds: z.array(z.enum(NOTIFICATION_KINDS)),
  // Newest first, at most NOTIFICATION_GROUP_PREVIEW; the subject's own list pages the rest.
  notifications: z.array(NotificationSchema),
  path: z.string(),
});
export type NotificationGroup = z.infer<typeof NotificationGroupSchema>;

export const UnreadCountSchema = z.object({
  count: z.number().int(),
  organizations: z.array(z.object({ slug: z.string(), count: z.number().int() })),
});
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

const ArticleRefSchema = z.object({ project: z.string().min(1), slug: z.string().min(1) });

const OrganizationRefSchema = z.object({ slug: z.string(), name: z.string() });

// What the inbox's organisation and project pickers offer, across every organisation.
export const NotificationFacetsSchema = z.object({
  organizations: z.array(OrganizationRefSchema),
  projects: z.array(z.object({ key: z.string(), name: z.string(), organization: OrganizationRefSchema })),
});
export type NotificationFacets = z.infer<typeof NotificationFacetsSchema>;

export const MarkNotificationsReadSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(NOTIFICATIONS_MARK_MAX).optional(),
    issues: z.array(z.string().min(1)).min(1).max(NOTIFICATIONS_MARK_MAX).optional(),
    articles: z.array(ArticleRefSchema).min(1).max(NOTIFICATIONS_MARK_MAX).optional(),
    // Everything matching the filters below, the way the inbox's "Mark all read" reads.
    all: z.literal(true).optional(),
    kind: z.array(z.enum(NOTIFICATION_KINDS)).min(1).optional(),
    project: z.string().min(1).optional(),
    org: z.string().min(1).optional(),
  })
  .strict();
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsReadSchema>;

export const MarkedReadSchema = z.object({
  marked: z.number().int(),
  unread: UnreadCountSchema,
});
export type MarkedRead = z.infer<typeof MarkedReadSchema>;

export const NotificationPreferenceSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  area: z.enum(NOTIFICATION_AREAS),
  email: z.enum(NOTIFICATION_EMAIL_OPTIONS),
  // reaction is in-app only, so its one option is off.
  options: z.array(z.enum(NOTIFICATION_EMAIL_OPTIONS)),
  most_commonly_enabled: z.boolean(),
});
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

export const NotificationPreferencesSchema = z.object({ preferences: z.array(NotificationPreferenceSchema) });
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const UpdateNotificationPreferencesSchema = z
  .object({
    // "Turn everything off" at the top of the screen; applied before `email`.
    all: z.literal('off').optional(),
    email: z.partialRecord(z.enum(NOTIFICATION_KINDS), z.enum(NOTIFICATION_EMAIL_OPTIONS)).optional(),
  })
  .strict();
export type UpdateNotificationPreferences = z.infer<typeof UpdateNotificationPreferencesSchema>;

export const UnsubscribeSchema = z.object({
  // The kinds whose email the link turns off; for a digest, every kind on that cadence.
  kinds: z.array(z.enum(NOTIFICATION_KINDS)),
  cadence: z.enum(DIGEST_CADENCES).nullable(),
  applied: z.boolean(),
});
export type Unsubscribe = z.infer<typeof UnsubscribeSchema>;
