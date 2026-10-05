import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, jsonb, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { SAVED_VIEW_VISIBILITIES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const saved_views = pgTable(
  'saved_views',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    owner_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    project_id: bigint({ mode: 'number' }),
    name: text().notNull(),
    query: text().notNull(),
    query_ast: jsonb().notNull(),
    sort: jsonb().notNull(),
    columns: text().array().notNull(),
    visibility: text().notNull(),
    position: smallint().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'saved_views_project_org_fk',
    }).onDelete('cascade'),
    check('saved_views_visibility_check', oneOf(t.visibility, SAVED_VIEW_VISIBILITIES)),
    check('saved_views_project_visibility_check', sql`${t.visibility} <> 'project' or ${t.project_id} is not null`),
  ],
);

export type SavedViewRow = typeof saved_views.$inferSelect;
