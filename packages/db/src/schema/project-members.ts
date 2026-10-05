import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const project_members = pgTable(
  'project_members',
  {
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  t => [
    primaryKey({ columns: [t.project_id, t.user_id] }),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'project_members_project_org_fk',
    }).onDelete('cascade'),
    check('project_members_role_check', sql`${t.role} in ('project_admin','contributor','observer')`),
  ],
);

export type ProjectMemberRow = typeof project_members.$inferSelect;
export type NewProjectMemberRow = typeof project_members.$inferInsert;
