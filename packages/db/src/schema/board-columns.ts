import { sql } from 'drizzle-orm';
import { bigint, boolean, check, foreignKey, pgTable, smallint, text, unique } from 'drizzle-orm/pg-core';
import { BOARD_WIP_MAX } from '@nothingleft/types';
import { boards } from './boards.ts';
import { organizations } from './organizations.ts';

export const board_columns = pgTable(
  'board_columns',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    board_id: bigint({ mode: 'number' }).notNull(),
    name: text().notNull(),
    position: smallint().notNull(),
    wip_min: smallint(),
    wip_max: smallint(),
    is_collapsed_by_default: boolean().notNull().default(false),
  },
  t => [
    foreignKey({
      columns: [t.board_id, t.org_id],
      foreignColumns: [boards.id, boards.org_id],
      name: 'board_columns_board_org_fk',
    }).onDelete('cascade'),
    unique('board_columns_board_position_unique').on(t.board_id, t.position),
    unique('board_columns_id_board_unique').on(t.id, t.board_id),
    check(
      'board_columns_wip_min_check',
      sql`${t.wip_min} is null or ${t.wip_min} between 1 and ${sql.raw(String(BOARD_WIP_MAX))}`,
    ),
    check(
      'board_columns_wip_max_check',
      sql`${t.wip_max} is null or ${t.wip_max} between 1 and ${sql.raw(String(BOARD_WIP_MAX))}`,
    ),
    check(
      'board_columns_wip_order_check',
      sql`${t.wip_min} is null or ${t.wip_max} is null or ${t.wip_min} <= ${t.wip_max}`,
    ),
  ],
);

export type BoardColumnRow = typeof board_columns.$inferSelect;
