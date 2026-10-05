import { bigint, foreignKey, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { custom_fields } from './custom-fields.ts';
import { issue_types } from './issue-types.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';

// No rows for a field means it applies to every type.
export const custom_field_applies_to = pgTable(
  'custom_field_applies_to',
  {
    field_id: bigint({ mode: 'number' }).notNull(),
    type_id: bigint({ mode: 'number' }).notNull(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  },
  t => [
    primaryKey({ columns: [t.field_id, t.type_id] }),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'custom_field_applies_to_project_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.field_id, t.project_id],
      foreignColumns: [custom_fields.id, custom_fields.project_id],
      name: 'custom_field_applies_to_field_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.type_id, t.project_id],
      foreignColumns: [issue_types.id, issue_types.project_id],
      name: 'custom_field_applies_to_type_project_fk',
    }).onDelete('cascade'),
  ],
);

export type CustomFieldAppliesToRow = typeof custom_field_applies_to.$inferSelect;
