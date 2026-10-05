import { bigint, check, foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { WATCHER_SOURCES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const issue_watchers = pgTable(
  'issue_watchers',
  {
    issue_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    source: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.issue_id, t.user_id] }),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_watchers_issue_org_fk',
    }).onDelete('cascade'),
    check('issue_watchers_source_check', oneOf(t.source, WATCHER_SOURCES)),
  ],
);

export type IssueWatcherRow = typeof issue_watchers.$inferSelect;
