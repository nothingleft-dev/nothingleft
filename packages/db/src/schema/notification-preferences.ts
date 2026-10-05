import { bigint, check, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { NOTIFICATION_EMAIL_OPTIONS, NOTIFICATION_KINDS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { users } from './users.ts';

export const notification_preferences = pgTable(
  'notification_preferences',
  {
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text().notNull(),
    email: text().notNull().default('off'),
  },
  t => [
    primaryKey({ columns: [t.user_id, t.kind] }),
    check('notification_preferences_kind_check', oneOf(t.kind, NOTIFICATION_KINDS)),
    check('notification_preferences_email_check', oneOf(t.email, NOTIFICATION_EMAIL_OPTIONS)),
  ],
);

export type NotificationPreferenceRow = typeof notification_preferences.$inferSelect;
