// The landing page decides where a returning user goes — onboarding.md § Returning-user landing.
const FALLBACK = '/';
const OAUTH_NEXT_KEY = 'nl:oauth-next';

const PROBE_ORIGIN = 'https://x.invalid';

// Only a same-origin path is honoured, so ?next= cannot become an open redirect. URL parsing
// turns a backslash into a slash and drops tabs and newlines, so `/\host` and `/\t/host` are refused before it.
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next[1] === '/' || next.includes('\\')) return FALLBACK;
  for (let i = 0; i < next.length; i++) if (next.charCodeAt(i) < 0x21) return FALLBACK;
  if (!URL.canParse(next, PROBE_ORIGIN)) return FALLBACK;
  const url = new URL(next, PROBE_ORIGIN);
  return url.origin === PROBE_ORIGIN && url.pathname.startsWith('/') && !url.pathname.startsWith('//')
    ? next
    : FALLBACK;
}

// The provider round trip leaves the app, so ?next= is parked for the callback page.
export function rememberOAuthNext(next: string | null) {
  try {
    if (next) sessionStorage.setItem(OAUTH_NEXT_KEY, next);
    else sessionStorage.removeItem(OAUTH_NEXT_KEY);
  } catch {
    // Storage blocked: the callback lands on the dashboard instead.
  }
}

export function takeOAuthNext(): string {
  try {
    const next = sessionStorage.getItem(OAUTH_NEXT_KEY);
    sessionStorage.removeItem(OAUTH_NEXT_KEY);
    return safeNextPath(next);
  } catch {
    return FALLBACK;
  }
}
