import {
  bigint,
  boolean,
  check,
  foreignKey,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { GIT_EVENT_STATUSES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { git_connections } from './git-connections.ts';
import { git_repositories } from './git-repositories.ts';
import { organizations } from './organizations.ts';

export const git_webhook_events = pgTable(
  'git_webhook_events',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connection_id: bigint({ mode: 'number' }).notNull(),
    repository_id: bigint({ mode: 'number' }),
    // The provider's repository id from the payload, kept when no repository row matches (yet).
    provider_repo_id: text(),
    delivery_id: text().notNull(),
    event_name: text().notNull(),
    received_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processed_at: timestamp({ withTimezone: true }),
    status: text().notNull().default('pending'),
    error: text(),
    attempts: smallint().notNull().default(0),
    next_attempt_at: timestamp({ withTimezone: true }),
    run_automations: boolean().notNull().default(false),
    payload: jsonb().notNull(),
    truncated: boolean().notNull().default(false),
  },
  t => [
    unique('git_webhook_events_connection_delivery_unique').on(t.connection_id, t.delivery_id),
    foreignKey({
      columns: [t.connection_id, t.org_id],
      foreignColumns: [git_connections.id, git_connections.org_id],
      name: 'git_webhook_events_connection_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.repository_id, t.org_id],
      foreignColumns: [git_repositories.id, git_repositories.org_id],
      name: 'git_webhook_events_repository_org_fk',
    }).onDelete('cascade'),
    check('git_webhook_events_status_check', oneOf(t.status, GIT_EVENT_STATUSES)),
  ],
);

export type GitWebhookEventRow = typeof git_webhook_events.$inferSelect;
export type NewGitWebhookEventRow = typeof git_webhook_events.$inferInsert;
