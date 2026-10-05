import { bigint, foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { articles } from './articles.ts';
import { organizations } from './organizations.ts';

// Keyed by the text of the key, not an issue id, so a key written before its issue exists still counts.
// The primary key leads with (org_id, issue_key): it is the index the Referenced by lookup reads.
export const article_issue_refs = pgTable(
  'article_issue_refs',
  {
    article_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    issue_key: text().notNull(),
  },
  t => [
    primaryKey({ columns: [t.org_id, t.issue_key, t.article_id] }),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'article_issue_refs_article_org_fk',
    }).onDelete('cascade'),
  ],
);

export type ArticleIssueRefRow = typeof article_issue_refs.$inferSelect;
