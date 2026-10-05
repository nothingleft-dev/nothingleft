import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { STORAGE_TARGETS } from '@nothingleft/types';
import { bytea } from '../bytea.ts';
import { oneOf } from '../check.ts';
import { articles } from './articles.ts';
import { comments } from './comments.ts';
import { issues } from './issues.ts';
import { org_storage_locations } from './org-storage-locations.ts';
import { organizations } from './organizations.ts';
import { users } from './users.ts';
import { work_items } from './work-items.ts';

export const attachments = pgTable(
  'attachments',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    public_id: uuid().notNull().unique().defaultRandom(),
    org_id: bigint({ mode: 'number' })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    issue_id: bigint({ mode: 'number' }),
    comment_id: bigint({ mode: 'number' }),
    work_item_id: bigint({ mode: 'number' }),
    article_id: bigint({ mode: 'number' }),
    filename: text().notNull(),
    mime_type: text().notNull(),
    size_bytes: bigint({ mode: 'number' }).notNull(),
    checksum: bytea().notNull(),
    storage_target: text().notNull(),
    storage_location_id: bigint({ mode: 'number' }),
    bucket: text().notNull(),
    object_key: text().notNull(),
    public_url: text(),
    width: integer(),
    height: integer(),
    created_by: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp({ withTimezone: true }),
    deleted_at: timestamp({ withTimezone: true }),
  },
  t => [
    foreignKey({
      columns: [t.issue_id, t.org_id],
      foreignColumns: [issues.id, issues.org_id],
      name: 'attachments_issue_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.comment_id, t.org_id],
      foreignColumns: [comments.id, comments.org_id],
      name: 'attachments_comment_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.work_item_id, t.org_id],
      foreignColumns: [work_items.id, work_items.org_id],
      name: 'attachments_work_item_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.article_id, t.org_id],
      foreignColumns: [articles.id, articles.org_id],
      name: 'attachments_article_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.storage_location_id, t.org_id],
      foreignColumns: [org_storage_locations.id, org_storage_locations.org_id],
      name: 'attachments_storage_location_org_fk',
    }).onDelete('restrict'),
    check('attachments_storage_target_check', oneOf(t.storage_target, STORAGE_TARGETS)),
    check(
      'attachments_storage_location_check',
      sql`(${t.storage_target} = 'byo') = (${t.storage_location_id} is not null)`,
    ),
    check('attachments_size_bytes_check', sql`${t.size_bytes} >= 0`),
    check('attachments_width_check', sql`${t.width} is null or ${t.width} > 0`),
    check('attachments_height_check', sql`${t.height} is null or ${t.height} > 0`),
    check(
      'attachments_parent_shape_check',
      sql`not (${t.issue_id} is not null and ${t.article_id} is not null)
        and (${t.work_item_id} is null or ${t.issue_id} is not null)
        and (${t.comment_id} is null or ${t.issue_id} is not null or ${t.article_id} is not null)`,
    ),
  ],
);

export type AttachmentRow = typeof attachments.$inferSelect;
export type NewAttachmentRow = typeof attachments.$inferInsert;
