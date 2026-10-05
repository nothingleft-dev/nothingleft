import { bigint, foreignKey, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { work_item_attribute_values } from './work-item-attribute-values.ts';
import { work_item_attributes } from './work-item-attributes.ts';
import { work_items } from './work-items.ts';

export const work_item_values = pgTable(
  'work_item_values',
  {
    work_item_id: bigint({ mode: 'number' }).notNull(),
    attribute_id: bigint({ mode: 'number' }).notNull(),
    value_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
  },
  t => [
    primaryKey({ columns: [t.work_item_id, t.attribute_id] }),
    foreignKey({
      columns: [t.work_item_id, t.org_id],
      foreignColumns: [work_items.id, work_items.org_id],
      name: 'work_item_values_work_item_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.work_item_id, t.project_id],
      foreignColumns: [work_items.id, work_items.project_id],
      name: 'work_item_values_work_item_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.attribute_id, t.project_id],
      foreignColumns: [work_item_attributes.id, work_item_attributes.project_id],
      name: 'work_item_values_attribute_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.value_id, t.attribute_id],
      foreignColumns: [work_item_attribute_values.id, work_item_attribute_values.attribute_id],
      name: 'work_item_values_value_attribute_fk',
    }).onDelete('no action'),
  ],
);

export type WorkItemValueRow = typeof work_item_values.$inferSelect;
