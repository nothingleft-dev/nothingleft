import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import { safeNextPath } from '@components/auth/next-path';
import { isAnonymousRoute, isGuestOnlyRoute } from '@lib/auth-routes';

// Presence only, so no page waits on the API: the API answers whether the session is alive, and
// clears the cookie on any request that carries a dead one.
export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE_NAME);

  if (signedIn && isGuestOnlyRoute(pathname)) {
    return NextResponse.redirect(new URL(safeNextPath(searchParams.get('next')), request.url));
  }
  if (!signedIn && !isAnonymousRoute(pathname)) {
    const target = new URL('/sign-in', request.url);
    if (pathname !== '/') target.searchParams.set('next', pathname + search);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|.*\\..*).*)'] };
