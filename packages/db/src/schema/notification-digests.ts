import { bigint, check, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { DIGEST_CADENCES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const notification_digests = pgTable(
  'notification_digests',
  {
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    cadence: text().notNull(),
    sent_at: timestamp({ withTimezone: true }).notNull(),
  },
  t => [
    primaryKey({ columns: [t.user_id, t.org_id, t.cadence] }),
    check('notification_digests_cadence_check', oneOf(t.cadence, DIGEST_CADENCES)),
  ],
);

export type NotificationDigestRow = typeof notification_digests.$inferSelect;
