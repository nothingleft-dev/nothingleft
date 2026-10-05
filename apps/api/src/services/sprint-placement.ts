import type { IssueRow, SprintRow, TenantContext } from '@nothingleft/db';
import { recordIssueEvent } from '@services/issue-history';
import type { TenantRepos } from '@services/transaction';

// Neighbours closer than this renumber the container — docs/data-model.md#issues.
export const RANK_MIN_GAP = 1e-6;

/** Ranks for `count` issues dropped between two neighbours, either of which may be absent; null when too tight. */
export function ranksBetween(prev: number | null, next: number | null, count: number): number[] | null {
  const steps = Array.from({ length: count }, (_, i) => i + 1);
  if (prev === null && next === null) return steps;
  if (next === null) return steps.map(i => prev! + i);
  if (prev === null) return steps.map(i => next - (count + 1 - i));
  const gap = (next - prev) / (count + 1);
  if (gap < RANK_MIN_GAP) return null;
  return steps.map(i => prev + gap * i);
}

export const sprintSnapshot = (sprint: Pick<SprintRow, 'name' | 'slug'> | null) =>
  sprint ? { name: sprint.name, slug: sprint.slug } : null;

export interface Placement {
  ctx: TenantContext;
  projectId: number;
  actorId: number;
  changeGroupId: string;
  at: Date;
  /** The target container: a sprint, or null for the backlog. */
  sprint: SprintRow | null;
  /** In the order they should end up. */
  issues: IssueRow[];
  /** Where in the target they land; absent puts them at the bottom. */
  anchor?: { issueId: number; side: 'before' | 'after' } | undefined;
  /** The sprint each issue came from, for its history row; looked up when absent. */
  sprintsById?: ReadonlyMap<number, SprintRow> | undefined;
}

/**
 * Moves issues into a container at a position, in one statement, and writes `sprint_changed`
 * for each one whose sprint changed. Ranks compare only within a container, so the target is
 * locked first; when the gap is too tight it is renumbered 1…n.
 * Returns the issues whose sprint changed.
 */
export async function placeIssues(repos: TenantRepos, p: Placement): Promise<IssueRow[]> {
  if (p.issues.length === 0) return [];
  const moving = new Set(p.issues.map(i => i.id));
  const targetId = p.sprint?.id ?? null;
  const container = (await repos.issues.lockContainer(p.ctx, p.projectId, targetId)).filter(r => !moving.has(r.id));

  // Unranked issues sort last, so they are the container's tail: rank them after the last ranked one.
  const writes = new Map<number, number>();
  let last = container.reduce((max, r) => (r.rank !== null && r.rank > max ? r.rank : max), 0);
  let rows = container.map(r => {
    if (r.rank !== null) return r;
    last += 1;
    writes.set(r.id, last);
    return { ...r, rank: last };
  });

  let index = rows.length;
  const at = p.anchor ? rows.findIndex(r => r.id === p.anchor!.issueId) : -1;
  if (at >= 0) index = p.anchor!.side === 'before' ? at : at + 1;
  const neighbours = () => [rows[index - 1]?.rank ?? null, rows[index]?.rank ?? null] as const;
  let ranks = ranksBetween(...neighbours(), p.issues.length);
  if (!ranks) {
    rows = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    for (const r of rows) writes.set(r.id, r.rank!);
    ranks = ranksBetween(...neighbours(), p.issues.length)!;
  }

  await repos.issues.place(p.ctx, [
    ...[...writes].map(([id, rank]) => ({ id, sprint_id: targetId, rank })),
    ...p.issues.map((issue, i) => ({ id: issue.id, sprint_id: targetId, rank: ranks[i]! })),
  ]);

  const changed = p.issues.filter(i => i.sprint_id !== targetId);
  if (changed.length === 0) return [];
  const known = new Map(p.sprintsById ?? []);
  const missing = changed.flatMap(i => (i.sprint_id !== null && !known.has(i.sprint_id) ? [i.sprint_id] : []));
  for (const row of await repos.sprints.findByIds(p.ctx, missing)) known.set(row.id, row);
  for (const issue of changed) {
    await repos.issues.update(p.ctx, issue.id, { updated_by: p.actorId, updated_at: p.at });
    await recordIssueEvent(
      repos.issueActivity,
      { ctx: p.ctx, issueId: issue.id, actorId: p.actorId, changeGroupId: p.changeGroupId, at: p.at },
      'sprint_changed',
      {
        old_value: sprintSnapshot(issue.sprint_id === null ? null : (known.get(issue.sprint_id) ?? null)),
        new_value: sprintSnapshot(p.sprint),
      },
    );
  }
  return changed;
}
