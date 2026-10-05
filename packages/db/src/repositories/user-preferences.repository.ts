import { eq } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { projects, user_preferences, type UserPreferencesRow } from '../schema/index.ts';
import type { SystemContext } from '../tenant-context.ts';

export interface PreferencesWithProject {
  preferences: UserPreferencesRow;
  last_project_key: string | null;
}

export function userPreferencesRepository(db: Queryable) {
  return {
    async create(_ctx: SystemContext, userId: number): Promise<UserPreferencesRow> {
      const [row] = await db.insert(user_preferences).values({ user_id: userId }).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async findForUser(_ctx: SystemContext, userId: number): Promise<PreferencesWithProject | undefined> {
      const [row] = await db
        .select({ preferences: user_preferences, last_project_key: projects.key })
        .from(user_preferences)
        .leftJoin(projects, eq(projects.id, user_preferences.last_project_id))
        .where(eq(user_preferences.user_id, userId))
        .limit(1);
      return row;
    },

    async update(
      _ctx: SystemContext,
      userId: number,
      patch: Partial<Pick<UserPreferencesRow, 'theme' | 'last_project_id' | 'ui'>>,
    ): Promise<UserPreferencesRow | undefined> {
      const [row] = await db
        .update(user_preferences)
        .set(patch)
        .where(eq(user_preferences.user_id, userId))
        .returning();
      return row;
    },
  };
}

export type UserPreferencesRepository = ReturnType<typeof userPreferencesRepository>;
