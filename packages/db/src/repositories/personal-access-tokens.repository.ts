import { and, eq, exists, inArray, isNull, notExists, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  personal_access_token_projects,
  personal_access_tokens,
  type NewPersonalAccessTokenRow,
  type PersonalAccessTokenRow,
} from '../schema/index.ts';
import type { SystemContext } from '../tenant-context.ts';

/** `project_ids` is null for an unrestricted token; a restricted one's list may be empty. */
export type PersonalAccessTokenWithProjects = PersonalAccessTokenRow & { project_ids: number[] | null };

export interface TokenProjectRef {
  project_id: number;
  org_id: number;
}

export function personalAccessTokensRepository(db: Queryable) {
  const named = (where?: SQL) =>
    db
      .select({ one: sql`1` })
      .from(personal_access_token_projects)
      .where(and(eq(personal_access_token_projects.token_id, personal_access_tokens.id), where));

  // A restricted token whose projects were all deleted already reaches nothing; it is left alone.
  const confinedTo = (projectIds: number[]) =>
    and(
      eq(personal_access_tokens.restricted, true),
      exists(named()),
      notExists(named(notInArray(personal_access_token_projects.project_id, projectIds))),
    );

  async function withProjectIds<R extends PersonalAccessTokenRow>(
    rows: R[],
  ): Promise<(R & { project_ids: number[] | null })[]> {
    const restricted = rows.filter(r => r.restricted).map(r => r.id);
    const links =
      restricted.length === 0
        ? []
        : await db
            .select({
              token_id: personal_access_token_projects.token_id,
              project_id: personal_access_token_projects.project_id,
            })
            .from(personal_access_token_projects)
            .where(inArray(personal_access_token_projects.token_id, restricted))
            .orderBy(personal_access_token_projects.project_id);
    return rows.map(row => ({
      ...row,
      project_ids: row.restricted ? links.filter(l => l.token_id === row.id).map(l => l.project_id) : null,
    }));
  }

  return {
    async create(_ctx: SystemContext, input: NewPersonalAccessTokenRow): Promise<PersonalAccessTokenRow> {
      const [row] = await db.insert(personal_access_tokens).values(input).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async addProjects(_ctx: SystemContext, tokenId: number, projects: readonly TokenProjectRef[]): Promise<void> {
      if (projects.length === 0) return;
      await db
        .insert(personal_access_token_projects)
        .values(projects.map(p => ({ token_id: tokenId, project_id: p.project_id, org_id: p.org_id })));
    },

    async findLiveByTokenHash(
      _ctx: SystemContext,
      tokenHash: Buffer,
    ): Promise<PersonalAccessTokenWithProjects | undefined> {
      const row = await db.query.personal_access_tokens.findFirst({
        where: and(
          eq(personal_access_tokens.token_hash, tokenHash),
          isNull(personal_access_tokens.revoked_at),
          sql`(${personal_access_tokens.expires_at} is null or ${personal_access_tokens.expires_at} > now())`,
        ),
      });
      return row ? (await withProjectIds([row]))[0] : undefined;
    },

    async markUsed(_ctx: SystemContext, id: number): Promise<void> {
      await db
        .update(personal_access_tokens)
        .set({ last_used_at: new Date() })
        .where(eq(personal_access_tokens.id, id));
    },

    async listForUser(_ctx: SystemContext, userId: number): Promise<PersonalAccessTokenWithProjects[]> {
      const rows = await db.query.personal_access_tokens.findMany({
        where: eq(personal_access_tokens.user_id, userId),
        orderBy: sql`created_at desc`,
      });
      return withProjectIds(rows);
    },

    /** Live tokens that reach any of these projects: the unrestricted ones and those naming one of them. */
    async countReaching(_ctx: SystemContext, userId: number, projectIds: number[]): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(personal_access_tokens)
        .where(
          and(
            eq(personal_access_tokens.user_id, userId),
            isNull(personal_access_tokens.revoked_at),
            sql`(${personal_access_tokens.expires_at} is null or ${personal_access_tokens.expires_at} > now())`,
            or(
              eq(personal_access_tokens.restricted, false),
              exists(named(inArray(personal_access_token_projects.project_id, projectIds))),
            ),
          ),
        );
      return row?.n ?? 0;
    },

    /**
     * Revokes the user's live tokens restricted entirely to these projects. An unrestricted
     * token is left alone: it spans the user's other organisations, and live permission
     * checks already stop it reaching the one they left.
     */
    async revokeRestrictedTo(
      _ctx: SystemContext,
      userId: number,
      projectIds: number[],
    ): Promise<PersonalAccessTokenRow[]> {
      if (projectIds.length === 0) return [];
      return db
        .update(personal_access_tokens)
        .set({ revoked_at: new Date() })
        .where(
          and(
            eq(personal_access_tokens.user_id, userId),
            isNull(personal_access_tokens.revoked_at),
            confinedTo(projectIds),
          ),
        )
        .returning();
    },

    async revokeAllForUser(_ctx: SystemContext, userId: number): Promise<PersonalAccessTokenRow[]> {
      return db
        .update(personal_access_tokens)
        .set({ revoked_at: new Date() })
        .where(and(eq(personal_access_tokens.user_id, userId), isNull(personal_access_tokens.revoked_at)))
        .returning();
    },

    /** Every user's live tokens restricted entirely to these projects: a deleted organisation's. */
    async revokeConfinedTo(_ctx: SystemContext, projectIds: number[]): Promise<PersonalAccessTokenRow[]> {
      if (projectIds.length === 0) return [];
      return db
        .update(personal_access_tokens)
        .set({ revoked_at: new Date() })
        .where(and(isNull(personal_access_tokens.revoked_at), confinedTo(projectIds)))
        .returning();
    },

    async revokeForUser(
      _ctx: SystemContext,
      userId: number,
      id: number,
    ): Promise<PersonalAccessTokenWithProjects | undefined> {
      const [row] = await db
        .update(personal_access_tokens)
        .set({ revoked_at: new Date() })
        .where(
          and(
            eq(personal_access_tokens.id, id),
            eq(personal_access_tokens.user_id, userId),
            isNull(personal_access_tokens.revoked_at),
          ),
        )
        .returning();
      return row ? (await withProjectIds([row]))[0] : undefined;
    },
  };
}

export type PersonalAccessTokensRepository = ReturnType<typeof personalAccessTokensRepository>;
