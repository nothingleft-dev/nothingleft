import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { STORY_POINTS_MAX } from '@nothingleft/types';
import { tsvector } from '../tsvector.ts';
import { issue_types } from './issue-types.ts';
import { organizations } from './organizations.ts';
import { priorities } from './priorities.ts';
import { projects } from './projects.ts';
import { sprints } from './sprints.ts';
import { users } from './users.ts';
import { workflow_statuses } from './workflow-statuses.ts';

export const issues = pgTable(
  'issues',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    key_number: integer().notNull(),
    title: text().notNull(),
    description_md: text(),
    status_id: bigint({ mode: 'number' }).notNull(),
    priority_id: bigint({ mode: 'number' }).notNull(),
    type_id: bigint({ mode: 'number' }).notNull(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updated_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    parent_id: bigint({ mode: 'number' }),
    sprint_id: bigint({ mode: 'number' }),
    rank: doublePrecision(),
    estimate_minutes: integer(),
    spent_minutes: integer().notNull().default(0),
    story_points: integer(),
    start_date: date({ mode: 'string' }),
    due_date: date({ mode: 'string' }),
    resolved_at: timestamp({ withTimezone: true }),
    vote_count: integer().notNull().default(0),
    comment_count: integer().notNull().default(0),
    search_tsv: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${issues.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${issues.description_md}, '')), 'B')`,
    ),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp({ withTimezone: true }),
  },
  t => [
    unique('issues_project_key_number_unique').on(t.project_id, t.key_number),
    unique('issues_id_org_unique').on(t.id, t.org_id),
    unique('issues_id_project_unique').on(t.id, t.project_id),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'issues_project_org_fk',
    }).onDelete('cascade'),
    // A status, priority or type from another project is unwritable, not merely untested.
    // NO ACTION rather than RESTRICT: RESTRICT fires mid-cascade and would block deleting the project.
    foreignKey({
      columns: [t.status_id, t.project_id],
      foreignColumns: [workflow_statuses.id, workflow_statuses.project_id],
      name: 'issues_status_project_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [t.priority_id, t.project_id],
      foreignColumns: [priorities.id, priorities.project_id],
      name: 'issues_priority_project_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [t.type_id, t.project_id],
      foreignColumns: [issue_types.id, issue_types.project_id],
      name: 'issues_type_project_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [t.parent_id, t.project_id],
      foreignColumns: [t.id, t.project_id] as [AnyPgColumn, AnyPgColumn],
      name: 'issues_parent_project_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [t.sprint_id, t.project_id],
      foreignColumns: [sprints.id, sprints.project_id],
      name: 'issues_sprint_project_fk',
    }).onDelete('no action'),
    check('issues_estimate_minutes_check', sql`${t.estimate_minutes} is null or ${t.estimate_minutes} >= 0`),
    check('issues_spent_minutes_check', sql`${t.spent_minutes} >= 0`),
    check(
      'issues_story_points_check',
      sql`${t.story_points} is null or ${t.story_points} between 0 and ${sql.raw(String(STORY_POINTS_MAX))}`,
    ),
    check('issues_vote_count_check', sql`${t.vote_count} >= 0`),
    check('issues_comment_count_check', sql`${t.comment_count} >= 0`),
    check('issues_parent_id_check', sql`${t.parent_id} is null or ${t.parent_id} <> ${t.id}`),
    check(
      'issues_start_date_check',
      sql`${t.start_date} is null or ${t.due_date} is null or ${t.start_date} <= ${t.due_date}`,
    ),
    // The one non-unique index: it is the full-text mechanism — docs/data-model.md#index-policy.
    index('issues_search_tsv_gin').using('gin', t.search_tsv),
  ],
);

export type IssueRow = Omit<typeof issues.$inferSelect, 'search_tsv'>;
export type NewIssueRow = typeof issues.$inferInsert;
