import { bigint, check, foreignKey, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { IMPORT_SOURCES, IMPORT_STATUSES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const import_jobs = pgTable(
  'import_jobs',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    source: text().notNull().default('csv'),
    filename: text().notNull(),
    size_bytes: bigint({ mode: 'number' }).notNull(),
    sha256: text().notNull(),
    object_key: text(),
    status: text().notNull().default('awaiting_upload'),
    headers: text().array(),
    column_mapping: jsonb(),
    total_rows: integer(),
    processed_rows: integer().notNull().default(0),
    created_issues: integer().notNull().default(0),
    failed_rows: integer().notNull().default(0),
    errors: jsonb().notNull().default([]),
    error: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    started_at: timestamp({ withTimezone: true }),
    completed_at: timestamp({ withTimezone: true }),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'import_jobs_project_org_fk',
    }).onDelete('cascade'),
    check('import_jobs_source_check', oneOf(t.source, IMPORT_SOURCES)),
    check('import_jobs_status_check', oneOf(t.status, IMPORT_STATUSES)),
  ],
);

export type ImportJobRow = typeof import_jobs.$inferSelect;
export type NewImportJobRow = typeof import_jobs.$inferInsert;
