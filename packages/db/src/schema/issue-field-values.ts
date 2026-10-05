import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { custom_field_options } from './custom-field-options.ts';
import { custom_fields } from './custom-fields.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const issue_field_values = pgTable(
  'issue_field_values',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    issue_id: bigint({ mode: 'number' }).notNull(),
    field_id: bigint({ mode: 'number' }).notNull(),
    value_text: text(),
    value_number: doublePrecision(),
    value_date: date({ mode: 'string' }),
    value_timestamptz: timestamp({ withTimezone: true }),
    value_bool: boolean(),
    option_id: bigint({ mode: 'number' }),
    user_id: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    // NULLS NOT DISTINCT: scalar fields leave option_id and user_id null, which would otherwise never collide.
    unique('issue_field_values_value_unique').on(t.issue_id, t.field_id, t.option_id, t.user_id).nullsNotDistinct(),
    check(
      'issue_field_values_one_value_check',
      sql`num_nonnulls(${t.value_text}, ${t.value_number}, ${t.value_date}, ${t.value_timestamptz}, ${t.value_bool}, ${t.option_id}, ${t.user_id}) = 1`,
    ),
    foreignKey({
      columns: [t.issue_id, t.project_id],
      foreignColumns: [issues.id, issues.project_id],
      name: 'issue_field_values_issue_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_field_values_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.field_id, t.project_id],
      foreignColumns: [custom_fields.id, custom_fields.project_id],
      name: 'issue_field_values_field_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.option_id, t.field_id],
      foreignColumns: [custom_field_options.id, custom_field_options.field_id],
      name: 'issue_field_values_option_field_fk',
    }).onDelete('no action'),
  ],
);

export type IssueFieldValueRow = typeof issue_field_values.$inferSelect;
export type NewIssueFieldValueRow = typeof issue_field_values.$inferInsert;
