import { bigint, foreignKey, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { articles } from './articles.ts';
import { organizations } from './organizations.ts';
import { tags } from './tags.ts';

export const article_tags = pgTable(
  'article_tags',
  {
    article_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tag_id: bigint({ mode: 'number' }).notNull(),
    added_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.article_id, t.tag_id] }),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'article_tags_article_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tag_id, t.org_id],
      foreignColumns: [tags.id, tags.org_id],
      name: 'article_tags_tag_org_fk',
    }).onDelete('cascade'),
  ],
);

export type ArticleTagRow = typeof article_tags.$inferSelect;
