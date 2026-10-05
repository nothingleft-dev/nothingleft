import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, inet, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { bytea } from '../bytea.ts';
import { organizations } from './organizations.ts';
import { projects } from './projects.ts';
import { users } from './users.ts';

export const invitations = pgTable(
  'invitations',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    project_id: bigint({ mode: 'number' }),
    kind: text().notNull(),
    email: text(),
    token_hash: bytea().notNull().unique(),
    // Share links only: they are pasted into chats by design, and an admin must be able to copy one again.
    token: text(),
    org_role: text().notNull(),
    project_role: text(),
    max_uses: integer(),
    use_count: integer().notNull().default(0),
    expires_at: timestamp({ withTimezone: true }),
    allowed_email_domain: text(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revoked_at: timestamp({ withTimezone: true }),
  },
  t => [
    foreignKey({
      columns: [t.project_id, t.org_id],
      foreignColumns: [projects.id, projects.org_id],
      name: 'invitations_project_org_fk',
    }).onDelete('cascade'),
    check('invitations_kind_check', sql`${t.kind} in ('email','link')`),
    check('invitations_org_role_check', sql`${t.org_role} in ('org_admin','member')`),
    check('invitations_token_kind_check', sql`(${t.kind} = 'link') = (${t.token} is not null)`),
    check(
      'invitations_project_role_check',
      sql`${t.project_role} is null or ${t.project_role} in ('project_admin','contributor','observer')`,
    ),
  ],
);

export const invitation_uses = pgTable(
  'invitation_uses',
  {
    invitation_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    user_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    used_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: inet(),
  },
  t => [primaryKey({ columns: [t.invitation_id, t.user_id] })],
);

export type InvitationRow = typeof invitations.$inferSelect;
export type NewInvitationRow = typeof invitations.$inferInsert;
export type InvitationUseRow = typeof invitation_uses.$inferSelect;
