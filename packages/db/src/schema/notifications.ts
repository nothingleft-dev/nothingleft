import { bigint, check, foreignKey, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { NOTIFICATION_KINDS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { articles } from './articles.ts';
import { comments } from './comments.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { sprints } from './sprints.ts';
import { users } from './users.ts';

export const notifications = pgTable(
  'notifications',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text().notNull(),
    project_id: bigint({ mode: 'number' }),
    issue_id: bigint({ mode: 'number' }),
    comment_id: bigint({ mode: 'number' }),
    article_id: bigint({ mode: 'number' }),
    sprint_id: bigint({ mode: 'number' }),
    // Null only for due_soon and overdue, which no one's write produced.
    actor_id: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    payload: jsonb().notNull().default({}),
    dedupe_key: text().notNull(),
    read_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    // One row per person per event, and a retried fan-out inserts nothing twice.
    unique('notifications_user_dedupe_unique').on(t.user_id, t.dedupe_key),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'notifications_project_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'notifications_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.comment_id, t.org_id],
      foreignColumns: [comments.id, comments.org_id],
      name: 'notifications_comment_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'notifications_article_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.sprint_id, t.org_id],
      foreignColumns: [sprints.id, sprints.org_id],
      name: 'notifications_sprint_org_fk',
    }).onDelete('cascade'),
    check('notifications_kind_check', oneOf(t.kind, NOTIFICATION_KINDS)),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
