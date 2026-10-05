import { sql } from 'drizzle-orm';
import { bigint, boolean, char, foreignKey, pgTable, smallint, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';

export const priorities = pgTable(
  'priorities',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    color: text().notNull(),
    short_label: char({ length: 1 }).notNull(),
    position: smallint().notNull(),
    is_default: boolean().notNull().default(false),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'priorities_project_org_fk',
    }).onDelete('cascade'),
    unique('priorities_id_project_unique').on(t.id, t.project_id),
    uniqueIndex('priorities_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    uniqueIndex('priorities_one_default_per_project')
      .on(t.project_id)
      .where(sql`${t.is_default}`),
  ],
);

export type PriorityRow = typeof priorities.$inferSelect;
export type NewPriorityRow = typeof priorities.$inferInsert;
