import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { ISSUE_LINK_TYPES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const issue_links = pgTable(
  'issue_links',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    from_issue_id: bigint({ mode: 'number' }).notNull(),
    to_issue_id: bigint({ mode: 'number' }).notNull(),
    type: text().notNull(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('issue_links_from_to_type_unique').on(t.from_issue_id, t.to_issue_id, t.type),
    foreignKey({
      columns: [t.from_issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_links_from_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.to_issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_links_to_issue_org_fk',
    }).onDelete('cascade'),
    check('issue_links_type_check', oneOf(t.type, ISSUE_LINK_TYPES)),
    check('issue_links_from_issue_id_check', sql`${t.from_issue_id} <> ${t.to_issue_id}`),
  ],
);

export type IssueLinkRow = typeof issue_links.$inferSelect;
