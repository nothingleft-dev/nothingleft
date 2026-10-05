import {
  ATTACHMENT_DOWNLOAD_TTL_SECONDS,
  ATTACHMENT_DRAFT_TTL_DAYS,
  ATTACHMENT_INLINE_MIME_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_UPLOAD_TTL_SECONDS,
  STORAGE_CRITICAL_PERCENT,
  type Attachment,
  type AttachmentPresign,
  type OrgPlan,
  type Principal,
  type PresignAttachment,
  type StorageNoticeLevel,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type ArticlesRepository,
  type AttachmentRow,
  type AttachmentsRepository,
  type CommentsRepository,
  type IssuesRepository,
  type OrganizationRow,
  type OrganizationsRepository,
  type TenantContext,
  type WorkItemsRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { formatBytes } from '@nothingleft/format';
import {
  ATTACHMENT_PENDING_TTL_MS,
  ATTACHMENT_REDIRECT_MAX_AGE_SECONDS,
  ATTACHMENT_SWEEP_BATCH,
} from '@config/constants';
import { AppError } from '@lib/errors';
import type { Mailer } from '@lib/email';
import type { JobQueue } from '@lib/jobs';
import type { AccessService, OrgAccess, ProjectAccess } from '@services/access';
import type { ArticlesService, LocatedArticle } from '@services/articles.service';
import {
  attachmentSnapshot,
  releaseStorage,
  requireRoomOnArticle,
  requireRoomOnIssue,
} from '@services/attachment-writer';
import { recordIssueEvent, type ChangeContext } from '@services/issue-history';
import { isByoUnavailable, type ObjectStores } from '@services/object-stores';
import type { IssuesService, Located } from '@services/issues.service';
import { can } from '@services/permissions';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

export interface AttachmentsDeps {
  access: AccessService;
  issues: IssuesService;
  issuesRepo: IssuesRepository;
  attachments: AttachmentsRepository;
  comments: CommentsRepository;
  workItems: WorkItemsRepository;
  articles: ArticlesRepository;
  /** Read lazily: the articles service is built after this one. */
  articlesService: () => ArticlesService;
  organizations: OrganizationsRepository;
  inTransaction: InTenantTransaction;
  stores: ObjectStores;
  /** Read lazily: pg-boss replaces the recording queue once jobs start. */
  queue: () => JobQueue;
  filesBaseUrl: string;
  /** Already wrapped in bestEffort: a storage email never fails the upload that triggered it. */
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
  now?: () => Date;
}

export interface AttachmentListFilter {
  commentId?: number | undefined;
  workItemId?: number | undefined;
}

export interface Download {
  location: string;
  maxAge: number;
}

/** An attachment the caller may see, with where it hangs. A draft has neither an issue nor an article. */
interface Found {
  org: OrgAccess;
  row: AttachmentRow;
  located: Located | null;
  article: LocatedArticle | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const sys = systemContext('a file URL carries only the attachment id, not its organisation');

const inlineMime = new Set<string>(ATTACHMENT_INLINE_MIME_TYPES);

/** RFC 6266: an ASCII fallback plus the exact UTF-8 name. */
export function contentDisposition(mime: string, filename: string): string {
  const kind = inlineMime.has(mime) ? 'inline' : 'attachment';
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function attachmentsService(deps: AttachmentsDeps) {
  const { access, issues, issuesRepo, attachments, inTransaction, stores, analytics, mailer } = deps;
  const now = deps.now ?? (() => new Date());
  const filesBase = deps.filesBaseUrl.replace(/\/$/, '');

  const notFound = (id: string) => new AppError('attachment.not_found', 404, { id }, 'id');

  const fileUrl = (row: AttachmentRow) => `${filesBase}/${row.public_id}/${encodeURIComponent(row.filename)}`;

  const objectKey = (orgId: number, module: string, moduleId: number, publicId: string) =>
    `api/${orgId}/${module}/${moduleId}/${publicId}`;

  function writable(project: ProjectAccess): boolean {
    return !project.project.is_archived;
  }

  function canDelete(principal: Principal, row: AttachmentRow, holder: ProjectAccess | null): boolean {
    if (!holder) return row.created_by === principal.userId;
    const scope = { ...holder.scope, isOwnRecord: row.created_by === principal.userId };
    return writable(holder) && can(principal, 'attachment.delete', scope);
  }

  async function dtos(
    principal: Principal,
    ctx: TenantContext,
    rows: AttachmentRow[],
    located: Located | null,
    article: LocatedArticle | null = null,
  ): Promise<Attachment[]> {
    if (rows.length === 0) return [];
    const publicIds = rows.map(r => r.public_id);
    const [people, inline, available] = await Promise.all([
      issuesRepo.findPeople(ctx, [...new Set(rows.map(r => r.created_by))]),
      located
        ? attachments.referencedOnIssue(ctx, located.issue.id, publicIds)
        : article
          ? attachments.referencedOnArticle(ctx, article.article.id, publicIds)
          : Promise.resolve([]),
      stores.availability(ctx, rows),
    ]);
    const byId = new Map(people.map(p => [p.user.id, p]));
    const inlineIds = new Set(inline);
    const issueKey = located ? issues.keyIn(located.project)(located.issue) : null;
    return rows.map(row => {
      const person = byId.get(row.created_by);
      return {
        id: row.public_id,
        filename: row.filename,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        url: fileUrl(row),
        width: row.width,
        height: row.height,
        issue: row.issue_id === null ? null : issueKey,
        article:
          row.article_id === null || !article
            ? null
            : { project: article.project.project.key, slug: article.article.slug },
        comment_id: row.comment_id,
        work_item_id: row.work_item_id,
        status: row.completed_at ? 'ready' : 'pending',
        available: available(row),
        inline: inlineIds.has(row.public_id),
        created_by: person
          ? access.memberRef(person.user, person.membership)
          : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false },
        created_at: row.created_at.toISOString(),
        deleted_at: row.deleted_at?.toISOString() ?? null,
        me: {
          can_delete:
            row.deleted_at === null && canDelete(principal, row, located?.project ?? article?.project ?? null),
        },
      };
    });
  }

  const one = async (principal: Principal, found: Found): Promise<Attachment> =>
    (await dtos(principal, found.org.ctx, [found.row], found.located, found.article))[0]!;

  /**
   * Anything the caller cannot see answers 404: another organisation's file, a file on an issue
   * they cannot read or that is deleted, and someone else's draft or unfinished upload.
   */
  async function find(principal: Principal, publicId: string): Promise<Found> {
    const orgId = await attachments.orgOfPublicId(sys, publicId);
    if (orgId === undefined) throw notFound(publicId);
    let org: OrgAccess;
    try {
      org = await access.orgById(principal, orgId);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) throw notFound(publicId);
      throw error;
    }
    const row = await attachments.findByPublicId(org.ctx, publicId);
    if (!row || row.deleted_at) throw notFound(publicId);
    const mine = row.created_by === principal.userId;
    if (!row.completed_at && !mine) throw notFound(publicId);
    if (row.article_id !== null) {
      const article = await deps.articles.findById(org.ctx, row.article_id);
      if (!article || article.deleted_at) throw notFound(publicId);
      let project: ProjectAccess;
      try {
        project = await access.projectById(principal, org, article.project_id);
      } catch (error) {
        if (error instanceof AppError && error.status === 404) throw notFound(publicId);
        throw error;
      }
      if (!deps.articlesService().readable(principal, project, article)) throw notFound(publicId);
      return { org, row, located: null, article: { project, article } };
    }
    if (row.issue_id === null) {
      if (!mine) throw notFound(publicId);
      return { org, row, located: null, article: null };
    }
    const issue = await issuesRepo.findById(org.ctx, row.issue_id);
    if (!issue || issue.deleted_at) throw notFound(publicId);
    let project: ProjectAccess;
    try {
      project = await access.projectById(principal, org, issue.project_id);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) throw notFound(publicId);
      throw error;
    }
    if (!can(principal, 'issue.read', project.scope)) throw notFound(publicId);
    return { org, row, located: { project, issue }, article: null };
  }

  function requireUpload(principal: Principal, project: ProjectAccess) {
    issues.requireWritable(principal, project, 'attachment.upload');
  }

  /** Where the file will hang, checked before anything is written: the target must exist and be the caller's to change. */
  async function uploadTarget(
    principal: Principal,
    input: PresignAttachment,
    hints: OrgHints,
  ): Promise<{
    project: ProjectAccess;
    located: Located | null;
    article: LocatedArticle | null;
    module: string;
    moduleId: number;
  }> {
    if (input.article !== undefined) {
      const article = await deps.articlesService().locate(principal, input.project!, input.article, hints);
      requireUpload(principal, article.project);
      if (input.comment_id !== undefined) {
        const found = await deps.comments.findOnArticle(article.project.ctx, article.article.id, input.comment_id);
        if (!found) {
          throw new AppError(
            'comment.not_found',
            404,
            { id: input.comment_id, key: article.article.slug },
            'comment_id',
          );
        }
        access.require(principal, 'comment.update', {
          ...article.project.scope,
          isOwnRecord: found.comment.author_id === principal.userId,
        });
        return { project: article.project, located: null, article, module: 'comments', moduleId: found.comment.id };
      }
      return { project: article.project, located: null, article, module: 'articles', moduleId: article.article.id };
    }
    if (input.project !== undefined) {
      const project = await access.project(principal, input.project, hints);
      requireUpload(principal, project);
      return { project, located: null, article: null, module: 'drafts', moduleId: principal.userId };
    }
    const located = await issues.locate(principal, input.issue!, hints);
    requireUpload(principal, located.project);
    const key = issues.keyIn(located.project)(located.issue);
    if (input.comment_id !== undefined) {
      const found = await deps.comments.findOnIssue(located.project.ctx, located.issue.id, input.comment_id);
      if (!found) throw new AppError('comment.not_found', 404, { id: input.comment_id, key }, 'comment_id');
      access.require(principal, 'comment.update', {
        ...located.project.scope,
        isOwnRecord: found.comment.author_id === principal.userId,
      });
      return { project: located.project, located, article: null, module: 'comments', moduleId: found.comment.id };
    }
    if (input.work_item_id !== undefined) {
      const found = await deps.workItems.findOnIssue(located.project.ctx, located.issue.id, input.work_item_id);
      if (!found) throw new AppError('work_item.not_found', 404, { id: input.work_item_id, key }, 'work_item_id');
      access.require(principal, 'work_item.update', {
        ...located.project.scope,
        isOwnRecord: found.item.author_id === principal.userId,
      });
      if (!located.project.project.time_tracking_enabled) {
        throw new AppError('time_tracking.disabled', 409, { key: located.project.project.key });
      }
      return { project: located.project, located, article: null, module: 'work-items', moduleId: found.item.id };
    }
    return { project: located.project, located, article: null, module: 'issues', moduleId: located.issue.id };
  }

  async function notifyAdmins(ctx: TenantContext, org: OrganizationRow, level: Exclude<StorageNoticeLevel, 0>) {
    const limit = access.storageLimit(org.plan as OrgPlan);
    const admins = await deps.organizations.listAdmins(ctx);
    const key = level === 100 ? 'storage_full' : 'storage_almost_full';
    for (const admin of admins) {
      await mailer.send({
        to: admin.user.email,
        subject: `email.${key}.subject`,
        body: `email.${key}.body`,
        params: {
          name: admin.user.name,
          org: org.name,
          used: formatBytes(org.storage_used_bytes),
          limit: formatBytes(limit),
          percent: Math.min(100, Math.floor((org.storage_used_bytes / limit) * 100)),
          url: `${deps.appBaseUrl}/organization`,
        },
      });
    }
  }

  const changeOn = (ctx: TenantContext, issueId: number, actorId: number, at: Date): ChangeContext => ({
    ctx,
    issueId,
    actorId,
    changeGroupId: Bun.randomUUIDv7(),
    at,
  });

  return {
    /** The 95% and 100% storage emails, for the reconcile job's correction too. */
    noticeAdmins: notifyAdmins,

    async presign(principal: Principal, input: PresignAttachment, hints: OrgHints = {}): Promise<AttachmentPresign> {
      const target = await uploadTarget(principal, input, hints);
      const { project, located, article } = target;
      const ctx = project.ctx;
      const destination = await stores.forUpload(ctx);
      if (input.size > ATTACHMENT_MAX_BYTES) {
        throw new AppError(
          'attachment.too_large',
          413,
          { filename: input.filename, size: formatBytes(input.size), max: formatBytes(ATTACHMENT_MAX_BYTES) },
          'size',
        );
      }

      const outcome = await inTransaction(async repos => {
        const org = await repos.organizations.lockById(ctx);
        if (!org) throw AppError.notFound();
        const limit = access.storageLimit(org.plan as OrgPlan);
        const reserved = destination.target === 'platform' ? await repos.attachments.reservedBytes(ctx) : 0;
        if (destination.target === 'platform' && org.storage_used_bytes + reserved + input.size > limit) {
          const firstRefusal = (org.storage_notice_level as StorageNoticeLevel) < 100;
          if (firstRefusal) await repos.organizations.setStorageNoticeLevel(ctx, 100);
          return { refused: true as const, org, limit, firstRefusal };
        }
        if (located) {
          await repos.issues.lockById(ctx, located.issue.id);
          await requireRoomOnIssue(repos, ctx, located.issue.id, 1, issues.keyIn(project)(located.issue));
        }
        if (article) {
          await repos.articles.lockById(ctx, article.article.id);
          await requireRoomOnArticle(repos, ctx, article.article.id, 1, article.article.slug);
        }
        const publicId = crypto.randomUUID();
        const row = await repos.attachments.insert(ctx, {
          public_id: publicId,
          issue_id: located?.issue.id ?? null,
          article_id: article?.article.id ?? null,
          comment_id: target.module === 'comments' ? target.moduleId : null,
          work_item_id: target.module === 'work-items' ? target.moduleId : null,
          filename: input.filename,
          mime_type: input.mime,
          size_bytes: input.size,
          checksum: Buffer.from(input.sha256, 'base64'),
          storage_target: destination.target,
          storage_location_id: destination.row?.location_id ?? null,
          bucket: destination.store.bucket,
          object_key: objectKey(ctx.orgId, target.module, target.moduleId, publicId),
          width: input.width ?? null,
          height: input.height ?? null,
          created_by: principal.userId,
          created_at: now(),
        });
        return { refused: false as const, row };
      });

      if (outcome.refused) {
        if (outcome.firstRefusal) await notifyAdmins(ctx, outcome.org, 100);
        throw new AppError('storage.quota_exceeded', 409, {
          used: formatBytes(outcome.org.storage_used_bytes),
          limit: formatBytes(outcome.limit),
        });
      }

      const upload = await destination.store.presignPut(
        outcome.row.object_key,
        { contentType: input.mime, size: input.size, sha256: input.sha256 },
        ATTACHMENT_UPLOAD_TTL_SECONDS,
      );
      return {
        attachment: await one(principal, { org: project, row: outcome.row, located, article }),
        upload_url: upload.url,
        upload_headers: upload.headers,
        expires_in: ATTACHMENT_UPLOAD_TTL_SECONDS,
      };
    },

    /** Idempotent: completing a finished upload answers it unchanged. */
    async complete(principal: Principal, publicId: string): Promise<Attachment> {
      const found = await find(principal, publicId);
      const { org, row, located, article } = found;
      if (row.created_by !== principal.userId) throw notFound(publicId);
      if (row.completed_at) return one(principal, found);

      const ctx = org.ctx;
      const source = await stores.forObject(ctx, row);
      const head = source.row
        ? await stores.guard(ctx, source.row, 'get', () => source.store.head(row.object_key))
        : await source.store.head(row.object_key);
      if (!head) throw new AppError('attachment.upload_missing', 400, {}, 'id');
      const hash = Buffer.from(row.checksum).toString('base64');
      if (head.size !== row.size_bytes || (head.sha256 !== undefined && head.sha256 !== hash)) {
        throw new AppError('attachment.upload_mismatch', 400, {}, 'id');
      }

      const onPlatform = row.storage_target === 'platform';
      const result = await inTransaction(async repos => {
        if (located) {
          const issue = await repos.issues.lockById(ctx, located.issue.id);
          if (!issue || issue.deleted_at) throw notFound(publicId);
        }
        if (article) {
          const current = await repos.articles.lockById(ctx, article.article.id);
          if (!current || current.deleted_at) throw notFound(publicId);
        }
        const at = now();
        const completed = await repos.attachments.complete(ctx, row.id, at);
        if (!completed) return { row: (await repos.attachments.findByPublicId(ctx, publicId))!, notice: null };
        let notice: OrganizationRow | null = null;
        if (onPlatform) {
          const used = await repos.organizations.adjustStorageUsed(ctx, completed.size_bytes);
          const orgRow = (await repos.organizations.findById(ctx))!;
          const limit = access.storageLimit(orgRow.plan as OrgPlan);
          if ((used / limit) * 100 >= STORAGE_CRITICAL_PERCENT && orgRow.storage_notice_level < 95) {
            await repos.organizations.setStorageNoticeLevel(ctx, 95);
            notice = orgRow;
          }
        }
        if (located) {
          await repos.issues.update(ctx, located.issue.id, { updated_at: at });
          await recordIssueEvent(
            repos.issueActivity,
            changeOn(ctx, located.issue.id, principal.userId, at),
            'attached',
            {
              new_value: attachmentSnapshot(completed),
            },
          );
        }
        return { row: completed, notice };
      });

      if (result.notice) await notifyAdmins(ctx, result.notice, 95);
      // Presigned before the bucket was verified: it follows the rest of the files across.
      if (onPlatform && (await stores.connection(ctx))?.status === 'verified') {
        await deps
          .queue()
          .send('storage.migrate', { org_id: ctx.orgId }, { startAfter: now(), singletonKey: `org:${ctx.orgId}` });
      }
      analytics.capture(
        'attachment_uploaded',
        {
          via: principal.via,
          size_bytes: result.row.size_bytes,
          image: result.row.mime_type.startsWith('image/'),
          draft: result.row.issue_id === null && result.row.article_id === null,
        },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return one(principal, { ...found, row: result.row });
    },

    async get(principal: Principal, publicId: string): Promise<Attachment> {
      return one(principal, await find(principal, publicId));
    },

    async listForIssue(
      principal: Principal,
      key: string,
      filter: AttachmentListFilter = {},
      hints: OrgHints = {},
    ): Promise<Attachment[]> {
      const located = await issues.locate(principal, key, hints);
      access.require(principal, 'attachment.download', located.project.scope);
      const issueKey = issues.keyIn(located.project)(located.issue);
      const ctx = located.project.ctx;
      if (filter.commentId !== undefined) {
        const comment = await deps.comments.findOnIssue(ctx, located.issue.id, filter.commentId);
        if (!comment) throw new AppError('comment.not_found', 404, { id: filter.commentId, key: issueKey }, 'id');
      }
      if (filter.workItemId !== undefined) {
        const item = await deps.workItems.findOnIssue(ctx, located.issue.id, filter.workItemId);
        if (!item) throw new AppError('work_item.not_found', 404, { id: filter.workItemId, key: issueKey }, 'id');
      }
      const rows = await attachments.listOnIssue(ctx, located.issue.id, filter);
      return dtos(principal, ctx, rows, located);
    },

    async listForArticle(
      principal: Principal,
      key: string,
      slug: string,
      filter: { commentId?: number | undefined } = {},
      hints: OrgHints = {},
    ): Promise<Attachment[]> {
      const article = await deps.articlesService().locate(principal, key, slug, hints);
      access.require(principal, 'attachment.download', article.project.scope);
      const ctx = article.project.ctx;
      if (filter.commentId !== undefined) {
        const comment = await deps.comments.findOnArticle(ctx, article.article.id, filter.commentId);
        if (!comment) throw new AppError('comment.not_found', 404, { id: filter.commentId, key: slug }, 'id');
      }
      const rows = await attachments.listOnArticle(ctx, article.article.id, filter);
      return dtos(principal, ctx, rows, null, article);
    },

    async remove(principal: Principal, publicId: string): Promise<Attachment> {
      const found = await find(principal, publicId);
      const { org, row, located, article } = found;
      const holder = located?.project ?? article?.project;
      if (holder) {
        access.require(principal, 'attachment.delete', {
          ...holder.scope,
          isOwnRecord: row.created_by === principal.userId,
        });
        if (!writable(holder)) {
          throw new AppError('project.archived', 409, { key: holder.project.key });
        }
      }
      const ctx = org.ctx;
      const deleted = await inTransaction(async repos => {
        if (located) await repos.issues.lockById(ctx, located.issue.id);
        if (article) await repos.articles.lockById(ctx, article.article.id);
        const at = now();
        const [gone] = await repos.attachments.softDelete(ctx, [row.id], at);
        if (!gone) throw notFound(publicId);
        await releaseStorage(repos, ctx, [gone], access.storageLimit);
        if (located && gone.completed_at) {
          await repos.issues.update(ctx, located.issue.id, { updated_at: at });
          await recordIssueEvent(
            repos.issueActivity,
            changeOn(ctx, located.issue.id, principal.userId, at),
            'detached',
            {
              old_value: attachmentSnapshot(gone),
            },
          );
        }
        return gone;
      });
      return one(principal, { ...found, row: deleted });
    },

    /** The file route: authorise, then hand back a short-lived signed URL. Bytes never pass through the API. */
    async download(principal: Principal, publicId: string): Promise<Download> {
      const found = await find(principal, publicId);
      if (!found.row.completed_at) throw notFound(publicId);
      const holder = found.located?.project ?? found.article?.project;
      if (holder) access.require(principal, 'attachment.download', holder.scope);
      // Signing is local: a disconnected or failing bucket is refused here, from the row, without a call to it.
      const { store } = await stores.forObject(found.org.ctx, found.row);
      const location = await store.presignGet(
        found.row.object_key,
        {
          contentType: found.row.mime_type,
          disposition: contentDisposition(found.row.mime_type, found.row.filename),
        },
        ATTACHMENT_DOWNLOAD_TTL_SECONDS,
      );
      return { location, maxAge: ATTACHMENT_REDIRECT_MAX_AGE_SECONDS };
    },

    /** The hourly attachments.sweep: abandoned uploads, unclaimed drafts and deleted files. */
    async sweepExpired(): Promise<number> {
      if (!stores.platformConfigured()) return 0;
      const at = now().getTime();
      const rows = await attachments.expired(
        systemContext('the hourly sweep has no actor and spans every organisation'),
        {
          pendingBefore: new Date(at - ATTACHMENT_PENDING_TTL_MS),
          draftBefore: new Date(at - ATTACHMENT_DRAFT_TTL_DAYS * DAY_MS),
          limit: ATTACHMENT_SWEEP_BATCH,
        },
      );
      const byOrg = Map.groupBy(rows, r => r.org_id);
      let swept = 0;
      for (const [orgId, orgRows] of byOrg) {
        const ctx = tenantContext(orgId);
        try {
          await stores.deleteObjects(ctx, orgRows);
          swept += await inTransaction(async repos => {
            await releaseStorage(
              repos,
              ctx,
              orgRows.filter(r => r.deleted_at === null),
              access.storageLimit,
            );
            return repos.attachments.hardDelete(
              ctx,
              orgRows.map(r => r.id),
            );
          });
        } catch (error) {
          // As with the purge: one organisation's unreachable bucket must not stall everyone's cleanup.
          if (!isByoUnavailable(error)) analytics.captureException(error, { org_id: orgId });
        }
      }
      return swept;
    },
  };
}

export type AttachmentsService = ReturnType<typeof attachmentsService>;
