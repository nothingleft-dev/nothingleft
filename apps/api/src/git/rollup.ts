import type {
  GitCheckConclusion,
  GitCheckStatus,
  GitCiState,
  GitDevelopmentRollup,
  GitPullRequestState,
  GitReviewerState,
  GitReviewState,
} from '@nothingleft/types';
import type { EventActor, ReviewState } from '@git/events';

const FAILED = new Set<GitCheckConclusion>(['failure', 'timed_out', 'cancelled', 'action_required']);
const PASSED = new Set<GitCheckConclusion>(['success', 'neutral', 'skipped']);

export interface CheckState {
  status: GitCheckStatus | string;
  conclusion: GitCheckConclusion | string | null;
}

/** Over the checks of the pull request's current head only: any failure fails it, any check still going keeps it running. */
export function ciState(checks: readonly CheckState[]): GitCiState {
  if (checks.some(c => c.status === 'completed' && FAILED.has(c.conclusion as GitCheckConclusion))) return 'failing';
  if (checks.some(c => c.status !== 'completed')) return 'running';
  if (checks.length > 0 && checks.every(c => PASSED.has(c.conclusion as GitCheckConclusion))) return 'passing';
  return 'none';
}

export function ciSummary(checks: readonly CheckState[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const c of checks) {
    const key = c.status === 'completed' ? (c.conclusion ?? 'completed') : c.status;
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}

export interface StoredReviewer {
  login: string | null;
  provider_user_id: string | null;
  user_id: number | null;
  avatar_url: string | null;
  state: GitReviewerState;
  at: string | null;
}

const sameReviewer = (
  a: Pick<StoredReviewer, 'login' | 'provider_user_id'>,
  b: Pick<EventActor, 'login' | 'provider_user_id'>,
) =>
  (a.provider_user_id !== null && a.provider_user_id === b.provider_user_id) ||
  (a.login !== null && b.login !== null && a.login.toLowerCase() === b.login.toLowerCase());

/**
 * The latest review per reviewer wins; a review older than the one held changes nothing, and a
 * comment leaves an approval or a change request standing, as the providers count them.
 */
export function applyReview(
  reviewers: readonly StoredReviewer[],
  reviewer: EventActor,
  state: ReviewState,
  at: string,
  userId: number | null,
): StoredReviewer[] {
  const held = reviewers.find(r => sameReviewer(r, reviewer));
  if (held?.at && Date.parse(held.at) > Date.parse(at)) return [...reviewers];
  const decisive = held?.state === 'approved' || held?.state === 'changes_requested';
  if (state === 'commented' && held && decisive) return reviewers.map(r => (r === held ? { ...r, at } : r));
  const next: StoredReviewer = {
    login: reviewer.login,
    provider_user_id: reviewer.provider_user_id,
    user_id: userId ?? held?.user_id ?? null,
    avatar_url: reviewer.avatar_url ?? held?.avatar_url ?? null,
    state,
    at,
  };
  return [...reviewers.filter(r => r !== held), next];
}

/** Who is asked now: a requested reviewer without a review appears as requested; one no longer asked and silent drops out. */
export function withRequested(
  reviewers: readonly StoredReviewer[],
  requested: readonly EventActor[],
  userIdOf: (actor: EventActor) => number | null,
): StoredReviewer[] {
  const kept = reviewers.filter(r => r.state !== 'requested' || requested.some(q => sameReviewer(r, q)));
  const added = requested
    .filter(q => !kept.some(r => sameReviewer(r, q)))
    .map(q => ({
      login: q.login,
      provider_user_id: q.provider_user_id,
      user_id: userIdOf(q),
      avatar_url: q.avatar_url,
      state: 'requested' as const,
      at: null,
    }));
  // A reviewer asked again after reviewing is waiting on them once more.
  const reasked = kept.map(r =>
    r.state !== 'requested' && r.state !== 'commented' && requested.some(q => sameReviewer(r, q))
      ? { ...r, state: 'requested' as const }
      : r,
  );
  return [...reasked, ...added];
}

/** Changes requested by anyone wins; approval counts only when nobody asked is still waited on. */
export function reviewState(reviewers: readonly StoredReviewer[]): GitReviewState {
  if (reviewers.some(r => r.state === 'changes_requested')) return 'changes_requested';
  const pending = reviewers.some(r => r.state === 'requested');
  if (!pending && reviewers.some(r => r.state === 'approved')) return 'approved';
  if (pending) return 'review_requested';
  return 'none';
}

export interface RollupPull {
  state: GitPullRequestState;
  review_state: GitReviewState;
  ci_state: GitCiState;
  is_revert: boolean;
  merged_at: Date | null;
}

/** The issue's badge from its live links: a merged revert, then merged, then the open pull requests' worst news. */
export function developmentRollup(
  pulls: readonly RollupPull[],
  activeBranches: number,
  standaloneCommits: number,
): GitDevelopmentRollup {
  const lastRevert = Math.max(
    ...pulls.filter(p => p.is_revert && p.state === 'merged' && p.merged_at).map(p => p.merged_at!.getTime()),
    -Infinity,
  );
  const mergedAfter = pulls.some(
    p => !p.is_revert && p.state === 'merged' && p.merged_at && p.merged_at.getTime() > lastRevert,
  );
  if (lastRevert > -Infinity && !mergedAfter) return 'reverted';

  const open = pulls.filter(p => p.state === 'open' || p.state === 'draft');
  const ready = open.filter(p => p.state === 'open');
  if (pulls.length > 0 && open.length === 0 && pulls.some(p => p.state === 'merged')) return 'merged';
  if (open.some(p => p.ci_state === 'failing')) return 'ci_failing';
  if (open.some(p => p.review_state === 'changes_requested')) return 'changes_requested';
  if (ready.length > 0 && ready.every(p => p.review_state === 'approved')) return 'approved';
  if (ready.length > 0) return 'in_review';
  if (open.length > 0) return 'draft';
  if (pulls.length === 0 && activeBranches + standaloneCommits > 0) return 'branch_active';
  return 'none';
}
