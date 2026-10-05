import { ARTICLE_SLUG_MAX_LENGTH, CUSTOM_FIELD_SLUG_MAX, CUSTOM_FIELD_SLUG_PATTERN } from '@nothingleft/types';

const DISALLOWED = /[^a-z0-9._:-]/g;

/** `Needs Review` → `needs-review`; a colon survives, so `area:billing` stays namespaced. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(DISALLOWED, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `slugify`, then `-2`, `-3`… until it is not in `taken`. */
export function uniqueSlug(value: string, taken: ReadonlySet<string>): string {
  const base = slugify(value);
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * A custom field's slug: its search-query attribute name, so only lower-case letters, digits and
 * hyphens, starting with a letter. A field name that yields none returns null.
 */
export function customFieldSlug(name: string): string | null {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, CUSTOM_FIELD_SLUG_MAX)
    .replace(/-+$/g, '');
  return CUSTOM_FIELD_SLUG_PATTERN.test(slug) ? slug : null;
}

export const isCustomFieldSlug = (slug: string): boolean => CUSTOM_FIELD_SLUG_PATTERN.test(slug);

/** A knowledge base article's slug: its URL segment, so ASCII letters, digits and hyphens only. Empty when none remain. */
export function articleSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, ARTICLE_SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/** `articleSlug`, falling back to `article`, then `-2`, `-3`… until it is not in `taken` (lower-case slugs). */
export function uniqueArticleSlug(value: string, taken: ReadonlySet<string>): string {
  const base = articleSlug(value) || 'article';
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, ARTICLE_SLUG_MAX_LENGTH - tail.length).replace(/-+$/, '')}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
}
