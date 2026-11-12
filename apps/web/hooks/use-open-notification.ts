'use client';

import type { MouseEvent } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { toastError } from '@components/toast-error';
import { useSwitchOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';

/**
 * A click on a notification's link. Inside the current organisation the link navigates as
 * any link does; from another one, the session switches there first, because the issue page
 * resolves keys in the current organisation — and that includes a new tab, which shares it.
 */
export function useOpenNotification() {
  const router = useRouter();
  const session = useSession();
  const current = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  const switchTo = useSwitchOrganization();

  return (event: MouseEvent, org: string, path: string) => {
    if (org === current) return;
    event.preventDefault();
    switchTo.mutate(org, {
      onSuccess: () => router.push(path as Route),
      onError: error => toastError('Could not open the organisation', error),
    });
  };
}
