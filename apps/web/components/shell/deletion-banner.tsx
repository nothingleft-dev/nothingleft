'use client';

import { CalendarX } from 'lucide-react';
import { toast } from 'sonner';
import type { Organization } from '@nothingleft/types';
import { useCancelDeletion } from '@hooks/use-organization-lifecycle';
import { formatDate } from '@lib/datetime';
import { toastError } from '@components/toast-error';

/** Every member sees it on every page while the grace period runs; only the Owner can cancel. */
export function DeletionBanner({ organization }: { organization: Organization }) {
  const cancel = useCancelDeletion(organization.slug);
  const deletion = organization.deletion;
  if (!deletion) return null;
  const isOwner = organization.membership.is_owner;
  const cancelDeletion = () =>
    cancel.mutate(undefined, {
      onSuccess: () => toast.success(`${organization.name} will not be deleted.`),
      onError: error => toastError('Could not cancel the deletion', error, { retry: cancelDeletion }),
    });

  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-2.5 rounded-md border border-warning-fg/25 bg-warning-bg px-3 py-2.5 text-warning-fg"
    >
      <CalendarX className="mt-0.5 size-icon-sm flex-none" />
      <div className="flex min-w-0 flex-1 items-start gap-x-4 gap-y-1.5 max-sm:flex-col">
        <p className="flex-1 text-xs leading-5">
          <span className="font-medium">
            {organization.name} will be deleted on {formatDate(deletion.deletes_at)}.
          </span>{' '}
          {isOwner
            ? 'Everyone can keep working until then. Cancel to keep it; nothing is lost.'
            : 'Everyone can keep working until then. Export anything you need, or ask the Owner to cancel.'}
        </p>
        {!isOwner ? null : cancel.isPending ? (
          // Pending, not unavailable: it keeps the banner's ink rather than the disabled grey.
          <span className="flex-none text-xs leading-5 font-medium">Cancelling…</span>
        ) : (
          <button
            type="button"
            onClick={cancelDeletion}
            className="action-link flex-none text-xs leading-5 font-medium"
          >
            Cancel deletion
          </button>
        )}
      </div>
    </div>
  );
}
