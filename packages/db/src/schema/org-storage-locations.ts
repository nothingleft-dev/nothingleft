import { bigint, check, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { BYO_PROVIDERS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';

export const org_storage_locations = pgTable(
  'org_storage_locations',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text().notNull(),
    endpoint: text().notNull(),
    region: text().notNull(),
    bucket: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('org_storage_locations_identity_unique').on(t.org_id, t.provider, t.endpoint, t.bucket),
    unique('org_storage_locations_id_org_unique').on(t.id, t.org_id),
    check('org_storage_locations_provider_check', oneOf(t.provider, BYO_PROVIDERS)),
  ],
);

export type OrgStorageLocationRow = typeof org_storage_locations.$inferSelect;
export type NewOrgStorageLocationRow = typeof org_storage_locations.$inferInsert;
