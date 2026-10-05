import { LABEL_COLORS, type LabelColor, type TagInput } from '@nothingleft/types';
import type { TagRow, TenantContext } from '@nothingleft/db';
import { slugify } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import { recordIssueEvent } from '@services/issue-history';
import type { TenantRepos } from '@services/transaction';

// Shared by the tags routes, issue creation and articles, so a tag applied any way obeys one set of rules.

export interface WantedTag {
  name: string;
  color: LabelColor | undefined;
}

/** Deterministic, so a tag created without a colour always gets the same one for the same slug. */
export function labelColorFor(slug: string): LabelColor {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[hash % LABEL_COLORS.length]!;
}

/** Keyed by slug; the first spelling of a slug in the request wins. */
export function wantedTags(
  inputs: TagInput[],
  fallback: LabelColor | undefined,
  field: string,
): Map<string, WantedTag> {
  const wanted = new Map<string, WantedTag>();
  for (const input of inputs) {
    const name = (typeof input === 'string' ? input : input.name).trim();
    const slug = slugify(name);
    if (!slug) throw new AppError('tag.invalid', 400, { name }, field);
    if (!wanted.has(slug))
      wanted.set(slug, { name, color: (typeof input === 'string' ? undefined : input.color) ?? fallback });
  }
  return wanted;
}

/** Inside the caller's transaction: each slug's tag, created first (after `onCreate` allows it) where missing. */
export async function ensureTags(
  repos: Pick<TenantRepos, 'tags'>,
  args: { ctx: TenantContext; actorId: number; onCreate: () => void },
  wanted: Map<string, WantedTag>,
): Promise<{ rows: TagRow[]; created: number }> {
  const { ctx, actorId } = args;
  const slugs = [...wanted.keys()];
  const existing = await repos.tags.findBySlugs(ctx, slugs);
  const missing = slugs.filter(slug => !existing.some(t => t.slug === slug));
  if (missing.length > 0) args.onCreate();
  await repos.tags.insertMissing(
    ctx,
    missing.map(slug => {
      const want = wanted.get(slug)!;
      return { name: want.name, slug, color: want.color ?? labelColorFor(slug), created_by: actorId };
    }),
  );
  return { rows: await repos.tags.findBySlugs(ctx, slugs), created: missing.length };
}

/**
 * Inside the caller's transaction: reuses each slug's tag, creates the rest (after `onCreate`
 * checks the caller may), and records `tagged` for each tag newly on the issue.
 */
export async function applyTags(
  repos: TenantRepos,
  args: { ctx: TenantContext; issueId: number; actorId: number; at: Date; onCreate: () => void },
  wanted: Map<string, WantedTag>,
): Promise<{ applied: number; created: number }> {
  const { ctx, issueId, actorId, at } = args;
  const { rows, created } = await ensureTags(repos, args, wanted);
  const applied = new Set(
    await repos.tags.apply(
      ctx,
      issueId,
      rows.map(r => r.id),
    ),
  );
  const changeGroupId = Bun.randomUUIDv7();
  for (const row of rows.filter(r => applied.has(r.id)).sort((a, b) => a.slug.localeCompare(b.slug))) {
    await recordIssueEvent(repos.issueActivity, { ctx, issueId, actorId, changeGroupId, at }, 'tagged', {
      new_value: { name: row.name },
    });
  }
  return { applied: applied.size, created };
}
