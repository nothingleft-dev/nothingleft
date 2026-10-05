import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, integer, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { sprints } from './sprints.ts';

export const sprint_snapshots = pgTable(
  'sprint_snapshots',
  {
    sprint_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    snapshot_date: date({ mode: 'string' }).notNull(),
    total_points: integer().notNull(),
    completed_points: integer().notNull(),
    total_issues: integer().notNull(),
    completed_issues: integer().notNull(),
    remaining_estimate_minutes: integer().notNull(),
    // Null on rows written before 0013: those days have no estimate scope line.
    total_estimate_minutes: integer(),
  },
  t => [
    primaryKey({ columns: [t.sprint_id, t.snapshot_date] }),
    foreignKey({
      columns: [t.sprint_id, t.org_id],
      foreignColumns: [sprints.id, sprints.org_id],
      name: 'sprint_snapshots_sprint_org_fk',
    }).onDelete('cascade'),
    check('sprint_snapshots_total_points_check', sql`${t.total_points} >= 0`),
    check(
      'sprint_snapshots_completed_points_check',
      sql`${t.completed_points} >= 0 and ${t.completed_points} <= ${t.total_points}`,
    ),
    check('sprint_snapshots_total_issues_check', sql`${t.total_issues} >= 0`),
    check(
      'sprint_snapshots_completed_issues_check',
      sql`${t.completed_issues} >= 0 and ${t.completed_issues} <= ${t.total_issues}`,
    ),
    check('sprint_snapshots_remaining_estimate_minutes_check', sql`${t.remaining_estimate_minutes} >= 0`),
    check(
      'sprint_snapshots_total_estimate_minutes_check',
      sql`${t.total_estimate_minutes} is null or ${t.total_estimate_minutes} >= 0`,
    ),
  ],
);

export type SprintSnapshotRow = typeof sprint_snapshots.$inferSelect;
