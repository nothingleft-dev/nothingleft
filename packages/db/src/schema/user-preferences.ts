import { sql } from 'drizzle-orm';
import { bigint, check, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const user_preferences = pgTable(
  'user_preferences',
  {
    user_id: bigint({ mode: 'number' })
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    theme: text().notNull().default('system'),
    last_project_id: bigint({ mode: 'number' }).references(() => projects.id, { onDelete: 'set null' }),
    ui: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  t => [check('user_preferences_theme_check', sql`${t.theme} in ('light','dark','system')`)],
);

export type UserPreferencesRow = typeof user_preferences.$inferSelect;
export type NewUserPreferencesRow = typeof user_preferences.$inferInsert;
