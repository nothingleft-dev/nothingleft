import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { SEED_BOARD_COLUMNS, SEED_BOARD_SWIMLANE_TYPE } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import {
  board_column_values,
  board_columns,
  board_swimlane_types,
  boards,
  issue_types,
  priorities,
  workflow_statuses,
  type BoardColumnRow,
  type BoardRow,
  type NewBoardRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export type BoardPatch = Partial<
  Pick<NewBoardRow, 'name' | 'slug' | 'column_field' | 'swimlane_by' | 'swimlane_field' | 'updated_at'>
>;

export interface BoardColumnInsert {
  name: string;
  wip_min: number | null;
  wip_max: number | null;
  is_collapsed_by_default: boolean;
  /** Ids of the board's column field: statuses, priorities or types. */
  value_ids: number[];
}

export interface BoardLayout {
  columns: (BoardColumnRow & { value_ids: number[] })[];
  swimlane_type_ids: number[];
}

export function boardsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(boards.org_id, ctx.orgId);

  async function writeColumns(ctx: TenantContext, board: BoardRow, columns: BoardColumnInsert[]) {
    for (const [position, column] of columns.entries()) {
      const [row] = await db
        .insert(board_columns)
        .values({
          org_id: ctx.orgId,
          board_id: board.id,
          name: column.name,
          position,
          wip_min: column.wip_min,
          wip_max: column.wip_max,
          is_collapsed_by_default: column.is_collapsed_by_default,
        })
        .returning();
      if (column.value_ids.length === 0) continue;
      const key = `${board.column_field}_id` as 'status_id' | 'priority_id' | 'type_id';
      await db.insert(board_column_values).values(
        column.value_ids.map(id => ({
          column_id: row!.id,
          [key]: id,
          board_id: board.id,
          project_id: board.project_id,
          org_id: ctx.orgId,
        })),
      );
    }
  }

  async function writeSwimlaneTypes(ctx: TenantContext, board: BoardRow, typeIds: number[]) {
    if (typeIds.length === 0) return;
    await db.insert(board_swimlane_types).values(
      [...new Set(typeIds)].map(type_id => ({
        board_id: board.id,
        type_id,
        project_id: board.project_id,
        org_id: ctx.orgId,
      })),
    );
  }

  async function insertBoard(
    ctx: TenantContext,
    input: Omit<NewBoardRow, 'id' | 'org_id'>,
    columns: BoardColumnInsert[],
    swimlaneTypeIds: number[],
  ): Promise<BoardRow> {
    const [row] = await db
      .insert(boards)
      .values({ ...input, org_id: ctx.orgId })
      .returning();
    if (!row) throw new Error('insert returned no row');
    await writeColumns(ctx, row, columns);
    await writeSwimlaneTypes(ctx, row, swimlaneTypeIds);
    return row;
  }

  return {
    async list(ctx: TenantContext, projectId: number): Promise<BoardRow[]> {
      return db
        .select()
        .from(boards)
        .where(and(inOrg(ctx), eq(boards.project_id, projectId)))
        .orderBy(asc(boards.created_at), asc(boards.id));
    },

    async listForProjects(ctx: TenantContext, projectIds: number[]): Promise<BoardRow[]> {
      if (projectIds.length === 0) return [];
      return db
        .select()
        .from(boards)
        .where(and(inOrg(ctx), inArray(boards.project_id, projectIds)))
        .orderBy(asc(boards.created_at), asc(boards.id));
    },

    /** By slug first, then by name, case-insensitively. */
    async find(ctx: TenantContext, projectId: number, nameOrSlug: string): Promise<BoardRow | undefined> {
      const value = nameOrSlug.trim().toLowerCase();
      const rows = await db
        .select()
        .from(boards)
        .where(
          and(
            inOrg(ctx),
            eq(boards.project_id, projectId),
            or(eq(boards.slug, value), sql`lower(${boards.name}) = ${value}`),
          ),
        );
      return rows.find(r => r.slug === value) ?? rows[0];
    },

    /** The short `/board/<slug>` route: slugs are unique in the organisation. */
    async findBySlug(ctx: TenantContext, slug: string): Promise<BoardRow | undefined> {
      const [row] = await db
        .select()
        .from(boards)
        .where(and(inOrg(ctx), eq(boards.slug, slug.trim().toLowerCase())));
      return row;
    },

    async slugsInOrg(ctx: TenantContext): Promise<Set<string>> {
      const rows = await db.select({ slug: boards.slug }).from(boards).where(inOrg(ctx));
      return new Set(rows.map(r => r.slug));
    },

    async layout(ctx: TenantContext, boardIds: number[]): Promise<Map<number, BoardLayout>> {
      const out = new Map<number, BoardLayout>(boardIds.map(id => [id, { columns: [], swimlane_type_ids: [] }]));
      if (boardIds.length === 0) return out;
      const [columns, mapped, types] = await Promise.all([
        db
          .select()
          .from(board_columns)
          .where(and(eq(board_columns.org_id, ctx.orgId), inArray(board_columns.board_id, boardIds)))
          .orderBy(asc(board_columns.position)),
        db
          .select({
            column_id: board_column_values.column_id,
            value_id: sql<number>`coalesce(${board_column_values.status_id}, ${board_column_values.priority_id}, ${board_column_values.type_id})`,
          })
          .from(board_column_values)
          .leftJoin(workflow_statuses, eq(workflow_statuses.id, board_column_values.status_id))
          .leftJoin(priorities, eq(priorities.id, board_column_values.priority_id))
          .leftJoin(issue_types, eq(issue_types.id, board_column_values.type_id))
          .where(and(eq(board_column_values.org_id, ctx.orgId), inArray(board_column_values.board_id, boardIds)))
          .orderBy(
            sql`coalesce(${workflow_statuses.position}, ${priorities.position}, ${issue_types.position})`,
            asc(board_column_values.id),
          ),
        db
          .select({ board_id: board_swimlane_types.board_id, type_id: board_swimlane_types.type_id })
          .from(board_swimlane_types)
          .innerJoin(issue_types, eq(issue_types.id, board_swimlane_types.type_id))
          .where(and(eq(board_swimlane_types.org_id, ctx.orgId), inArray(board_swimlane_types.board_id, boardIds)))
          .orderBy(asc(issue_types.position)),
      ]);
      for (const column of columns) {
        out.get(column.board_id)!.columns.push({
          ...column,
          value_ids: mapped.filter(m => m.column_id === column.id).map(m => Number(m.value_id)),
        });
      }
      for (const t of types) out.get(t.board_id)!.swimlane_type_ids.push(t.type_id);
      return out;
    },

    insert: insertBoard,

    /** `columns` and `swimlaneTypeIds`, when given, replace what the board had. */
    async update(
      ctx: TenantContext,
      id: number,
      patch: BoardPatch,
      replace: { columns?: BoardColumnInsert[] | undefined; swimlaneTypeIds?: number[] | undefined } = {},
    ): Promise<BoardRow | undefined> {
      const [row] = await db
        .update(boards)
        .set(patch)
        .where(and(inOrg(ctx), eq(boards.id, id)))
        .returning();
      if (!row) return undefined;
      if (replace.columns) {
        await db.delete(board_columns).where(and(eq(board_columns.org_id, ctx.orgId), eq(board_columns.board_id, id)));
        await writeColumns(ctx, row, replace.columns);
      }
      if (replace.swimlaneTypeIds) {
        await db
          .delete(board_swimlane_types)
          .where(and(eq(board_swimlane_types.org_id, ctx.orgId), eq(board_swimlane_types.board_id, id)));
        await writeSwimlaneTypes(ctx, row, replace.swimlaneTypeIds);
      }
      return row;
    },

    async remove(ctx: TenantContext, id: number): Promise<boolean> {
      const rows = await db
        .delete(boards)
        .where(and(inOrg(ctx), eq(boards.id, id)))
        .returning({ id: boards.id });
      return rows.length > 0;
    },

    /** A new project's board, from its freshly seeded statuses and types — docs/data-model.md#boards. */
    async seed(
      ctx: TenantContext,
      project: { id: number; key: string; name: string },
      createdBy: number,
      slug: string,
    ): Promise<BoardRow> {
      const [statuses, types] = await Promise.all([
        db
          .select()
          .from(workflow_statuses)
          .where(and(eq(workflow_statuses.org_id, ctx.orgId), eq(workflow_statuses.project_id, project.id)))
          .orderBy(asc(workflow_statuses.position)),
        db
          .select()
          .from(issue_types)
          .where(and(eq(issue_types.org_id, ctx.orgId), eq(issue_types.project_id, project.id))),
      ]);
      const epic = types.find(t => t.name.toLowerCase() === SEED_BOARD_SWIMLANE_TYPE.toLowerCase());
      return insertBoard(
        ctx,
        {
          project_id: project.id,
          name: project.name,
          slug,
          swimlane_by: epic ? 'issues' : 'none',
          created_by: createdBy,
        },
        SEED_BOARD_COLUMNS.map(c => ({
          name: c.name,
          wip_min: null,
          wip_max: null,
          is_collapsed_by_default: false,
          value_ids: statuses.filter(s => (c.categories as readonly string[]).includes(s.category)).map(s => s.id),
        })),
        epic ? [epic.id] : [],
      );
    },
  };
}

export type BoardsRepository = ReturnType<typeof boardsRepository>;
