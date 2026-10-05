import { bigint, check, foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { WATCHER_SOURCES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { articles } from './articles.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const article_watchers = pgTable(
  'article_watchers',
  {
    article_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    source: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.article_id, t.user_id] }),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'article_watchers_article_org_fk',
    }).onDelete('cascade'),
    check('article_watchers_source_check', oneOf(t.source, WATCHER_SOURCES)),
  ],
);

export type ArticleWatcherRow = typeof article_watchers.$inferSelect;
