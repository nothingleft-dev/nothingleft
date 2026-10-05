import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { BOARD_COLUMN_FIELDS, BOARD_SWIMLANE_FIELDS, BOARD_SWIMLANES } from '@nothingleft/types';
import { oneOf } from '../check.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const boards = pgTable(
  'boards',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    column_field: text().notNull().default('status'),
    swimlane_by: text().notNull().default('none'),
    swimlane_field: text(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'boards_project_org_fk',
    }).onDelete('cascade'),
    unique('boards_org_slug_unique').on(t.org_id, t.slug),
    unique('boards_id_org_unique').on(t.id, t.org_id),
    unique('boards_id_project_unique').on(t.id, t.project_id),
    uniqueIndex('boards_project_lower_name_unique').on(t.project_id, sql`lower(${t.name})`),
    check('boards_column_field_check', oneOf(t.column_field, BOARD_COLUMN_FIELDS)),
    check('boards_swimlane_by_check', oneOf(t.swimlane_by, BOARD_SWIMLANES)),
    check('boards_swimlane_field_check', oneOf(t.swimlane_field, BOARD_SWIMLANE_FIELDS)),
    check('boards_swimlane_field_mode_check', sql`(${t.swimlane_by} = 'values') = (${t.swimlane_field} is not null)`),
  ],
);

export type BoardRow = typeof boards.$inferSelect;
export type NewBoardRow = typeof boards.$inferInsert;
