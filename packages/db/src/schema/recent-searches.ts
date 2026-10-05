import { bigint, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { bytea } from '../bytea.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

// Keyed by sha256(query): a btree tuple caps near 2700 bytes, so the text itself cannot be the key.
export const recent_searches = pgTable(
  'recent_searches',
  {
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    query_hash: bytea().notNull(),
    query: text().notNull(),
    last_used_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    use_count: integer().notNull().default(1),
  },
  t => [primaryKey({ columns: [t.user_id, t.org_id, t.query_hash] })],
);

export type RecentSearchRow = typeof recent_searches.$inferSelect;
