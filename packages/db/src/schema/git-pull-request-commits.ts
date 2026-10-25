import { bigint, foreignKey, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { git_commits } from './git-commits.ts';
import { git_pull_requests } from './git-pull-requests.ts';
import { organizations } from './organizations.ts';

export const git_pull_request_commits = pgTable(
  'git_pull_request_commits',
  {
    pull_request_id: bigint({ mode: 'number' }).notNull(),
    commit_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  },
  t => [
    primaryKey({ columns: [t.pull_request_id, t.commit_id] }),
    foreignKey({
      columns: [t.pull_request_id, t.org_id],
      foreignColumns: [git_pull_requests.id, git_pull_requests.org_id],
      name: 'git_pull_request_commits_pull_request_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.commit_id, t.org_id],
      foreignColumns: [git_commits.id, git_commits.org_id],
      name: 'git_pull_request_commits_commit_org_fk',
    }).onDelete('cascade'),
  ],
);

export type GitPullRequestCommitRow = typeof git_pull_request_commits.$inferSelect;
