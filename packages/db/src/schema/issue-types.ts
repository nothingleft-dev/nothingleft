import { sql } from 'drizzle-orm';
import { bigint, boolean, char, foreignKey, pgTable, smallint, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';

export const issue_types = pgTable(
  'issue_types',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    icon: text(),
    color: text().notNull(),
    short_label: char({ length: 1 }).notNull(),
    position: smallint().notNull(),
    is_default: boolean().notNull().default(false),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'issue_types_project_org_fk',
    }).onDelete('cascade'),
    unique('issue_types_id_project_unique').on(t.id, t.project_id),
    uniqueIndex('issue_types_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    uniqueIndex('issue_types_one_default_per_project')
      .on(t.project_id)
      .where(sql`${t.is_default}`),
  ],
);

export type IssueTypeRow = typeof issue_types.$inferSelect;
export type NewIssueTypeRow = typeof issue_types.$inferInsert;
