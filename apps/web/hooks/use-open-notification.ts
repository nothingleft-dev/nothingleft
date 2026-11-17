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

  return (event: MouseEvent, org: { slug: string; name: string }, path: string, onOpen?: () => void) => {
    if (org.slug === current) {
      onOpen?.();
      return;
    }
    event.preventDefault();
    switchTo.mutate(org.slug, {
      onSuccess: () => {
        onOpen?.();
        router.push(path as Route);
      },
      onError: error => toastError(`Could not open ${org.name}`, error),
    });
  };
}
