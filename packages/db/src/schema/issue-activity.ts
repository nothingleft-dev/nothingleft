import { bigint, check, foreignKey, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ISSUE_ACTIVITY_KINDS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const issue_activity = pgTable(
  'issue_activity',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    issue_id: bigint({ mode: 'number' }).notNull(),
    actor_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    change_group_id: uuid().notNull(),
    kind: text().notNull(),
    field: text(),
    old_value: jsonb(),
    new_value: jsonb(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_activity_issue_org_fk',
    }).onDelete('cascade'),
    check('issue_activity_kind_check', oneOf(t.kind, ISSUE_ACTIVITY_KINDS)),
  ],
);

export type IssueActivityRow = typeof issue_activity.$inferSelect;
export type NewIssueActivityRow = typeof issue_activity.$inferInsert;
