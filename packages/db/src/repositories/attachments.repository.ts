import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, or, sql, sum } from 'drizzle-orm';
import type { StorageTarget } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import {
  articles,
  attachments,
  comments,
  issues,
  org_storage_configs,
  projects,
  type AttachmentRow,
  type NewAttachmentRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type AttachmentInsert = Omit<NewAttachmentRow, 'id' | 'org_id'>;

export type AttachmentTarget =
  | { issue_id: number; comment_id?: number | null; work_item_id?: number | null }
  | { article_id: number; comment_id?: number | null };

export interface AttachmentFilter {
  commentId?: number | undefined;
  workItemId?: number | undefined;
}

export interface StorageTallyRow {
  storage_target: StorageTarget;
  storage_location_id: number | null;
  bucket: string;
  draft: boolean;
  parent_deleted: boolean;
  files: number;
  bytes: number;
}

export interface StorageFileOptions {
  sort: 'size' | 'created';
  target?: StorageTarget | undefined;
  projectId?: number | undefined;
  limit: number;
  offset: number;
}

export interface StorageFileRow {
  attachment: AttachmentRow;
  project_id: number;
  project_key: string;
  issue_number: number | null;
  article_slug: string | null;
  article_title: string | null;
  parent_deleted_at: Date | null;
}

export interface ExpiredAttachments {
  pendingBefore: Date;
  draftBefore: Date;
  limit: number;
}

export function attachmentsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(attachments.org_id, ctx.orgId);
  const live = isNull(attachments.deleted_at);
  const ready = isNotNull(attachments.completed_at);
  const draft = and(isNull(attachments.issue_id), isNull(attachments.article_id));
  const onPlatform = eq(attachments.storage_target, 'platform');

  return {
    async insert(ctx: TenantContext, row: AttachmentInsert): Promise<AttachmentRow> {
      const [created] = await db
        .insert(attachments)
        .values({ ...row, org_id: ctx.orgId })
        .returning();
      if (!created) throw new Error('insert returned no row');
      return created;
    },

    /** Every state, deleted and pending included; the service decides what each caller may see. */
    async findByPublicId(ctx: TenantContext, publicId: string): Promise<AttachmentRow | undefined> {
      const [row] = await db
        .select()
        .from(attachments)
        .where(and(inOrg(ctx), eq(attachments.public_id, publicId)))
        .limit(1);
      return row;
    },

    async lockByPublicId(ctx: TenantContext, publicId: string): Promise<AttachmentRow | undefined> {
      const [row] = await db
        .select()
        .from(attachments)
        .where(and(inOrg(ctx), eq(attachments.public_id, publicId)))
        .for('update');
      return row;
    },

    /** A file URL carries only the public id, so its organisation is read before any tenant context exists. */
    async orgOfPublicId(_ctx: SystemContext, publicId: string): Promise<number | undefined> {
      const [row] = await db
        .select({ org_id: attachments.org_id })
        .from(attachments)
        .where(eq(attachments.public_id, publicId))
        .limit(1);
      return row?.org_id;
    },

    async complete(ctx: TenantContext, id: number, at: Date): Promise<AttachmentRow | undefined> {
      const [row] = await db
        .update(attachments)
        .set({ completed_at: at })
        .where(and(inOrg(ctx), eq(attachments.id, id), live, isNull(attachments.completed_at)))
        .returning();
      return row;
    },

    /** Only rows still live come back, so a caller never releases the same bytes twice. */
    async softDelete(ctx: TenantContext, ids: number[], at: Date): Promise<AttachmentRow[]> {
      if (ids.length === 0) return [];
      return db
        .update(attachments)
        .set({ deleted_at: at })
        .where(and(inOrg(ctx), inArray(attachments.id, ids), live))
        .returning();
    },

    async softDeleteForComment(ctx: TenantContext, commentId: number, at: Date): Promise<AttachmentRow[]> {
      return db
        .update(attachments)
        .set({ deleted_at: at })
        .where(and(inOrg(ctx), eq(attachments.comment_id, commentId), live))
        .returning();
    },

    /** Clears the work item as well: its hard delete would otherwise cascade the rows away with their objects. */
    async detachFromWorkItems(ctx: TenantContext, workItemIds: number[], at: Date): Promise<AttachmentRow[]> {
      if (workItemIds.length === 0) return [];
      const before = await db
        .select()
        .from(attachments)
        .where(and(inOrg(ctx), inArray(attachments.work_item_id, workItemIds)));
      if (before.length === 0) return [];
      await db
        .update(attachments)
        .set({ deleted_at: sql`coalesce(${attachments.deleted_at}, ${at})`, work_item_id: null })
        .where(and(inOrg(ctx), inArray(attachments.work_item_id, workItemIds)));
      return before.filter(r => r.deleted_at === null);
    },

    async listOnIssue(ctx: TenantContext, issueId: number, filter: AttachmentFilter = {}): Promise<AttachmentRow[]> {
      return db
        .select()
        .from(attachments)
        .where(
          and(
            inOrg(ctx),
            eq(attachments.issue_id, issueId),
            live,
            ready,
            filter.commentId === undefined ? undefined : eq(attachments.comment_id, filter.commentId),
            filter.workItemId === undefined ? undefined : eq(attachments.work_item_id, filter.workItemId),
          ),
        )
        .orderBy(asc(attachments.created_at), asc(attachments.id));
    },

    /** Finished, live files per issue, comment and work-item files included; drafts have no issue. */
    async readyCounts(ctx: TenantContext, issueIds: number[]): Promise<Map<number, number>> {
      if (issueIds.length === 0) return new Map();
      const rows = await db
        .select({ issue_id: attachments.issue_id, n: count() })
        .from(attachments)
        .where(and(inOrg(ctx), inArray(attachments.issue_id, issueIds), live, ready))
        .groupBy(attachments.issue_id);
      return new Map(rows.map(r => [r.issue_id!, r.n]));
    },

    async listOnArticle(
      ctx: TenantContext,
      articleId: number,
      filter: { commentId?: number | undefined } = {},
    ): Promise<AttachmentRow[]> {
      return db
        .select()
        .from(attachments)
        .where(
          and(
            inOrg(ctx),
            eq(attachments.article_id, articleId),
            live,
            ready,
            filter.commentId === undefined ? undefined : eq(attachments.comment_id, filter.commentId),
          ),
        )
        .orderBy(asc(attachments.created_at), asc(attachments.id));
    },

    async countOnArticle(ctx: TenantContext, articleId: number): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(attachments)
        .where(and(inOrg(ctx), eq(attachments.article_id, articleId), live));
      return row?.n ?? 0;
    },

    /** Which of these files the article's body or a live comment on it links to. */
    async referencedOnArticle(ctx: TenantContext, articleId: number, publicIds: string[]): Promise<string[]> {
      if (publicIds.length === 0) return [];
      const texts = await db
        .select({ body: articles.body_md })
        .from(articles)
        .where(and(eq(articles.org_id, ctx.orgId), eq(articles.id, articleId)))
        .union(
          db
            .select({ body: comments.body_md })
            .from(comments)
            .where(
              and(eq(comments.org_id, ctx.orgId), eq(comments.article_id, articleId), isNull(comments.deleted_at)),
            ),
        );
      const haystack = texts.map(t => t.body).join('\n');
      return publicIds.filter(id => haystack.includes(id));
    },

    /** Every row of the claimed articles the purge is about to delete, whatever its state. */
    async onArticlesDeletedBefore(ctx: TenantContext, cutoff: Date, articleIds: number[]): Promise<AttachmentRow[]> {
      if (articleIds.length === 0) return [];
      return db
        .select({ attachment: attachments })
        .from(attachments)
        .innerJoin(articles, and(eq(articles.id, attachments.article_id), eq(articles.org_id, attachments.org_id)))
        .where(and(inOrg(ctx), inArray(articles.id, articleIds), lt(articles.deleted_at, cutoff)))
        .then(rows => rows.map(r => r.attachment));
    },

    /** Pending uploads count: they already hold one of the issue's places. */
    async countOnIssue(ctx: TenantContext, issueId: number): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(attachments)
        .where(and(inOrg(ctx), eq(attachments.issue_id, issueId), live));
      return row?.n ?? 0;
    },

    /** Bytes promised to platform uploads still in flight, which the quota check must count as used. */
    async reservedBytes(ctx: TenantContext): Promise<number> {
      const [row] = await db
        .select({ n: sum(attachments.size_bytes) })
        .from(attachments)
        .where(and(inOrg(ctx), live, isNull(attachments.completed_at), onPlatform));
      return Number(row?.n ?? 0);
    },

    /** What `storage_used_bytes` should read: every completed, undeleted file in the platform bucket. */
    async platformTally(ctx: TenantContext): Promise<{ files: number; bytes: number }> {
      const [row] = await db
        .select({ files: count(), bytes: sum(attachments.size_bytes) })
        .from(attachments)
        .where(and(inOrg(ctx), live, ready, onPlatform));
      return { files: row?.files ?? 0, bytes: Number(row?.bytes ?? 0) };
    },

    /** Completed, undeleted files by where they live and what holds them, for the storage screen. */
    async storageTallies(ctx: TenantContext): Promise<StorageTallyRow[]> {
      const parentDeleted = sql<boolean>`coalesce(${issues.deleted_at}, ${articles.deleted_at}) is not null`;
      const isDraft = sql<boolean>`(${attachments.issue_id} is null and ${attachments.article_id} is null)`;
      const rows = await db
        .select({
          storage_target: attachments.storage_target,
          storage_location_id: attachments.storage_location_id,
          bucket: attachments.bucket,
          draft: isDraft,
          parent_deleted: parentDeleted,
          files: count(),
          bytes: sum(attachments.size_bytes),
        })
        .from(attachments)
        .leftJoin(issues, and(eq(issues.id, attachments.issue_id), eq(issues.org_id, attachments.org_id)))
        .leftJoin(articles, and(eq(articles.id, attachments.article_id), eq(articles.org_id, attachments.org_id)))
        .where(and(inOrg(ctx), live, ready))
        .groupBy(
          attachments.storage_target,
          attachments.storage_location_id,
          attachments.bucket,
          isDraft,
          parentDeleted,
        );
      return rows.map(r => ({ ...r, storage_target: r.storage_target as StorageTarget, bytes: Number(r.bytes ?? 0) }));
    },

    /** Completed files attached to an issue or an article, largest first by default. Drafts are their uploader's alone. */
    async listStorageFiles(
      ctx: TenantContext,
      options: StorageFileOptions,
    ): Promise<{ rows: StorageFileRow[]; total: number }> {
      const projectOf = sql<number>`coalesce(${issues.project_id}, ${articles.project_id})`;
      const where = and(
        inOrg(ctx),
        live,
        ready,
        or(isNotNull(attachments.issue_id), isNotNull(attachments.article_id)),
        options.target ? eq(attachments.storage_target, options.target) : undefined,
        options.projectId !== undefined ? eq(projectOf, options.projectId) : undefined,
      );
      const base = () =>
        db
          .select({
            attachment: attachments,
            project_id: projects.id,
            project_key: projects.key,
            issue_number: issues.key_number,
            article_slug: articles.slug,
            article_title: articles.title,
            parent_deleted_at: sql<Date | null>`coalesce(${issues.deleted_at}, ${articles.deleted_at})`,
          })
          .from(attachments)
          .leftJoin(issues, and(eq(issues.id, attachments.issue_id), eq(issues.org_id, attachments.org_id)))
          .leftJoin(articles, and(eq(articles.id, attachments.article_id), eq(articles.org_id, attachments.org_id)))
          .innerJoin(projects, and(eq(projects.id, projectOf), eq(projects.org_id, attachments.org_id)));
      const order =
        options.sort === 'size'
          ? [desc(attachments.size_bytes), desc(attachments.id)]
          : [desc(attachments.created_at), desc(attachments.id)];
      const [rows, [total]] = await Promise.all([
        base()
          .where(where)
          .orderBy(...order)
          .limit(options.limit)
          .offset(options.offset),
        db
          .select({ n: count() })
          .from(attachments)
          .leftJoin(issues, and(eq(issues.id, attachments.issue_id), eq(issues.org_id, attachments.org_id)))
          .leftJoin(articles, and(eq(articles.id, attachments.article_id), eq(articles.org_id, attachments.org_id)))
          .where(where),
      ]);
      return {
        rows: rows.map(r => ({
          ...r,
          parent_deleted_at: r.parent_deleted_at === null ? null : new Date(r.parent_deleted_at),
        })),
        total: total?.n ?? 0,
      };
    },

    /** The next files the migration moves: completed, undeleted, still on the platform, oldest first. */
    async platformBatch(ctx: TenantContext, limit: number, afterId = 0): Promise<AttachmentRow[]> {
      return db
        .select()
        .from(attachments)
        .where(and(inOrg(ctx), live, ready, onPlatform, sql`${attachments.id} > ${afterId}`))
        .orderBy(asc(attachments.id))
        .limit(limit);
    },

    /** Only a live platform row moves; a file deleted mid-copy comes back undefined. */
    async moveToLocation(
      ctx: TenantContext,
      id: number,
      location: { id: number; bucket: string },
    ): Promise<AttachmentRow | undefined> {
      const [row] = await db
        .update(attachments)
        .set({ storage_target: 'byo', storage_location_id: location.id, bucket: location.bucket })
        .where(and(inOrg(ctx), eq(attachments.id, id), live, onPlatform))
        .returning();
      return row;
    },

    async findDrafts(ctx: TenantContext, publicIds: string[], userId: number): Promise<AttachmentRow[]> {
      if (publicIds.length === 0) return [];
      return db
        .select()
        .from(attachments)
        .where(
          and(
            inOrg(ctx),
            inArray(attachments.public_id, [...new Set(publicIds)]),
            eq(attachments.created_by, userId),
            draft,
            live,
          ),
        );
    },

    async claim(ctx: TenantContext, ids: number[], target: AttachmentTarget): Promise<AttachmentRow[]> {
      if (ids.length === 0) return [];
      return db
        .update(attachments)
        .set(
          'article_id' in target
            ? { article_id: target.article_id, comment_id: target.comment_id ?? null }
            : {
                issue_id: target.issue_id,
                comment_id: target.comment_id ?? null,
                work_item_id: target.work_item_id ?? null,
              },
        )
        .where(and(inOrg(ctx), inArray(attachments.id, ids), draft, live))
        .returning();
    },

    /** Which of these files the issue's description or a live comment links to. */
    async referencedOnIssue(ctx: TenantContext, issueId: number, publicIds: string[]): Promise<string[]> {
      if (publicIds.length === 0) return [];
      const texts = await db
        .select({ body: issues.description_md })
        .from(issues)
        .where(and(eq(issues.org_id, ctx.orgId), eq(issues.id, issueId)))
        .union(
          db
            .select({ body: comments.body_md })
            .from(comments)
            .where(and(eq(comments.org_id, ctx.orgId), eq(comments.issue_id, issueId), isNull(comments.deleted_at))),
        );
      const haystack = texts.map(t => t.body ?? '').join('\n');
      return publicIds.filter(id => haystack.includes(id));
    },

    /**
     * Abandoned uploads, unclaimed drafts and deleted rows, across every organisation, for the sweep.
     * Files at a location whose connection is failing wait for it, without holding back the rest.
     */
    async expired(_ctx: SystemContext, options: ExpiredAttachments): Promise<AttachmentRow[]> {
      const waiting = sql`exists (select 1 from ${org_storage_configs} c where c.org_id = ${attachments.org_id} and c.location_id = ${attachments.storage_location_id} and c.status = 'failed' and c.verified_at is not null)`;
      return db
        .select()
        .from(attachments)
        .where(
          and(
            or(
              isNotNull(attachments.deleted_at),
              and(isNull(attachments.completed_at), lt(attachments.created_at, options.pendingBefore)),
              and(draft, lt(attachments.created_at, options.draftBefore)),
            ),
            or(onPlatform, sql`not ${waiting}`),
          ),
        )
        .orderBy(asc(attachments.id))
        .limit(options.limit);
    },

    /** Any state, any target: `org.delete` removes every one, object first. */
    async listForOrg(ctx: TenantContext, limit: number): Promise<AttachmentRow[]> {
      return db
        .select()
        .from(attachments)
        .where(eq(attachments.org_id, ctx.orgId))
        .orderBy(asc(attachments.id))
        .limit(limit);
    },

    async hardDelete(ctx: TenantContext, ids: number[]): Promise<number> {
      if (ids.length === 0) return 0;
      const rows = await db
        .delete(attachments)
        .where(and(inOrg(ctx), inArray(attachments.id, ids)))
        .returning({ id: attachments.id });
      return rows.length;
    },

    /** Every row of the claimed issues the purge is about to delete, whatever its state. */
    async onIssuesDeletedBefore(ctx: TenantContext, cutoff: Date, issueIds: number[]): Promise<AttachmentRow[]> {
      if (issueIds.length === 0) return [];
      return db
        .select({ attachment: attachments })
        .from(attachments)
        .innerJoin(issues, and(eq(issues.id, attachments.issue_id), eq(issues.org_id, attachments.org_id)))
        .where(and(inOrg(ctx), inArray(issues.id, issueIds), lt(issues.deleted_at, cutoff)))
        .then(rows => rows.map(r => r.attachment));
    },
  };
}

export type AttachmentsRepository = ReturnType<typeof attachmentsRepository>;
