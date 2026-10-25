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
import { GIT_WEBHOOK_STATUSES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { git_connections } from './git-connections.ts';
import { organizations } from './organizations.ts';

export const git_repositories = pgTable(
  'git_repositories',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connection_id: bigint({ mode: 'number' }).notNull(),
    provider_repo_id: text().notNull(),
    full_name: text().notNull(),
    html_url: text().notNull(),
    default_branch: text().notNull(),
    is_private: boolean().notNull(),
    is_archived: boolean().notNull().default(false),
    provider_webhook_id: text(),
    webhook_status: text().notNull().default('not_applicable'),
    webhook_last_status_code: integer(),
    match_all_projects: boolean().notNull().default(false),
    merge_base_branches: text().array(),
    last_event_at: timestamp({ withTimezone: true }),
    backfill_state: jsonb(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removed_at: timestamp({ withTimezone: true }),
  },
  t => [
    unique('git_repositories_id_org_unique').on(t.id, t.org_id),
    unique('git_repositories_connection_provider_id_unique').on(t.connection_id, t.provider_repo_id),
    foreignKey({
      columns: [t.connection_id, t.org_id],
      foreignColumns: [git_connections.id, git_connections.org_id],
      name: 'git_repositories_connection_org_fk',
    }).onDelete('cascade'),
    check('git_repositories_webhook_status_check', oneOf(t.webhook_status, GIT_WEBHOOK_STATUSES)),
  ],
);

export type GitRepositoryRow = typeof git_repositories.$inferSelect;
export type NewGitRepositoryRow = typeof git_repositories.$inferInsert;
