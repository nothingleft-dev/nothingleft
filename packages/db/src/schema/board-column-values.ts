import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, pgTable, unique } from 'drizzle-orm/pg-core';
import { board_columns } from './board-columns.ts';
import { boards } from './boards.ts';
import { issue_types } from './issue-types.ts';
import { organizations } from './organizations.ts';
import { priorities } from './priorities.ts';
import { projects } from './projects.ts';
import { workflow_statuses } from './workflow-statuses.ts';

// One value of the board's column field per row, with a real key to its table; board_id and
// project_id ride along so a value sits in one column per board, and only a value of the board's project.
export const board_column_values = pgTable(
  'board_column_values',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    column_id: bigint({ mode: 'number' }).notNull(),
    board_id: bigint({ mode: 'number' }).notNull(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    status_id: bigint({ mode: 'number' }),
    priority_id: bigint({ mode: 'number' }),
    type_id: bigint({ mode: 'number' }),
  },
  t => [
    unique('board_column_values_board_status_unique').on(t.board_id, t.status_id),
    unique('board_column_values_board_priority_unique').on(t.board_id, t.priority_id),
    unique('board_column_values_board_type_unique').on(t.board_id, t.type_id),
    check('board_column_values_one_value_check', sql`num_nonnulls(${t.status_id}, ${t.priority_id}, ${t.type_id}) = 1`),
    foreignKey({
      columns: [t.column_id, t.board_id],
      foreignColumns: [board_columns.id, board_columns.board_id],
      name: 'board_column_values_column_board_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.board_id, t.project_id],
      foreignColumns: [boards.id, boards.project_id],
      name: 'board_column_values_board_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'board_column_values_project_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.status_id, t.project_id],
      foreignColumns: [workflow_statuses.id, workflow_statuses.project_id],
      name: 'board_column_values_status_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.priority_id, t.project_id],
      foreignColumns: [priorities.id, priorities.project_id],
      name: 'board_column_values_priority_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.type_id, t.project_id],
      foreignColumns: [issue_types.id, issue_types.project_id],
      name: 'board_column_values_type_project_fk',
    }).onDelete('cascade'),
  ],
);

export type BoardColumnValueRow = typeof board_column_values.$inferSelect;
