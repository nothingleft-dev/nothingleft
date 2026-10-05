import { bigint, foreignKey, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.ts';
import { personal_access_tokens } from './personal-access-tokens.ts';
import { projects } from './projects.ts';

export const personal_access_token_projects = pgTable(
  'personal_access_token_projects',
  {
    token_id: bigint({ mode: 'number' }).notNull(),
    project_id: bigint({ mode: 'number' }).notNull(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  },
  t => [
    primaryKey({ columns: [t.token_id, t.project_id] }),
    // Named: the generated name would pass PostgreSQL's 63-character limit and be truncated.
    foreignKey({
      columns: [t.token_id],
      foreignColumns: [personal_access_tokens.id],
      name: 'personal_access_token_projects_token_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'personal_access_token_projects_project_org_fk',
    }).onDelete('cascade'),
  ],
);

export type PersonalAccessTokenProjectRow = typeof personal_access_token_projects.$inferSelect;
