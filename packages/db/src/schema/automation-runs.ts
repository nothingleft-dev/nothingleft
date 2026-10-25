import { bigint, check, foreignKey, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { AUTOMATION_RUN_RESULTS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { automations } from './automations.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const automation_runs = pgTable(
  'automation_runs',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    automation_id: bigint({ mode: 'number' }).notNull(),
    issue_id: bigint({ mode: 'number' }).notNull(),
    trigger_ref: jsonb().notNull(),
    // The member whose git action fired it: never notified of the change it caused.
    caused_by: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    result: text().notNull(),
    reason: text(),
    changes: jsonb(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.automation_id, t.org_id],
      foreignColumns: [automations.id, automations.org_id],
      name: 'automation_runs_automation_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'automation_runs_issue_org_fk',
    }).onDelete('cascade'),
    check('automation_runs_result_check', oneOf(t.result, AUTOMATION_RUN_RESULTS)),
  ],
);

export type AutomationRunRow = typeof automation_runs.$inferSelect;
export type NewAutomationRunRow = typeof automation_runs.$inferInsert;
