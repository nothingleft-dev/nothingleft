import { bigint, check, inet, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { ORG_ACTIVITY_KINDS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

// Append-only. UPDATE/DELETE are revoked from the app role once it exists - see migrations/README.md.
export const org_activity = pgTable(
  'org_activity',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actor_id: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    kind: text().notNull(),
    target_type: text().notNull(),
    target_id: text().notNull(),
    old_value: jsonb(),
    new_value: jsonb(),
    ip: inet(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [check('org_activity_kind_check', oneOf(t.kind, ORG_ACTIVITY_KINDS))],
);

export type OrgActivityRow = typeof org_activity.$inferSelect;
export type NewOrgActivityRow = typeof org_activity.$inferInsert;
