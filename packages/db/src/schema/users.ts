import { sql } from 'drizzle-orm';
import { bigint, char, inet, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    email: text().notNull(),
    email_verified_at: timestamp({ withTimezone: true }),
    name: text().notNull(),
    avatar_url: text(),
    avatar_object_key: text(),
    password_hash: text(),
    google_id: text().unique(),
    github_id: text().unique(),
    timezone: text().notNull().default('UTC'),
    country_code: char({ length: 2 }),
    last_login_at: timestamp({ withTimezone: true }),
    last_login_ip: inet(),
    totp_secret_ciphertext: text(),
    totp_enabled_at: timestamp({ withTimezone: true }),
    // The last TOTP step accepted, so a code cannot be replayed inside its 30 seconds.
    totp_last_used_step: bigint({ mode: 'number' }),
    deactivated_at: timestamp({ withTimezone: true }),
    deleted_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('users_email_lower_unique').on(sql`lower(${t.email})`)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
