import { sql } from 'drizzle-orm';
import { bigint, check, integer, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { STORAGE_NOTICE_LEVELS, WORKDAY_MINUTES_MAX, WORKWEEK_DAYS_MAX } from '@nothingleft/types';
import { users } from './users.ts';

export const organizations = pgTable(
  'organizations',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    owner_user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    plan: text().notNull().default('free'),
    storage_used_bytes: bigint({ mode: 'number' }).notNull().default(0),
    storage_notice_level: smallint().notNull().default(0),
    workday_minutes: integer().notNull().default(480),
    workweek_days: integer().notNull().default(5),
    week_starts_on: smallint().notNull().default(1),
    deletion_scheduled_at: timestamp({ withTimezone: true }),
    deletion_reminder_sent_at: timestamp({ withTimezone: true }),
    deleted_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    check('organizations_plan_check', sql`${t.plan} in ('free','pro','pro_lite','unlimited')`),
    check('organizations_week_starts_on_check', sql`${t.week_starts_on} between 0 and 6`),
    check(
      'organizations_storage_notice_level_check',
      sql`${t.storage_notice_level} in (${sql.raw(STORAGE_NOTICE_LEVELS.join(','))})`,
    ),
    check(
      'organizations_workday_minutes_check',
      sql`${t.workday_minutes} between 1 and ${sql.raw(String(WORKDAY_MINUTES_MAX))}`,
    ),
    check(
      'organizations_workweek_days_check',
      sql`${t.workweek_days} between 1 and ${sql.raw(String(WORKWEEK_DAYS_MAX))}`,
    ),
    check('organizations_storage_used_bytes_check', sql`${t.storage_used_bytes} >= 0`),
  ],
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type NewOrganizationRow = typeof organizations.$inferInsert;
