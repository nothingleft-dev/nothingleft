import { sql } from 'drizzle-orm';
import { bigint, check, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { EXPORT_FORMATS, EXPORT_SCOPES, EXPORT_STATUSES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const export_jobs = pgTable(
  'export_jobs',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    scope: text().notNull().default('org'),
    format: text().notNull().default('json'),
    status: text().notNull().default('queued'),
    object_key: text(),
    size_bytes: bigint({ mode: 'number' }),
    file_count: integer(),
    missing_file_count: integer(),
    expires_at: timestamp({ withTimezone: true }),
    error: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    started_at: timestamp({ withTimezone: true }),
    completed_at: timestamp({ withTimezone: true }),
  },
  t => [
    check('export_jobs_scope_check', oneOf(t.scope, EXPORT_SCOPES)),
    check('export_jobs_format_check', oneOf(t.format, EXPORT_FORMATS)),
    check('export_jobs_status_check', oneOf(t.status, EXPORT_STATUSES)),
    uniqueIndex('export_jobs_one_pending_per_org')
      .on(t.org_id)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
);

export type ExportJobRow = typeof export_jobs.$inferSelect;
export type NewExportJobRow = typeof export_jobs.$inferInsert;
