import { bigint, check, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { MENTION_SOURCE_TYPES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { articles } from './articles.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const mentions = pgTable(
  'mentions',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    source_type: text().notNull(),
    source_id: bigint({ mode: 'number' }).notNull(),
    mentioned_user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    issue_id: bigint({ mode: 'number' }),
    article_id: bigint({ mode: 'number' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'mentions_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'mentions_article_org_fk',
    }).onDelete('cascade'),
    check('mentions_source_type_check', oneOf(t.source_type, MENTION_SOURCE_TYPES)),
    unique('mentions_source_user_unique').on(t.org_id, t.source_type, t.source_id, t.mentioned_user_id),
  ],
);

export type MentionRow = typeof mentions.$inferSelect;
export type NewMentionRow = typeof mentions.$inferInsert;
