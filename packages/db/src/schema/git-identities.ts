import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { GIT_IDENTITY_VERIFICATIONS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { users } from './users.ts';

// An identity belongs to a person, not an organisation, like `users`: it is matched within an
// organisation only while its owner is a member there.
export const git_identities = pgTable(
  'git_identities',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    provider: text().notNull(),
    base_url: text().notNull(),
    provider_user_id: text(),
    login: text(),
    email: text(),
    verified_by: text().notNull(),
    // An email claim matches nothing until its link is followed.
    verified_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('git_identities_provider_user_unique')
      .on(t.provider, t.base_url, t.provider_user_id)
      .where(sql`${t.provider_user_id} is not null`),
    uniqueIndex('git_identities_provider_login_unique')
      .on(t.provider, t.base_url, sql`lower(${t.login})`)
      .where(sql`${t.login} is not null`),
    uniqueIndex('git_identities_email_unique')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null and ${t.verified_at} is not null`),
    check('git_identities_verified_by_check', oneOf(t.verified_by, GIT_IDENTITY_VERIFICATIONS)),
    check('git_identities_one_handle_check', sql`num_nonnulls(${t.provider_user_id}, ${t.login}, ${t.email}) >= 1`),
  ],
);

export type GitIdentityRow = typeof git_identities.$inferSelect;
export type NewGitIdentityRow = typeof git_identities.$inferInsert;
