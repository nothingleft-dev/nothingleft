import { and, asc, eq, getTableColumns, gt, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Queryable } from '../client.ts';
import {
  article_tags,
  articles,
  attachments,
  board_column_values,
  board_columns,
  board_swimlane_types,
  boards,
  comment_reactions,
  comments,
  custom_field_applies_to,
  custom_field_options,
  custom_fields,
  issue_activity,
  issue_assignees,
  issue_field_values,
  issue_links,
  issue_tags,
  issue_types,
  issue_watchers,
  issues,
  org_activity,
  org_members,
  organizations,
  priorities,
  project_members,
  projects,
  saved_views,
  sprint_snapshots,
  sprints,
  tags,
  users,
  work_item_attribute_values,
  work_item_attributes,
  work_item_values,
  work_items,
  work_types,
  workflow_statuses,
  type AttachmentRow,
  type IssueRow,
} from '../schema/index.ts';
import type { TenantContext } from '../tenant-context.ts';

type Row = Record<string, unknown>;

interface ExportTable {
  table: PgTable & { org_id: PgColumn };
  /** Columns that are internal plumbing or secret, never written to an archive. */
  omit?: readonly string[];
  /** Rows of something deleted are left out with it. */
  live?: SQL;
}

// Plain SQL fragments: each names its own table, so it binds inside the generic select below.
const issueIsLive = (table: string, column = 'issue_id') =>
  sql.raw(
    `exists (select 1 from issues li where li.id = ${table}.${column} and li.org_id = ${table}.org_id and li.deleted_at is null)`,
  );
const articleIsLive = (table: string, column = 'article_id') =>
  sql.raw(
    `exists (select 1 from articles la where la.id = ${table}.${column} and la.org_id = ${table}.org_id and la.deleted_at is null)`,
  );

/** Every organisation-owned table an export carries, in the order the archive lists them. */
export const ORG_EXPORT_TABLES = {
  projects: { table: projects },
  project_members: { table: project_members },
  workflow_statuses: { table: workflow_statuses },
  priorities: { table: priorities },
  issue_types: { table: issue_types },
  work_types: { table: work_types },
  custom_fields: { table: custom_fields },
  custom_field_options: { table: custom_field_options },
  custom_field_applies_to: { table: custom_field_applies_to },
  work_item_attributes: { table: work_item_attributes },
  work_item_attribute_values: { table: work_item_attribute_values },
  tags: { table: tags },
  sprints: { table: sprints },
  sprint_snapshots: { table: sprint_snapshots },
  boards: { table: boards },
  board_columns: { table: board_columns },
  board_column_values: { table: board_column_values },
  board_swimlane_types: { table: board_swimlane_types },
  issues: { table: issues, omit: ['search_tsv'], live: isNull(issues.deleted_at) },
  issue_assignees: { table: issue_assignees, live: issueIsLive('issue_assignees') },
  issue_watchers: { table: issue_watchers, live: issueIsLive('issue_watchers') },
  issue_tags: { table: issue_tags, live: issueIsLive('issue_tags') },
  issue_links: {
    table: issue_links,
    live: sql`${issueIsLive('issue_links', 'from_issue_id')} and ${issueIsLive('issue_links', 'to_issue_id')}`,
  },
  issue_field_values: { table: issue_field_values, live: issueIsLive('issue_field_values') },
  issue_activity: { table: issue_activity, live: issueIsLive('issue_activity') },
  comments: {
    table: comments,
    live: sql`${isNull(comments.deleted_at)} and (${comments.issue_id} is null or ${issueIsLive('comments')}) and (${comments.article_id} is null or ${articleIsLive('comments')})`,
  },
  comment_reactions: {
    table: comment_reactions,
    live: sql.raw(
      'exists (select 1 from comments lc where lc.id = comment_reactions.comment_id and lc.org_id = comment_reactions.org_id and lc.deleted_at is null)',
    ),
  },
  work_items: { table: work_items, live: issueIsLive('work_items') },
  work_item_values: {
    table: work_item_values,
    live: sql.raw(
      'exists (select 1 from work_items lw join issues li on li.id = lw.issue_id and li.org_id = lw.org_id where lw.id = work_item_values.work_item_id and lw.org_id = work_item_values.org_id and li.deleted_at is null)',
    ),
  },
  articles: { table: articles, omit: ['search_tsv'], live: isNull(articles.deleted_at) },
  article_tags: { table: article_tags, live: articleIsLive('article_tags') },
  // A private view is its owner's own working state, not the organisation's.
  saved_views: { table: saved_views, live: ne(saved_views.visibility, 'private') },
  org_activity: { table: org_activity },
} satisfies Record<string, ExportTable>;

export type OrgExportTable = keyof typeof ORG_EXPORT_TABLES;

export type ExportAttachment = Pick<
  AttachmentRow,
  | 'id'
  | 'public_id'
  | 'issue_id'
  | 'comment_id'
  | 'work_item_id'
  | 'article_id'
  | 'filename'
  | 'mime_type'
  | 'size_bytes'
  | 'checksum'
  | 'storage_target'
  | 'storage_location_id'
  | 'object_key'
  | 'created_by'
  | 'created_at'
>;

export function orgExportRepository(db: Queryable) {
  return {
    async organization(ctx: TenantContext): Promise<Row | undefined> {
      const [row] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          owner_user_id: organizations.owner_user_id,
          plan: organizations.plan,
          workday_minutes: organizations.workday_minutes,
          workweek_days: organizations.workweek_days,
          week_starts_on: organizations.week_starts_on,
          created_at: organizations.created_at,
        })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId));
      return row;
    },

    /** Members past and present, with the account fields an organisation already shows them by. */
    async members(ctx: TenantContext): Promise<Row[]> {
      return db
        .select({
          user_id: org_members.user_id,
          username: org_members.username,
          name: users.name,
          email: users.email,
          role: org_members.role,
          joined_at: org_members.joined_at,
          removed_at: org_members.removed_at,
          deactivated_at: users.deactivated_at,
          erased_at: users.deleted_at,
        })
        .from(org_members)
        .innerJoin(users, eq(users.id, org_members.user_id))
        .where(eq(org_members.org_id, ctx.orgId))
        .orderBy(asc(org_members.user_id));
    },

    /**
     * One page of a table, as stored. Keyed tables page after the last id; the rest by offset,
     * since none of them is large without its parent being larger.
     */
    async page(
      ctx: TenantContext,
      name: OrgExportTable,
      cursor: { afterId: number; offset: number },
      limit: number,
    ): Promise<Row[]> {
      const spec: ExportTable = ORG_EXPORT_TABLES[name];
      const columns = Object.fromEntries(
        Object.entries(getTableColumns(spec.table)).filter(([key]) => !spec.omit?.includes(key)),
      ) as Record<string, PgColumn>;
      const id = columns.id;
      const where = and(eq(spec.table.org_id, ctx.orgId), spec.live, id ? gt(id, cursor.afterId) : undefined);
      const query = db.select(columns).from(spec.table).where(where);
      if (id) return query.orderBy(asc(id)).limit(limit);
      const order = Object.values(columns).filter(c => c.primary || c.name.endsWith('_id'));
      return query
        .orderBy(...order.map(c => asc(c)))
        .limit(limit)
        .offset(cursor.offset);
    },

    async issuesAfter(ctx: TenantContext, afterId: number, limit: number): Promise<IssueRow[]> {
      return db
        .select()
        .from(issues)
        .where(and(eq(issues.org_id, ctx.orgId), isNull(issues.deleted_at), gt(issues.id, afterId)))
        .orderBy(asc(issues.id))
        .limit(limit);
    },

    /** Uploaded files whose issue, article, comment and work item all still exist; drafts are left out. */
    async attachmentsAfter(ctx: TenantContext, afterId: number, limit: number): Promise<ExportAttachment[]> {
      return db
        .select({
          id: attachments.id,
          public_id: attachments.public_id,
          issue_id: attachments.issue_id,
          comment_id: attachments.comment_id,
          work_item_id: attachments.work_item_id,
          article_id: attachments.article_id,
          filename: attachments.filename,
          mime_type: attachments.mime_type,
          size_bytes: attachments.size_bytes,
          checksum: attachments.checksum,
          storage_target: attachments.storage_target,
          storage_location_id: attachments.storage_location_id,
          object_key: attachments.object_key,
          created_by: attachments.created_by,
          created_at: attachments.created_at,
        })
        .from(attachments)
        .where(
          and(
            eq(attachments.org_id, ctx.orgId),
            gt(attachments.id, afterId),
            isNull(attachments.deleted_at),
            sql`${attachments.completed_at} is not null`,
            sql`(${attachments.issue_id} is not null or ${attachments.article_id} is not null)`,
            sql`(${attachments.issue_id} is null or ${issueIsLive('attachments')})`,
            sql`(${attachments.article_id} is null or ${articleIsLive('attachments')})`,
            sql.raw(
              '(attachments.comment_id is null or exists (select 1 from comments lc where lc.id = attachments.comment_id and lc.org_id = attachments.org_id and lc.deleted_at is null))',
            ),
          ),
        )
        .orderBy(asc(attachments.id))
        .limit(limit);
    },
  };
}

export type OrgExportRepository = ReturnType<typeof orgExportRepository>;
