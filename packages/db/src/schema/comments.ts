import { bigint, check, foreignKey, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { REACTION_EMOJIS } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { articles } from './articles.ts';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

// Exactly one of issue_id and article_id is set, enforced in the service — docs/data-model.md#enforced-in-the-application-layer.
export const comments = pgTable(
  'comments',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    issue_id: bigint({ mode: 'number' }),
    article_id: bigint({ mode: 'number' }),
    author_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body_md: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    edited_at: timestamp({ withTimezone: true }),
    deleted_at: timestamp({ withTimezone: true }),
  },
  t => [
    unique('comments_id_org_unique').on(t.id, t.org_id),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'comments_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'comments_article_org_fk',
    }).onDelete('cascade'),
  ],
);

export const comment_reactions = pgTable(
  'comment_reactions',
  {
    comment_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    emoji: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.comment_id, t.user_id, t.emoji] }),
    foreignKey({
      columns: [t.comment_id, t.org_id],
      foreignColumns: [comments.id, comments.org_id],
      name: 'comment_reactions_comment_org_fk',
    }).onDelete('cascade'),
    check('comment_reactions_emoji_check', oneOf(t.emoji, REACTION_EMOJIS)),
  ],
);

export type CommentRow = typeof comments.$inferSelect;
export type CommentReactionRow = typeof comment_reactions.$inferSelect;
