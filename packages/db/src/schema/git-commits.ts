import { bigint, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { git_repositories } from './git-repositories.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const git_commits = pgTable(
  'git_commits',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repository_id: bigint({ mode: 'number' }).notNull(),
    sha: text().notNull(),
    message_subject: text().notNull(),
    message_full: text(),
    author_name: text().notNull(),
    author_email: text().notNull(),
    author_login: text(),
    author_provider_id: text(),
    author_user_id: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    committed_at: timestamp({ withTimezone: true }).notNull(),
    html_url: text().notNull(),
    superseded_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('git_commits_id_org_unique').on(t.id, t.org_id),
    unique('git_commits_repository_sha_unique').on(t.repository_id, t.sha),
    foreignKey({
      columns: [t.repository_id, t.org_id],
      foreignColumns: [git_repositories.id, git_repositories.org_id],
      name: 'git_commits_repository_org_fk',
    }).onDelete('cascade'),
  ],
);

export type GitCommitRow = typeof git_commits.$inferSelect;
export type NewGitCommitRow = typeof git_commits.$inferInsert;
