import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { CUSTOM_FIELD_TYPES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const custom_fields = pgTable(
  'custom_fields',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    type: text().notNull(),
    config: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    is_required: boolean().notNull().default(false),
    default_value: jsonb(),
    empty_label: text(),
    position: smallint().notNull(),
    is_archived: boolean().notNull().default(false),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'custom_fields_project_org_fk',
    }).onDelete('cascade'),
    unique('custom_fields_project_slug_unique').on(t.project_id, t.slug),
    uniqueIndex('custom_fields_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    unique('custom_fields_id_org_unique').on(t.id, t.org_id),
    unique('custom_fields_id_project_unique').on(t.id, t.project_id),
    check('custom_fields_type_check', oneOf(t.type, CUSTOM_FIELD_TYPES)),
  ],
);

export type CustomFieldRow = typeof custom_fields.$inferSelect;
export type NewCustomFieldRow = typeof custom_fields.$inferInsert;
