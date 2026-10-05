import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { custom_fields } from './custom-fields.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const projects = pgTable(
  'projects',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    description_md: text(),
    avatar_color: text().notNull(),
    avatar_initials: text().notNull(),
    lead_user_id: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    issue_counter: integer().notNull().default(0),
    is_archived: boolean().notNull().default(false),
    time_tracking_enabled: boolean().notNull().default(true),
    estimation_field_id: bigint({ mode: 'number' }),
    spent_time_field_id: bigint({ mode: 'number' }),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // Annotated: custom_fields references projects back, which TypeScript cannot infer through.
  (t): PgTableExtraConfigValue[] => [
    unique('projects_org_key_unique').on(t.org_id, t.key),
    unique('projects_org_slug_unique').on(t.org_id, t.slug),
    // Referenced by every child table's composite FK so a row cannot be filed under
    // the wrong tenant — docs/data-model.md#tenancy-integrity.
    unique('projects_id_org_unique').on(t.id, t.org_id),
    foreignKey({
      columns: [t.estimation_field_id, t.id],
      foreignColumns: [custom_fields.id, custom_fields.project_id],
      name: 'projects_estimation_field_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [t.spent_time_field_id, t.id],
      foreignColumns: [custom_fields.id, custom_fields.project_id],
      name: 'projects_spent_time_field_fk',
    }).onDelete('no action'),
    check('projects_issue_counter_check', sql`${t.issue_counter} >= 0`),
    check(
      'projects_time_fields_distinct_check',
      sql`${t.estimation_field_id} is null or ${t.spent_time_field_id} is null or ${t.estimation_field_id} <> ${t.spent_time_field_id}`,
    ),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
