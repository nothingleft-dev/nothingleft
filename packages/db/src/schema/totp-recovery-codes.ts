import { bigint, pgTable, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { bytea } from '../bytea.ts';
import { users } from './users.ts';

export const totp_recovery_codes = pgTable(
  'totp_recovery_codes',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    code_hash: bytea().notNull(),
    used_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('totp_recovery_codes_user_code_unique').on(t.user_id, t.code_hash)],
);

export type TotpRecoveryCodeRow = typeof totp_recovery_codes.$inferSelect;
