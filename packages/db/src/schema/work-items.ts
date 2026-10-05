import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';
import { work_types } from './work-types.ts';

export const work_items = pgTable(
  'work_items',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    issue_id: bigint({ mode: 'number' }).notNull(),
    author_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    work_date: date({ mode: 'string' }).notNull(),
    duration_minutes: integer().notNull(),
    work_type_id: bigint({ mode: 'number' }),
    description_md: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('work_items_id_org_unique').on(t.id, t.org_id),
    unique('work_items_id_project_unique').on(t.id, t.project_id),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'work_items_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.issue_id, t.project_id],
      foreignColumns: [issues.id, issues.project_id],
      name: 'work_items_issue_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.work_type_id, t.project_id],
      foreignColumns: [work_types.id, work_types.project_id],
      name: 'work_items_work_type_project_fk',
    }).onDelete('no action'),
    check('work_items_duration_minutes_check', sql`${t.duration_minutes} > 0`),
  ],
);

export type WorkItemRow = typeof work_items.$inferSelect;
export type NewWorkItemRow = typeof work_items.$inferInsert;
