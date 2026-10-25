import { bigint, check, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { GIT_LINK_INTENTS, GIT_LINK_TARGETS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { git_repositories } from './git-repositories.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

// `target_id` names a branch, commit or pull request by `target_type`, so it has no foreign key:
// the purge that deletes one of those deletes its links in the same statement.
export const issue_git_links = pgTable(
  'issue_git_links',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    issue_id: bigint({ mode: 'number' }).notNull(),
    repository_id: bigint({ mode: 'number' }).notNull(),
    target_type: text().notNull(),
    target_id: bigint({ mode: 'number' }).notNull(),
    sources: text().array().notNull(),
    intent: text().notNull().default('mention'),
    // What a person's unlink took away: those sources alone never relink it.
    removed_sources: text().array().notNull().default([]),
    created_by: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removed_at: timestamp({ withTimezone: true }),
    removed_by: bigint({ mode: 'number' }).references(() => users.id, { onDelete: 'restrict' }),
  },
  t => [
    unique('issue_git_links_issue_target_unique').on(t.issue_id, t.target_type, t.target_id),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_git_links_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.repository_id, t.org_id],
      foreignColumns: [git_repositories.id, git_repositories.org_id],
      name: 'issue_git_links_repository_org_fk',
    }).onDelete('cascade'),
    check('issue_git_links_target_type_check', oneOf(t.target_type, GIT_LINK_TARGETS)),
    check('issue_git_links_intent_check', oneOf(t.intent, GIT_LINK_INTENTS)),
  ],
);

export type IssueGitLinkRow = typeof issue_git_links.$inferSelect;
export type NewIssueGitLinkRow = typeof issue_git_links.$inferInsert;
