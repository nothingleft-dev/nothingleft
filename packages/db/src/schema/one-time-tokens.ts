import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { bytea } from '../bytea.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const one_time_tokens = pgTable(
  'one_time_tokens',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    purpose: text().notNull(),
    token_hash: bytea().notNull().unique(),
    org_id: bigint({ mode: 'number' }).references(() => organizations.id, { onDelete: 'cascade' }),
    new_email: text(),
    created_by: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    expires_at: timestamp({ withTimezone: true }).notNull(),
    used_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    check(
      'one_time_tokens_purpose_check',
      sql`${t.purpose} in ('password_reset','email_verify','email_change','ownership_transfer','git_identity_email')`,
    ),
    uniqueIndex('one_time_tokens_one_open_transfer_per_org')
      .on(t.org_id)
      .where(sql`${t.purpose} = 'ownership_transfer' and ${t.used_at} is null`),
    check(
      'one_time_tokens_transfer_fields_check',
      sql`${t.purpose} <> 'ownership_transfer' or (${t.org_id} is not null and ${t.created_by} is not null)`,
    ),
    check(
      'one_time_tokens_email_change_check',
      sql`${t.purpose} not in ('email_change','git_identity_email') or ${t.new_email} is not null`,
    ),
  ],
);

export type OneTimeTokenRow = typeof one_time_tokens.$inferSelect;
export type NewOneTimeTokenRow = typeof one_time_tokens.$inferInsert;
