import { bigint, check, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { GIT_CHECK_CONCLUSIONS, GIT_CHECK_STATUSES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { git_repositories } from './git-repositories.ts';
import { organizations } from './organizations.ts';

export const git_checks = pgTable(
  'git_checks',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    repository_id: bigint({ mode: 'number' }).notNull(),
    sha: text().notNull(),
    external_id: text().notNull(),
    name: text().notNull(),
    status: text().notNull(),
    conclusion: text(),
    details_url: text(),
    started_at: timestamp({ withTimezone: true }),
    completed_at: timestamp({ withTimezone: true }),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('git_checks_repository_sha_external_unique').on(t.repository_id, t.sha, t.external_id),
    foreignKey({
      columns: [t.repository_id, t.org_id],
      foreignColumns: [git_repositories.id, git_repositories.org_id],
      name: 'git_checks_repository_org_fk',
    }).onDelete('cascade'),
    check('git_checks_status_check', oneOf(t.status, GIT_CHECK_STATUSES)),
    check('git_checks_conclusion_check', oneOf(t.conclusion, GIT_CHECK_CONCLUSIONS)),
  ],
);

export type GitCheckRow = typeof git_checks.$inferSelect;
export type NewGitCheckRow = typeof git_checks.$inferInsert;
