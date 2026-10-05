import { bigint, foreignKey, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { issues } from './issues.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';

export const tags = pgTable(
  'tags',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    slug: text().notNull(),
    color: text().notNull(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('tags_org_slug_unique').on(t.org_id, t.slug), unique('tags_id_org_unique').on(t.id, t.org_id)],
);

export const issue_tags = pgTable(
  'issue_tags',
  {
    issue_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tag_id: bigint({ mode: 'number' }).notNull(),
    added_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.issue_id, t.tag_id] }),
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'issue_tags_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tag_id, t.org_id],
      foreignColumns: [tags.id, tags.org_id],
      name: 'issue_tags_tag_org_fk',
    }).onDelete('cascade'),
  ],
);

export type TagRow = typeof tags.$inferSelect;
export type IssueTagRow = typeof issue_tags.$inferSelect;
