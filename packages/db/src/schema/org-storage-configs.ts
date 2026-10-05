import { bigint, check, foreignKey, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { BYO_MIGRATION_STATES, BYO_STATUSES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { org_storage_locations } from './org-storage-locations.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const org_storage_configs = pgTable(
  'org_storage_configs',
  {
    org_id: bigint({ mode: 'number' })
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    location_id: bigint({ mode: 'number' }).notNull(),
    access_key_id: text().notNull(),
    secret_ciphertext: text().notNull(),
    status: text().notNull().default('pending'),
    verified_at: timestamp({ withTimezone: true }),
    checked_at: timestamp({ withTimezone: true }),
    last_error: text(),
    migration_state: text().notNull().default('idle'),
    migrated_bytes: bigint({ mode: 'number' }).notNull().default(0),
    total_bytes: bigint({ mode: 'number' }).notNull().default(0),
    migrated_files: integer().notNull().default(0),
    total_files: integer().notNull().default(0),
    migration_error: text(),
    migration_started_at: timestamp({ withTimezone: true }),
    migration_finished_at: timestamp({ withTimezone: true }),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updated_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.location_id, t.org_id],
      foreignColumns: [org_storage_locations.id, org_storage_locations.org_id],
      name: 'org_storage_configs_location_org_fk',
    }),
    check('org_storage_configs_status_check', oneOf(t.status, BYO_STATUSES)),
    check('org_storage_configs_migration_state_check', oneOf(t.migration_state, BYO_MIGRATION_STATES)),
  ],
);

export type OrgStorageConfigRow = typeof org_storage_configs.$inferSelect;
export type NewOrgStorageConfigRow = typeof org_storage_configs.$inferInsert;
