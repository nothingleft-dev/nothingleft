import { sql } from 'drizzle-orm';
import { bigint, boolean, char, foreignKey, pgTable, smallint, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { work_item_attributes } from './work-item-attributes.ts';

export const work_item_attribute_values = pgTable(
  'work_item_attribute_values',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    attribute_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    short_label: char({ length: 1 }).notNull(),
    position: smallint().notNull(),
    is_archived: boolean().notNull().default(false),
  },
  t => [
    foreignKey({
      columns: [t.attribute_id, t.org_id],
      foreignColumns: [work_item_attributes.id, work_item_attributes.org_id],
      name: 'work_item_attribute_values_attribute_org_fk',
    }).onDelete('cascade'),
    unique('work_item_attribute_values_id_attribute_unique').on(t.id, t.attribute_id),
    uniqueIndex('work_item_attribute_values_attribute_lower_name_unique').on(t.attribute_id, sql`lower(${t.name})`),
  ],
);

export type WorkItemAttributeValueRow = typeof work_item_attribute_values.$inferSelect;
export type NewWorkItemAttributeValueRow = typeof work_item_attribute_values.$inferInsert;
