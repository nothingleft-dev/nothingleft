import { bigint, foreignKey, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { articles } from './articles.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const article_stars = pgTable(
  'article_stars',
  {
    article_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.article_id, t.user_id] }),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'article_stars_article_org_fk',
    }).onDelete('cascade'),
  ],
);

export type ArticleStarRow = typeof article_stars.$inferSelect;
