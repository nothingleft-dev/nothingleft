import { sql } from 'drizzle-orm';
import { bigint, boolean, foreignKey, pgTable, smallint, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { custom_fields } from './custom-fields.ts';
import { organizations } from './organizations.ts';

export const custom_field_options = pgTable(
  'custom_field_options',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    field_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    color: text().notNull().default('gray-2'),
    position: smallint().notNull(),
    is_archived: boolean().notNull().default(false),
  },
  t => [
    foreignKey({
      columns: [t.field_id, t.org_id],
      foreignColumns: [custom_fields.id, custom_fields.org_id],
      name: 'custom_field_options_field_org_fk',
    }).onDelete('cascade'),
    unique('custom_field_options_id_field_unique').on(t.id, t.field_id),
    uniqueIndex('custom_field_options_field_lower_name_unique').on(t.field_id, sql`lower(${t.name})`),
  ],
);

export type CustomFieldOptionRow = typeof custom_field_options.$inferSelect;
export type NewCustomFieldOptionRow = typeof custom_field_options.$inferInsert;
