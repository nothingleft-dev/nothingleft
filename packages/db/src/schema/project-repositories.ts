import { bigint, foreignKey, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { git_repositories } from './git-repositories.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const project_repositories = pgTable(
  'project_repositories',
  {
    project_id: bigint({ mode: 'number' }).notNull(),
    repository_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    linked_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    linked_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.project_id, t.repository_id] }),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'project_repositories_project_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.repository_id, t.org_id],
      foreignColumns: [git_repositories.id, git_repositories.org_id],
      name: 'project_repositories_repository_org_fk',
    }).onDelete('cascade'),
  ],
);

export type ProjectRepositoryRow = typeof project_repositories.$inferSelect;
export type NewProjectRepositoryRow = typeof project_repositories.$inferInsert;
