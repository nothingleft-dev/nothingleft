import { bigint, foreignKey, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { boards } from './boards.ts';
import { issue_types } from './issue-types.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';

// The issue types whose issues become lanes when a board's swimlanes are `issues`.
export const board_swimlane_types = pgTable(
  'board_swimlane_types',
  {
    board_id: bigint({ mode: 'number' }).notNull(),
    type_id: bigint({ mode: 'number' }).notNull(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  },
  t => [
    primaryKey({ columns: [t.board_id, t.type_id] }),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'board_swimlane_types_project_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.board_id, t.project_id],
      foreignColumns: [boards.id, boards.project_id],
      name: 'board_swimlane_types_board_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.type_id, t.project_id],
      foreignColumns: [issue_types.id, issue_types.project_id],
      name: 'board_swimlane_types_type_project_fk',
    }).onDelete('cascade'),
  ],
);

export type BoardSwimlaneTypeRow = typeof board_swimlane_types.$inferSelect;
