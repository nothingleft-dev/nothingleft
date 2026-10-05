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
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';

export const work_types = pgTable(
  'work_types',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    short_label: char({ length: 1 }).notNull(),
    position: smallint().notNull(),
    is_default: boolean().notNull().default(false),
    is_archived: boolean().notNull().default(false),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'work_types_project_org_fk',
    }).onDelete('cascade'),
    unique('work_types_id_org_unique').on(t.id, t.org_id),
    unique('work_types_id_project_unique').on(t.id, t.project_id),
    uniqueIndex('work_types_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    uniqueIndex('work_types_one_default_per_project')
      .on(t.project_id)
      .where(sql`${t.is_default}`),
    check('work_types_default_not_archived', sql`not (${t.is_default} and ${t.is_archived})`),
  ],
);

export type WorkTypeRow = typeof work_types.$inferSelect;
export type NewWorkTypeRow = typeof work_types.$inferInsert;
