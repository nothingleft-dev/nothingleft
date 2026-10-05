import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { SPRINT_STATES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const sprints = pgTable(
  'sprints',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    goal_md: text(),
    start_date: date({ mode: 'string' }),
    end_date: date({ mode: 'string' }),
    state: text().notNull().default('planned'),
    started_at: timestamp({ withTimezone: true }),
    completed_at: timestamp({ withTimezone: true }),
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
      name: 'sprints_project_org_fk',
    }).onDelete('cascade'),
    unique('sprints_project_slug_unique').on(t.project_id, t.slug),
    unique('sprints_id_org_unique').on(t.id, t.org_id),
    unique('sprints_id_project_unique').on(t.id, t.project_id),
    // A UNIQUE index, so the index policy allows it; it makes two concurrent starts impossible.
    uniqueIndex('sprints_one_active_per_project')
      .on(t.project_id)
      .where(sql`${t.state} = 'active'`),
    uniqueIndex('sprints_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    check('sprints_state_check', oneOf(t.state, SPRINT_STATES)),
    check(
      'sprints_start_date_check',
      sql`${t.start_date} is null or ${t.end_date} is null or ${t.start_date} <= ${t.end_date}`,
    ),
  ],
);

export type SprintRow = typeof sprints.$inferSelect;
export type NewSprintRow = typeof sprints.$inferInsert;
