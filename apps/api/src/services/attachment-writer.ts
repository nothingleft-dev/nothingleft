import {
  ATTACHMENTS_PER_ARTICLE_MAX,
  ATTACHMENTS_PER_ISSUE_MAX,
  STORAGE_CRITICAL_PERCENT,
  type AttachmentSnapshot,
  type OrgPlan,
  type StorageNoticeLevel,
} from '@nothingleft/types';
import type { AttachmentRow, TenantContext } from '@nothingleft/db';
import { AppError } from '@lib/errors';
import { recordIssueEvent, type ChangeContext } from '@services/issue-history';
import type { TenantRepos } from '@services/transaction';

type Repos = Pick<TenantRepos, 'attachments' | 'issueActivity' | 'organizations'>;

export const attachmentSnapshot = (row: AttachmentRow): AttachmentSnapshot => ({
  attachment_id: row.public_id,
  filename: row.filename,
  mime_type: row.mime_type,
  size_bytes: row.size_bytes,
  comment_id: row.comment_id,
  work_item_id: row.work_item_id,
});

export async function requireRoomOnIssue(
  repos: Repos,
  ctx: TenantContext,
  issueId: number,
  adding: number,
  key: string,
) {
  if ((await repos.attachments.countOnIssue(ctx, issueId)) + adding > ATTACHMENTS_PER_ISSUE_MAX) {
    throw new AppError('attachment.issue_limit', 409, { key, max: ATTACHMENTS_PER_ISSUE_MAX });
  }
}

export interface Claim {
  change: ChangeContext;
  key: string;
  commentId?: number | null;
  workItemId?: number | null;
}

/**
 * Draft uploads from a create form join the issue, comment or work item that form just
 * made, with `attached` history in the create's change group. The caller holds the issue lock.
 */
export async function claimDrafts(repos: Repos, claim: Claim, publicIds: readonly string[] | undefined) {
  const wanted = [...new Set(publicIds ?? [])];
  if (wanted.length === 0) return;
  const { ctx, issueId, actorId } = claim.change;
  if (actorId === null) throw new Error('only a person claims draft uploads');
  const drafts = await claimable(repos, ctx, actorId, wanted);
  await requireRoomOnIssue(repos, ctx, issueId, drafts.length, claim.key);

  const order = new Map(wanted.map((id, i) => [id, i]));
  const claimed = await repos.attachments.claim(
    ctx,
    drafts.map(d => d.id),
    { issue_id: issueId, comment_id: claim.commentId ?? null, work_item_id: claim.workItemId ?? null },
  );
  claimed.sort((a, b) => order.get(a.public_id)! - order.get(b.public_id)!);
  for (const row of claimed) {
    await recordIssueEvent(repos.issueActivity, claim.change, 'attached', { new_value: attachmentSnapshot(row) });
  }
}

export async function requireRoomOnArticle(
  repos: Repos,
  ctx: TenantContext,
  articleId: number,
  adding: number,
  slug: string,
) {
  if ((await repos.attachments.countOnArticle(ctx, articleId)) + adding > ATTACHMENTS_PER_ARTICLE_MAX) {
    throw new AppError('attachment.article_limit', 409, { slug, max: ATTACHMENTS_PER_ARTICLE_MAX });
  }
}

async function claimable(repos: Repos, ctx: TenantContext, actorId: number, publicIds: readonly string[]) {
  const drafts = await repos.attachments.findDrafts(ctx, [...publicIds], actorId);
  const missing = publicIds.find(id => !drafts.some(d => d.public_id === id));
  if (missing) throw new AppError('attachment.not_a_draft', 400, { id: missing }, 'attachment_ids');
  const uploading = drafts.find(d => d.completed_at === null);
  if (uploading) {
    throw new AppError('attachment.upload_incomplete', 409, { filename: uploading.filename }, 'attachment_ids');
  }
  return drafts;
}

/** As claimDrafts, for a new article or a comment on one; articles keep no history, so nothing is recorded. */
export async function claimArticleDrafts(
  repos: Repos,
  claim: { ctx: TenantContext; articleId: number; actorId: number; slug: string; commentId?: number | null },
  publicIds: readonly string[] | undefined,
) {
  const wanted = [...new Set(publicIds ?? [])];
  if (wanted.length === 0) return;
  const drafts = await claimable(repos, claim.ctx, claim.actorId, wanted);
  await requireRoomOnArticle(repos, claim.ctx, claim.articleId, drafts.length, claim.slug);
  await repos.attachments.claim(
    claim.ctx,
    drafts.map(d => d.id),
    { article_id: claim.articleId, comment_id: claim.commentId ?? null },
  );
}

/** The notice level after usage moves: rising is the service's to announce, falling below 95% re-arms both emails. */
export function noticeLevelFor(used: number, limit: number, current: StorageNoticeLevel): StorageNoticeLevel {
  return (used / limit) * 100 < STORAGE_CRITICAL_PERCENT ? 0 : current;
}

/** Gives back the bytes of platform rows that had completed; pending rows and the customer's own bucket never counted. */
export async function releaseStorage(
  repos: Repos,
  ctx: TenantContext,
  released: AttachmentRow[],
  storageLimit: (plan: OrgPlan) => number,
): Promise<void> {
  const bytes = released
    .filter(r => r.completed_at !== null && r.storage_target === 'platform')
    .reduce((n, r) => n + r.size_bytes, 0);
  if (bytes === 0) return;
  const used = await repos.organizations.adjustStorageUsed(ctx, -bytes);
  const org = await repos.organizations.findById(ctx);
  if (!org) return;
  const current = org.storage_notice_level as StorageNoticeLevel;
  const next = noticeLevelFor(used, storageLimit(org.plan as OrgPlan), current);
  if (next !== current) await repos.organizations.setStorageNoticeLevel(ctx, next);
}
