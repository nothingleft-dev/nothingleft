import { ISSUE_HIERARCHY_MAX_DEPTH, type IssueLinkSnapshot } from '@nothingleft/types';
import type { IssueRow, TenantContext } from '@nothingleft/db';
import { AppError } from '@lib/errors';
import { recordIssueEvent, type ChangeContext } from '@services/issue-history';
import type { TenantRepos } from '@services/transaction';

export interface ParentMove {
  ctx: TenantContext;
  child: IssueRow;
  parent: IssueRow | null;
  keyOf: (row: IssueRow) => string;
}

/**
 * Same project, no cycle, at most ISSUE_HIERARCHY_MAX_DEPTH levels once the child's own subtree
 * hangs below. Answers the parent being replaced, for the history.
 */
export async function checkParent(repos: TenantRepos, move: ParentMove): Promise<IssueRow | null> {
  const { ctx, child, parent, keyOf } = move;
  const previous = child.parent_id === null ? null : ((await repos.issues.findById(ctx, child.parent_id)) ?? null);
  if (!parent) return previous;
  const params = { key: keyOf(child), parent: keyOf(parent) };
  if (parent.id === child.id) throw new AppError('issue.parent_self', 400, {}, 'parent');
  if (parent.project_id !== child.project_id) {
    throw new AppError('issue.parent_other_project', 400, params, 'parent');
  }
  const ancestors = await repos.issues.ancestorIds(ctx, parent.id);
  if (ancestors.includes(child.id)) throw new AppError('issue.hierarchy_cycle', 400, params, 'parent');
  const height = await repos.issues.subtreeHeight(ctx, child.id);
  if (ancestors.length + 1 + height > ISSUE_HIERARCHY_MAX_DEPTH) {
    throw new AppError('issue.hierarchy_too_deep', 400, params, 'parent');
  }
  return previous;
}

/** The one writer of spent_minutes. */
export async function refreshSpentRollup(repos: TenantRepos, ctx: TenantContext, issueIds: (number | null)[]) {
  await repos.issues.refreshSpentRollup(
    ctx,
    issueIds.filter((id): id is number => id !== null),
  );
}

/**
 * The child records parent_changed; each parent records the subtask link it gained or lost,
 * so both issue pages explain the change, and both ancestor chains get their rollup back.
 * The caller has already written parent_id.
 */
export async function recordParentChange(
  repos: TenantRepos,
  change: Omit<ChangeContext, 'issueId'>,
  move: ParentMove & { previous: IssueRow | null },
): Promise<void> {
  const { child, parent, previous, keyOf } = move;
  const ref = (row: IssueRow | null) => (row ? { key: keyOf(row) } : null);
  await recordIssueEvent(repos.issueActivity, { ...change, issueId: child.id }, 'parent_changed', {
    old_value: ref(previous),
    new_value: ref(parent),
  });
  const subtask: IssueLinkSnapshot = { link: 'parent for', issue: keyOf(child) };
  if (previous) {
    await recordIssueEvent(repos.issueActivity, { ...change, issueId: previous.id }, 'unlinked', {
      old_value: subtask,
    });
  }
  if (parent) {
    await recordIssueEvent(repos.issueActivity, { ...change, issueId: parent.id }, 'linked', { new_value: subtask });
  }
  await refreshSpentRollup(repos, move.ctx, [previous?.id ?? null, parent?.id ?? null]);
}
