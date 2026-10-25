import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { GIT_AUTH_KINDS, GIT_CONNECTION_ERRORS, GIT_CONNECTION_STATUSES } from '@nothingleft/types';
import { bytea } from '../bytea.ts';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

// `provider` has no CHECK: the API's provider registry validates it, so a new provider needs no migration.
export const git_connections = pgTable(
  'git_connections',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text().notNull(),
    base_url: text().notNull(),
    auth_kind: text().notNull(),
    installation_id: text(),
    account_login: text().notNull(),
    account_avatar_url: text(),
    account_url: text().notNull(),
    token_ciphertext: text(),
    hook_id_hash: bytea().unique(),
    hook_secret_ciphertext: text(),
    status: text().notNull().default('active'),
    last_error: text(),
    last_event_at: timestamp({ withTimezone: true }),
    token_expires_at: timestamp({ withTimezone: true }),
    // When the Org Admins were warned the token expires soon; cleared when the expiry moves.
    token_warned_at: timestamp({ withTimezone: true }),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revoked_at: timestamp({ withTimezone: true }),
  },
  t => [
    unique('git_connections_id_org_unique').on(t.id, t.org_id),
    // One live connection per installation across every organisation: a second claim is refused.
    uniqueIndex('git_connections_installation_unique')
      .on(t.provider, t.base_url, t.installation_id)
      .where(sql`${t.revoked_at} is null and ${t.installation_id} is not null`),
    uniqueIndex('git_connections_org_account_unique')
      .on(t.org_id, t.provider, t.base_url, sql`lower(${t.account_login})`)
      .where(sql`${t.revoked_at} is null`),
    check('git_connections_auth_kind_check', oneOf(t.auth_kind, GIT_AUTH_KINDS)),
    check('git_connections_status_check', oneOf(t.status, GIT_CONNECTION_STATUSES)),
    check('git_connections_last_error_check', oneOf(t.last_error, GIT_CONNECTION_ERRORS)),
  ],
);

export type GitConnectionRow = typeof git_connections.$inferSelect;
export type NewGitConnectionRow = typeof git_connections.$inferInsert;
