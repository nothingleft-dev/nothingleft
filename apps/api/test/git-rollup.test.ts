import { describe, expect, test } from 'bun:test';
import {
  applyReview,
  ciState,
  ciSummary,
  developmentRollup,
  reviewState,
  withRequested,
  type RollupPull,
  type StoredReviewer,
} from '@git/rollup';

const actor = (login: string) => ({ login, provider_user_id: null, name: null, email: null, avatar_url: null });

describe('ciState', () => {
  test('failing beats running beats passing; nothing is none', () => {
    expect(ciState([])).toBe('none');
    expect(
      ciState([
        { status: 'completed', conclusion: 'success' },
        { status: 'in_progress', conclusion: null },
      ]),
    ).toBe('running');
    expect(
      ciState([
        { status: 'queued', conclusion: null },
        { status: 'completed', conclusion: 'timed_out' },
      ]),
    ).toBe('failing');
    expect(
      ciState([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'skipped' },
      ]),
    ).toBe('passing');
    expect(ciState([{ status: 'completed', conclusion: 'stale' }])).toBe('none');
  });

  test('a summary counts each state', () => {
    expect(
      ciSummary([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'success' },
        { status: 'queued', conclusion: null },
      ]),
    ).toEqual({ success: 2, queued: 1 });
  });
});

describe('reviews', () => {
  test('the latest review per reviewer wins, an older one changes nothing', () => {
    let r: StoredReviewer[] = applyReview([], actor('casey'), 'changes_requested', '2026-10-25T10:00:00Z', 7);
    r = applyReview(r, actor('Casey'), 'approved', '2026-10-25T11:00:00Z', null);
    expect(r).toEqual([expect.objectContaining({ login: 'Casey', state: 'approved', user_id: 7 })]);
    expect(applyReview(r, actor('casey'), 'dismissed', '2026-10-25T09:00:00Z', null)[0]!.state).toBe('approved');
    expect(reviewState(r)).toBe('approved');
  });

  test('a comment after an approval leaves the approval standing', () => {
    const approved = applyReview([], actor('a'), 'approved', '2026-10-25T10:00:00Z', null);
    const commented = applyReview(approved, actor('a'), 'commented', '2026-10-25T11:00:00Z', null);
    expect(reviewState(commented)).toBe('approved');
    expect(reviewState(applyReview([], actor('b'), 'commented', '2026-10-25T11:00:00Z', null))).toBe('none');
  });

  test('changes requested beats approval; a pending request holds approval back', () => {
    const approved = applyReview([], actor('a'), 'approved', '2026-10-25T10:00:00Z', null);
    expect(reviewState(withRequested(approved, [actor('b')], () => null))).toBe('review_requested');
    expect(reviewState(applyReview(approved, actor('b'), 'changes_requested', '2026-10-25T10:01:00Z', null))).toBe(
      'changes_requested',
    );
    expect(reviewState([])).toBe('none');
  });

  test('a request dropped before any review drops the reviewer; asking again after a review re-opens it', () => {
    const asked = withRequested([], [actor('b')], () => null);
    expect(withRequested(asked, [], () => null)).toEqual([]);
    const reviewed = applyReview([], actor('a'), 'changes_requested', '2026-10-25T10:00:00Z', null);
    expect(withRequested(reviewed, [actor('a')], () => null)[0]!.state).toBe('requested');
  });
});

describe('developmentRollup', () => {
  const pr = (over: Partial<RollupPull>): RollupPull => ({
    state: 'open',
    review_state: 'none',
    ci_state: 'none',
    is_revert: false,
    merged_at: null,
    ...over,
  });
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 25, 10, minute));

  test('in the plan’s order', () => {
    expect(developmentRollup([pr({ state: 'merged', merged_at: at(1) }), pr({ state: 'closed' })], 0, 0)).toBe(
      'merged',
    );
    expect(developmentRollup([pr({ state: 'merged', merged_at: at(1) }), pr({ ci_state: 'failing' })], 0, 0)).toBe(
      'ci_failing',
    );
    expect(developmentRollup([pr({ review_state: 'changes_requested' })], 0, 0)).toBe('changes_requested');
    expect(developmentRollup([pr({ review_state: 'approved' }), pr({ state: 'draft' })], 0, 0)).toBe('approved');
    expect(developmentRollup([pr({ review_state: 'approved' }), pr({})], 0, 0)).toBe('in_review');
    expect(developmentRollup([pr({ state: 'draft' })], 0, 0)).toBe('draft');
    expect(developmentRollup([], 1, 0)).toBe('branch_active');
    expect(developmentRollup([], 0, 2)).toBe('branch_active');
    expect(developmentRollup([], 0, 0)).toBe('none');
    expect(developmentRollup([pr({ state: 'closed' })], 1, 0)).toBe('none');
  });

  test('a merged revert shows until something merges after it', () => {
    const original = pr({ state: 'merged', merged_at: at(1) });
    const revert = pr({ state: 'merged', merged_at: at(2), is_revert: true });
    expect(developmentRollup([original, revert], 0, 0)).toBe('reverted');
    expect(developmentRollup([original, revert, pr({ state: 'merged', merged_at: at(3) })], 0, 0)).toBe('merged');
  });
});
