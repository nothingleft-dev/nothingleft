// The pages a visitor sees before having an account, or before joining a team. They are always
// light, matching the marketing site they arrive from; the account's theme starts at /welcome.
export const AUTH_ROUTES = [
  '/sign-in',
  '/sign-up',
  '/verify-email',
  '/verify-git-email',
  '/reset-password',
  '/invite',
  '/auth/',
  '/unsubscribe',
];

const GUEST_ONLY_ROUTES = ['/sign-in', '/sign-up'];

const ANONYMOUS_ROUTES = [...AUTH_ROUTES, '/transfer'];

const matches = (routes: readonly string[], pathname: string) => routes.some(route => pathname.startsWith(route));

export const isAuthRoute = (pathname: string) => matches(AUTH_ROUTES, pathname);

/** Nothing here for someone already signed in. */
export const isGuestOnlyRoute = (pathname: string) => matches(GUEST_ONLY_ROUTES, pathname);

/** Open without a session; a 401 on one of these is the normal state, not a reason to navigate. */
export const isAnonymousRoute = (pathname: string) => matches(ANONYMOUS_ROUTES, pathname);
