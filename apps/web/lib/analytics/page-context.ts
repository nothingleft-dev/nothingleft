// Path words that are part of the route scheme itself. Every other segment is a key, slug,
// username or token, and is replaced, so a route added later is redacted until listed here.
const ROUTE_WORDS = new Set([
  'articles',
  'auth',
  'backlog',
  'board',
  'callback',
  'current',
  'dashboard',
  'inbox',
  'invite',
  'issue',
  'issues',
  'my-issues',
  'new-issue',
  'open',
  'organization',
  'project',
  'projects',
  'reports',
  'reset-password',
  'settings',
  'shortcuts',
  'sign-in',
  'sign-up',
  'starred',
  'timesheets',
  'transfer',
  'unsubscribe',
  'verify-email',
  'welcome',
]);

const TITLE = 'Nothing Left';

export function analyticsPath(pathname: string): string {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map(segment => (ROUTE_WORDS.has(segment) ? segment : ':id'));
  return `/${segments.join('/')}`;
}

/**
 * What a third-party tag may see of the current page: the route's shape, never its query,
 * keys, slugs or tokens, and never the document title, which carries issue and article titles.
 */
export function pageContext(location: Pick<Location, 'origin' | 'pathname'>, referrer: string) {
  let pageReferrer = '';
  try {
    const from = new URL(referrer);
    pageReferrer = from.origin === location.origin ? location.origin + analyticsPath(from.pathname) : from.origin;
  } catch {
    // An empty or unparsable referrer is sent as none.
  }
  return {
    page_location: location.origin + analyticsPath(location.pathname),
    page_referrer: pageReferrer,
    page_title: TITLE,
  };
}
