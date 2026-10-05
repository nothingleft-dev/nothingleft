const USERNAME_MAX_LENGTH = 39;
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{0,37}[a-z0-9])?$/i;
const FALLBACK = 'user';

const NO_USERNAMES: ReadonlySet<string> = new Set();

/** `@Alex` → `Alex`. `null` when it is not 1–39 of `a-z 0-9 . _ -`, alphanumeric at both ends. */
export function parseUsername(value: string): string | null {
  const trimmed = value.trim().replace(/^@/, '');
  return USERNAME.test(trimmed) ? trimmed : null;
}

export function formatUsername(username: string): string {
  return `@${username}`;
}

function trimToHandle(value: string, maxLength: number): string {
  return value
    .replace(/[^a-z0-9._-]/gi, '')
    .slice(0, maxLength)
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
}

/**
 * `alex.lee+work@x.dev` → `alex.lee`, then `alex.lee2`… on collision.
 * `taken` holds lowercased usernames, because uniqueness is case-insensitive.
 */
export function usernameFromEmail(email: string, taken: ReadonlySet<string> = NO_USERNAMES): string {
  const local = (email.split('@')[0] ?? '').split('+')[0] ?? '';
  const base = trimToHandle(local, USERNAME_MAX_LENGTH) || FALLBACK;
  if (!taken.has(base.toLowerCase())) return base;

  for (let suffix = 2; ; suffix += 1) {
    const digits = String(suffix);
    const candidate = `${trimToHandle(base, USERNAME_MAX_LENGTH - digits.length) || FALLBACK}${digits}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
