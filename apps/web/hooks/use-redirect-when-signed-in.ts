'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@hooks/use-session';

/**
 * Sign-in and sign-up have nothing to offer someone who already has a session, so they
 * bounce to the landing as soon as `GET /v1/me` answers. A form that navigates
 * somewhere else on success turns this off first, so the two do not race.
 */
export function useRedirectWhenSignedIn(enabled = true) {
  const router = useRouter();
  const session = useSession();
  const signedIn = session.status === 'signed-in';

  useEffect(() => {
    if (signedIn && enabled) router.replace('/');
  }, [signedIn, enabled, router]);

  return signedIn;
}
