import { bigint, foreignKey, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const issue_votes = pgTable(
  'issue_votes',
  {
    issue_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.issue_id, t.user_id] }),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_votes_issue_org_fk',
    }).onDelete('cascade'),
  ],
);

export type IssueVoteRow = typeof issue_votes.$inferSelect;
