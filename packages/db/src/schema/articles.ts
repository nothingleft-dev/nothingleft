import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { ARTICLE_STATUSES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { tsvector } from '../tsvector.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const articles = pgTable(
  'articles',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    parent_id: bigint({ mode: 'number' }),
    title: text().notNull(),
    slug: text().notNull(),
    body_md: text().notNull().default(''),
    status: text().notNull().default('draft'),
    position: integer().notNull(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updated_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    published_at: timestamp({ withTimezone: true }),
    search_tsv: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${articles.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${articles.body_md}, '')), 'B')`,
    ),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp({ withTimezone: true }),
  },
  t => [
    unique('articles_id_org_unique').on(t.id, t.org_id),
    unique('articles_id_project_unique').on(t.id, t.project_id),
    uniqueIndex('articles_project_slug_lower_unique')
      .on(t.project_id, sql`lower(${t.slug})`)
      .where(sql`${t.deleted_at} is null`),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'articles_project_org_fk',
    }).onDelete('cascade'),
    // NO ACTION so deleting a project cascades through a whole tree in one statement.
    foreignKey({
      columns: [t.parent_id, t.project_id],
      foreignColumns: [t.id, t.project_id] as [AnyPgColumn, AnyPgColumn],
      name: 'articles_parent_project_fk',
    }).onDelete('no action'),
    check('articles_status_check', oneOf(t.status, ARTICLE_STATUSES)),
    check('articles_parent_id_check', sql`${t.parent_id} is null or ${t.parent_id} <> ${t.id}`),
    // The full-text mechanism, as on issues — docs/data-model.md#index-policy.
    index('articles_search_tsv_gin').using('gin', t.search_tsv),
  ],
);

export type ArticleRow = Omit<typeof articles.$inferSelect, 'search_tsv'>;
