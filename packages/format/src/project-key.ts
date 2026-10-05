const GENERATED_MAX_LENGTH = 4;
const KEY_MIN_LENGTH = 2;
const KEY_MAX_LENGTH = 10;
const SINGLE_WORD_LENGTH = 3;

const NO_KEYS: ReadonlySet<string> = new Set();

const PROJECT_KEY = new RegExp(`^[a-z0-9]{${KEY_MIN_LENGTH},${KEY_MAX_LENGTH}}$`, 'i');

/** `pp` → `PP`. `null` when the value is not 2–10 alphanumerics. */
export function parseProjectKey(value: string): string | null {
  const trimmed = value.trim();
  return PROJECT_KEY.test(trimmed) ? trimmed.toUpperCase() : null;
}

function initials(name: string): string | null {
  const words = name
    .split(/\s+/)
    .map(word => word.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean);
  if (words.length === 0) return null;

  const candidate =
    words.length > 1
      ? words
          .map(word => word.slice(0, 1))
          .join('')
          .slice(0, GENERATED_MAX_LENGTH)
      : (words[0] as string).slice(0, SINGLE_WORD_LENGTH);

  return candidate.length < KEY_MIN_LENGTH ? null : candidate.toUpperCase();
}

/**
 * `Partner Portal` → `PP`. `null` when the name cannot yield two characters,
 * which is the signal to make the user type a key instead.
 */
export function generateProjectKey(name: string, taken: ReadonlySet<string> = NO_KEYS): string | null {
  const base = initials(name);
  if (base === null) return null;
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (candidate.length > KEY_MAX_LENGTH) return null;
    if (!taken.has(candidate)) return candidate;
  }
}
