import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const org_members = pgTable(
  'org_members',
  {
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    username: text().notNull(),
    role: text().notNull(),
    joined_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    invited_by: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    removed_at: timestamp({ withTimezone: true }),
  },
  t => [
    primaryKey({ columns: [t.org_id, t.user_id] }),
    uniqueIndex('org_members_org_username_lower_unique').on(t.org_id, sql`lower(${t.username})`),
    check('org_members_role_check', sql`${t.role} in ('org_admin', 'member')`),
  ],
);

export type OrgMemberRow = typeof org_members.$inferSelect;
export type NewOrgMemberRow = typeof org_members.$inferInsert;
