'use client';

import { useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import type { Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/dialog';
import { PendingButton } from '@components/pending-button';
import { EmailUs } from '@components/email-us';
import { StepUpDialog } from '@components/step-up-dialog';
import { SettingsSection } from '@components/settings/section';
import { useDeactivateAccount } from '@hooks/use-account-security';
import { isApiError } from '@lib/api/errors';
import { useOrganizations, useSwitchOrganization } from '@hooks/use-organizations';
import { toastError } from '@components/toast-error';

interface DeactivateSectionProps {
  user: Me;
  reopen: boolean;
  onReopened: () => void;
}

export function DeactivateSection({ user, reopen, onReopened }: DeactivateSectionProps) {
  const [chosen, setOpen] = useState(false);
  const open = chosen || reopen;
  const deactivate = useDeactivateAccount();
  const blocked =
    isApiError(deactivate.error) && deactivate.error.code === 'account.owns_organization'
      ? (deactivate.error.validValues ?? [])
      : null;

  const close = () => {
    setOpen(false);
    deactivate.reset();
    onReopened();
  };

  return (
    <SettingsSection
      title="Danger zone"
      description="Deactivating your account keeps everything you wrote, under your name."
    >
      <div className="flex items-center gap-4 rounded-md border px-4 py-3 max-sm:flex-col max-sm:items-start">
        <p className="min-w-0 flex-1 text-sm text-pretty text-text-secondary">
          Sign out everywhere and leave assignee lists. To come back, <EmailUs /> from this address.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="text-danger-fg hover:text-danger-fg"
          onClick={() => setOpen(true)}
        >
          Deactivate account
        </Button>
      </div>

      <StepUpDialog
        open={open && blocked === null}
        onOpenChange={next => (next ? setOpen(true) : close())}
        user={user}
        title="Deactivate your account?"
        confirmLabel="Deactivate account"
        pendingLabel="Deactivating…"
        returnTo="/settings?tab=security&confirm=deactivate"
        pending={deactivate.isPending}
        error={deactivate.error}
        onConfirm={body => deactivate.mutate(body)}
      >
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Signs you out and revokes every access token.</li>
          <li>Your work stays under your name; you leave assignee lists and mentions.</li>
          <li>
            To come back, <EmailUs /> from <span className="whitespace-nowrap">{user.email}</span>.
          </li>
        </ul>
      </StepUpDialog>

      <OwnedOrganizationsDialog slugs={open ? blocked : null} onClose={close} />
    </SettingsSection>
  );
}

function OwnedOrganizationsDialog({ slugs, onClose }: { slugs: readonly string[] | null; onClose: () => void }) {
  const router = useRouter();
  const organizations = useOrganizations();
  const switchTo = useSwitchOrganization();
  const name = (slug: string) => organizations.data?.find(o => o.slug === slug)?.name ?? slug;
  const one = slugs?.length === 1 ? slugs[0] : undefined;

  // The danger tab reads the session's organisation, so another one is switched to first.
  const open = (slug: string) =>
    switchTo.mutate(slug, {
      onSuccess: () => router.push('/organization?tab=danger' as Route),
      onError: error => toastError('Could not open the organisation', error),
    });

  return (
    <Dialog open={slugs !== null} onOpenChange={next => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{one ? 'You still own an organisation' : 'You still own organisations'}</DialogTitle>
          <DialogDescription>
            {one
              ? `Every organisation needs an Owner. Hand ${name(one)} to someone else or delete it, then deactivate your account.`
              : 'Every organisation needs an Owner. Hand each of these to someone else or delete it, then deactivate your account.'}
          </DialogDescription>
        </DialogHeader>
        {slugs && !one ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {slugs.map(slug => (
              <li key={slug}>
                <button
                  type="button"
                  disabled={switchTo.isPending}
                  onClick={() => open(slug)}
                  className="action-link font-medium"
                >
                  {name(slug)} › Danger zone
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {one ? (
            <PendingButton onClick={() => open(one)} pending={switchTo.isPending} pendingLabel="Opening…">
              Open {name(one)}
            </PendingButton>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
