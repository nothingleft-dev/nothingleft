import { slugify } from './slug.ts';

const SLUG_MIN_LENGTH = 2;
const SLUG_MAX_LENGTH = 48;
const ORGANIZATION_SLUG = /^[a-z0-9](?:[a-z0-9]|-(?!-)){0,46}[a-z0-9]$/;

const NO_SLUGS: ReadonlySet<string> = new Set();

/** `Acme-Labs` → `acme-labs`. `null` unless 2–48 of `a-z 0-9 -`, with no leading, trailing or doubled hyphen. */
export function parseOrganizationSlug(value: string): string | null {
  const lowered = value.trim().toLowerCase();
  return ORGANIZATION_SLUG.test(lowered) ? lowered : null;
}

function toSlugChars(value: string, maxLength: number): string {
  return value
    .replace(/[._:]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
}

/**
 * `Acme Corporation` → `acme-corporation`, then `acme-corporation-2`… on collision.
 * `null` when the name yields fewer than two characters, the signal to ask for a slug.
 */
export function generateOrganizationSlug(name: string, taken: ReadonlySet<string> = NO_SLUGS): string | null {
  const base = toSlugChars(slugify(name), SLUG_MAX_LENGTH);
  if (base.length < SLUG_MIN_LENGTH) return null;
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${toSlugChars(base, SLUG_MAX_LENGTH - tail.length)}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
}
