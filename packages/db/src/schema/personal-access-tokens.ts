import { bigint, boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { bytea } from '../bytea.ts';
import { users } from './users.ts';

export const personal_access_tokens = pgTable('personal_access_tokens', {
  id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  user_id: bigint({ mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  name: text().notNull(),
  token_hash: bytea().notNull().unique(),
  token_prefix: text().notNull(),
  scopes: text().array().notNull(),
  restricted: boolean().notNull().default(false),
  expires_at: timestamp({ withTimezone: true }),
  last_used_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  revoked_at: timestamp({ withTimezone: true }),
});

export type PersonalAccessTokenRow = typeof personal_access_tokens.$inferSelect;
export type NewPersonalAccessTokenRow = typeof personal_access_tokens.$inferInsert;
