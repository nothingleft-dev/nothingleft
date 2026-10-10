import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { saved_views, type SavedViewRow } from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

export type SavedViewInsert = Omit<typeof saved_views.$inferInsert, 'id' | 'org_id' | 'position'>;
export type SavedViewPatch = Partial<
  Pick<SavedViewRow, 'name' | 'query' | 'query_ast' | 'sort' | 'columns' | 'visibility' | 'project_id' | 'position'>
>;

export function savedViewsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(saved_views.org_id, ctx.orgId);

  /** Own views of any visibility, org-visible views, and project views of readable projects. */
  const visibleTo = (userId: number, projectIds: readonly number[]) =>
    or(
      eq(saved_views.owner_id, userId),
      eq(saved_views.visibility, 'org'),
      projectIds.length === 0
        ? undefined
        : and(eq(saved_views.visibility, 'project'), inArray(saved_views.project_id, [...projectIds])),
    );

  return {
    async listVisible(ctx: TenantContext, userId: number, projectIds: readonly number[]): Promise<SavedViewRow[]> {
      return db
        .select()
        .from(saved_views)
        .where(and(inOrg(ctx), visibleTo(userId, projectIds)))
        .orderBy(asc(saved_views.position), asc(saved_views.id));
    },

    async findVisibleByNames(
      ctx: TenantContext,
      userId: number,
      projectIds: readonly number[],
      names: string[],
    ): Promise<SavedViewRow[]> {
      if (names.length === 0) return [];
      return db
        .select()
        .from(saved_views)
        .where(
          and(
            inOrg(ctx),
            visibleTo(userId, projectIds),
            inArray(
              sql`lower(${saved_views.name})`,
              names.map(n => n.toLowerCase()),
            ),
          ),
        )
        .orderBy(asc(saved_views.position), asc(saved_views.id));
    },

    async insert(ctx: TenantContext, input: SavedViewInsert): Promise<SavedViewRow> {
      const [row] = await db
        .insert(saved_views)
        .values({
          ...input,
          org_id: ctx.orgId,
          position: sql`coalesce((select max(v.position) + 1 from saved_views v where v.org_id = ${ctx.orgId} and v.owner_id = ${input.owner_id}), 0)`,
        })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: SavedViewPatch): Promise<SavedViewRow | undefined> {
      const [row] = await db
        .update(saved_views)
        .set({ ...patch, updated_at: new Date() })
        .where(and(inOrg(ctx), eq(saved_views.id, id)))
        .returning();
      return row;
    },

    /** Every view in the organisation, private ones included: a tag rename rewrites them all. */
    async listAll(ctx: TenantContext): Promise<SavedViewRow[]> {
      return db.select().from(saved_views).where(inOrg(ctx)).orderBy(saved_views.id);
    },

    async listOwnedBy(ctx: TenantContext, ownerId: number): Promise<SavedViewRow[]> {
      return db
        .select()
        .from(saved_views)
        .where(and(inOrg(ctx), eq(saved_views.owner_id, ownerId)))
        .orderBy(asc(saved_views.position), asc(saved_views.id));
    },

    /** Appended after the new owner's own views, as a create would be. */
    async transfer(ctx: TenantContext, id: number, ownerId: number, name: string): Promise<SavedViewRow | undefined> {
      const [row] = await db
        .update(saved_views)
        .set({
          owner_id: ownerId,
          name,
          position: sql`coalesce((select max(v.position) + 1 from saved_views v where v.org_id = ${ctx.orgId} and v.owner_id = ${ownerId}), 0)`,
          updated_at: new Date(),
        })
        .where(and(inOrg(ctx), eq(saved_views.id, id)))
        .returning();
      return row;
    },

    async removeOwnedBy(ctx: TenantContext, ownerId: number): Promise<number> {
      const rows = await db
        .delete(saved_views)
        .where(and(inOrg(ctx), eq(saved_views.owner_id, ownerId)))
        .returning({ id: saved_views.id });
      return rows.length;
    },

    async remove(ctx: TenantContext, id: number): Promise<SavedViewRow | undefined> {
      const [row] = await db
        .delete(saved_views)
        .where(and(inOrg(ctx), eq(saved_views.id, id)))
        .returning();
      return row;
    },
  };
}

export type SavedViewsRepository = ReturnType<typeof savedViewsRepository>;
