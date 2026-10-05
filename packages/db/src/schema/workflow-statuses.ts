import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { STATUS_CATEGORIES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';

export const workflow_statuses = pgTable(
  'workflow_statuses',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    category: text().notNull(),
    color: text().notNull(),
    short_label: char({ length: 1 }).notNull(),
    position: smallint().notNull(),
    is_default: boolean().notNull().default(false),
    is_archived: boolean().notNull().default(false),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'workflow_statuses_project_org_fk',
    }).onDelete('cascade'),
    unique('workflow_statuses_id_project_unique').on(t.id, t.project_id),
    uniqueIndex('workflow_statuses_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    uniqueIndex('workflow_statuses_one_default_per_project')
      .on(t.project_id)
      .where(sql`${t.is_default}`),
    check('workflow_statuses_category_check', oneOf(t.category, STATUS_CATEGORIES)),
    check('workflow_statuses_default_not_archived', sql`not (${t.is_default} and ${t.is_archived})`),
  ],
);

export type WorkflowStatusRow = typeof workflow_statuses.$inferSelect;
export type NewWorkflowStatusRow = typeof workflow_statuses.$inferInsert;
