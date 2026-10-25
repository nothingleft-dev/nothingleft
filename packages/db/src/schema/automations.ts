import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

// `trigger` and `action` have no CHECK: the API's catalogue is the list, so a new trigger needs no migration.
export const automations = pgTable(
  'automations',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    trigger: text().notNull(),
    conditions: jsonb().notNull().default({}),
    action: text().notNull(),
    action_params: jsonb().notNull().default({}),
    is_enabled: boolean().notNull().default(true),
    position: smallint().notNull().default(0),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('automations_id_org_unique').on(t.id, t.org_id),
    uniqueIndex('automations_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'automations_project_org_fk',
    }).onDelete('cascade'),
  ],
);

export type AutomationRow = typeof automations.$inferSelect;
export type NewAutomationRow = typeof automations.$inferInsert;
