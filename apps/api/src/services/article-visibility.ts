import type { ArticleRow } from '@nothingleft/db';
import type { Principal } from '@nothingleft/types';
import { can, type Scope } from '@services/permissions';

export interface DraftReach {
  ownDrafts: boolean;
  admin: boolean;
}

/** What a reader's role in one project shows of its drafts: their own, and everyone's. */
export function draftReach(principal: Principal, scope: Scope): DraftReach {
  return {
    ownDrafts: can(principal, 'article.read_draft', { ...scope, isOwnRecord: true }),
    admin: can(principal, 'article.read_draft', { ...scope, isOwnRecord: false }),
  };
}

export interface ArticleReach {
  userId: number;
  projectIds: readonly number[];
  ownDraftProjectIds: readonly number[];
  adminProjectIds: readonly number[];
}

export function articleVisibleTo(
  reach: ArticleReach,
  row: Pick<ArticleRow, 'project_id' | 'status' | 'created_by'>,
): boolean {
  return (
    reach.projectIds.includes(row.project_id) &&
    (row.status === 'published' ||
      (row.created_by === reach.userId && reach.ownDraftProjectIds.includes(row.project_id)) ||
      reach.adminProjectIds.includes(row.project_id))
  );
}
