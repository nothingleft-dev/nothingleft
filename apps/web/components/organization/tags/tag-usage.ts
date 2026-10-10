import type { Tag } from '@nothingleft/types';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** `3 issues · 12 articles`, or null for a tag nothing uses. */
export function tagUsage(tag: Pick<Tag, 'issue_count' | 'article_count'>, join = ' · ') {
  const parts = [
    tag.issue_count > 0 ? plural(tag.issue_count, 'issue') : null,
    tag.article_count > 0 ? plural(tag.article_count, 'article') : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(join) : null;
}

export const tagCount = (n: number) => plural(n, 'tag');
