// The pages a visitor sees before having an account, or before joining a team. They are always
// light, matching the marketing site they arrive from; the account's theme starts at /welcome.
export const AUTH_ROUTES = [
  '/sign-in',
  '/sign-up',
  '/verify-email',
  '/reset-password',
  '/invite',
  '/auth/',
  '/unsubscribe',
];

export const isAuthRoute = (pathname: string) => AUTH_ROUTES.some(route => pathname.startsWith(route));
