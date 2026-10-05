import { bigint, char, inet, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { bytea } from '../bytea.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const sessions = pgTable('sessions', {
  id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  token_hash: bytea().notNull().unique(),
  user_id: bigint({ mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  current_org_id: bigint({ mode: 'number' }).references(() => organizations.id, { onDelete: 'set null' }),
  user_agent: text(),
  ip: inet(),
  country_code: char({ length: 2 }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp({ withTimezone: true }).notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
