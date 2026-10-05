import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';

export const work_item_attributes = pgTable(
  'work_item_attributes',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    position: smallint().notNull(),
    is_archived: boolean().notNull().default(false),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'work_item_attributes_project_org_fk',
    }).onDelete('cascade'),
    unique('work_item_attributes_id_org_unique').on(t.id, t.org_id),
    unique('work_item_attributes_id_project_unique').on(t.id, t.project_id),
    uniqueIndex('work_item_attributes_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
  ],
);

export type WorkItemAttributeRow = typeof work_item_attributes.$inferSelect;
export type NewWorkItemAttributeRow = typeof work_item_attributes.$inferInsert;
