import { bigint, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { git_repositories } from './git-repositories.ts';
import { organizations } from './organizations.ts';

export const git_branches = pgTable(
  'git_branches',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repository_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    head_sha: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp({ withTimezone: true }),
  },
  t => [
    unique('git_branches_id_org_unique').on(t.id, t.org_id),
    unique('git_branches_repository_name_unique').on(t.repository_id, t.name),
    foreignKey({
      columns: [t.repository_id, t.org_id],
      foreignColumns: [git_repositories.id, git_repositories.org_id],
      name: 'git_branches_repository_org_fk',
    }).onDelete('cascade'),
  ],
);

export type GitBranchRow = typeof git_branches.$inferSelect;
export type NewGitBranchRow = typeof git_branches.$inferInsert;
