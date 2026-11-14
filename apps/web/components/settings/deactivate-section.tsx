'use client';

import { useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import type { Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
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

  return (
    <SettingsSection
      title="Danger zone"
      description="Deactivating your account keeps everything you wrote, under your name."
    >
      <div className="flex items-center gap-4 rounded-md border border-danger-fg/25 px-4 py-3 max-sm:flex-col max-sm:items-start">
        <p className="min-w-0 flex-1 text-sm text-pretty text-text-secondary">
          Sign out everywhere and leave assignee lists. Email us from this address to come back.
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
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) {
            deactivate.reset();
            onReopened();
          }
        }}
        user={user}
        title="Deactivate your account?"
        confirmLabel="Deactivate account"
        pendingLabel="Deactivating…"
        returnTo="/settings?tab=security&confirm=deactivate"
        pending={deactivate.isPending}
        error={deactivate.error}
        ready={blocked === null}
        renderError={error => (error.code === 'account.owns_organization' ? false : undefined)}
        onConfirm={body => deactivate.mutate(body)}
      >
        {blocked ? <OwnedOrganizations slugs={blocked} /> : null}
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Signs you out and revokes every access token.</li>
          <li>Your work stays under your name; you leave assignee lists and mentions.</li>
          <li>
            To come back, <EmailUs /> from {user.email}.
          </li>
        </ul>
      </StepUpDialog>
    </SettingsSection>
  );
}

function OwnedOrganizations({ slugs }: { slugs: readonly string[] }) {
  const router = useRouter();
  const organizations = useOrganizations();
  const switchTo = useSwitchOrganization();
  const name = (slug: string) => organizations.data?.find(o => o.slug === slug)?.name ?? slug;

  // The danger tab reads the session's organisation, so another one is switched to first.
  const open = (slug: string) =>
    switchTo.mutate(slug, {
      onSuccess: () => router.push('/organization?tab=danger' as Route),
      onError: error => toastError('Could not open the organisation', error),
    });

  return (
    <FormAlert title={slugs.length === 1 ? 'You still own an organisation' : 'You still own organisations'}>
      <p>
        {slugs.length === 1
          ? 'Someone has to look after it. Transfer ownership, or delete it, first.'
          : 'Someone has to look after them. Transfer ownership of each, or delete it, first.'}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
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
    </FormAlert>
  );
}
