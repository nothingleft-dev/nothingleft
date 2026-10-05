'use client';

import { CalendarX } from 'lucide-react';
import { toast } from 'sonner';
import type { Organization } from '@nothingleft/types';
import { useCancelDeletion } from '@hooks/use-organization-lifecycle';
import { formatDate } from '@lib/datetime';
import { isApiError } from '@lib/api/errors';

/** Every member sees it on every page while the grace period runs; only the Owner can cancel. */
export function DeletionBanner({ organization }: { organization: Organization }) {
  const cancel = useCancelDeletion(organization.slug);
  const deletion = organization.deletion;
  if (!deletion) return null;
  const isOwner = organization.membership.is_owner;

  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-2.5 rounded-md border border-warning-fg/25 bg-warning-bg px-3 py-2.5 text-warning-fg"
    >
      <CalendarX className="mt-0.5 size-icon-sm flex-none" />
      <p className="flex-1 text-xs leading-5">
        <span className="font-medium">
          {organization.name} will be deleted on {formatDate(deletion.deletes_at)}.
        </span>{' '}
        {isOwner
          ? 'Everyone can keep working until then. Cancel to keep it; nothing is lost.'
          : 'Everyone can keep working until then. Export anything you need, or ask the Owner to cancel.'}
      </p>
      {isOwner ? (
        <button
          type="button"
          disabled={cancel.isPending}
          onClick={() =>
            cancel.mutate(undefined, {
              onSuccess: () => toast.success(`${organization.name} will not be deleted.`),
              onError: error => toast.error(isApiError(error) ? error.message : 'The deletion could not be cancelled.'),
            })
          }
          className="flex-none text-xs leading-5 font-medium underline underline-offset-2 hover:no-underline disabled:opacity-60"
        >
          {cancel.isPending ? 'Cancelling…' : 'Cancel deletion'}
        </button>
      ) : null}
    </div>
  );
}
