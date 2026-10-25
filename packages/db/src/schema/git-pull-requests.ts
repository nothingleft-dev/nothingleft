import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { GIT_CI_STATES, GIT_PULL_REQUEST_STATES, GIT_REVIEW_STATES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { git_repositories } from './git-repositories.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const git_pull_requests = pgTable(
  'git_pull_requests',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repository_id: bigint({ mode: 'number' }).notNull(),
    number: integer().notNull(),
    title: text().notNull(),
    state: text().notNull(),
    author_login: text(),
    author_provider_id: text(),
    author_avatar_url: text(),
    author_user_id: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    head_repo_full_name: text(),
    head_ref: text().notNull(),
    head_sha: text().notNull(),
    base_ref: text().notNull(),
    merge_commit_sha: text(),
    merged_by_login: text(),
    merged_by_user_id: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    is_revert: boolean().notNull().default(false),
    html_url: text().notNull(),
    review_state: text().notNull().default('none'),
    reviewers: jsonb().notNull().default([]),
    ci_state: text().notNull().default('none'),
    ci_summary: jsonb().notNull().default({}),
    commits_fetched_for_sha: text(),
    commits_total: integer(),
    additions: integer(),
    deletions: integer(),
    changed_files: integer(),
    provider_updated_at: timestamp({ withTimezone: true }).notNull(),
    opened_at: timestamp({ withTimezone: true }).notNull(),
    merged_at: timestamp({ withTimezone: true }),
    closed_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('git_pull_requests_id_org_unique').on(t.id, t.org_id),
    unique('git_pull_requests_repository_number_unique').on(t.repository_id, t.number),
    foreignKey({
      columns: [t.repository_id, t.org_id],
      foreignColumns: [git_repositories.id, git_repositories.org_id],
      name: 'git_pull_requests_repository_org_fk',
    }).onDelete('cascade'),
    check('git_pull_requests_state_check', oneOf(t.state, GIT_PULL_REQUEST_STATES)),
    check('git_pull_requests_review_state_check', oneOf(t.review_state, GIT_REVIEW_STATES)),
    check('git_pull_requests_ci_state_check', oneOf(t.ci_state, GIT_CI_STATES)),
  ],
);

export type GitPullRequestRow = typeof git_pull_requests.$inferSelect;
export type NewGitPullRequestRow = typeof git_pull_requests.$inferInsert;
