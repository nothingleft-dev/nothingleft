'use client';

import { useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { EmailUs } from '@components/email-us';
import { StepUpDialog } from '@components/step-up-dialog';
import { SettingsSection } from '@components/settings/section';
import { useDeactivateAccount } from '@hooks/use-account-security';
import { useOrganizations, useSwitchOrganization } from '@hooks/use-organizations';
import { isApiError } from '@lib/api/errors';

interface DeactivateSectionProps {
  user: Me;
  reopen: boolean;
  onReopened: () => void;
}

export function DeactivateSection({ user, reopen, onReopened }: DeactivateSectionProps) {
  const [chosen, setOpen] = useState(false);
  const open = chosen || reopen;
  const deactivate = useDeactivateAccount();

  return (
    <SettingsSection
      title="Danger zone"
      description="Deactivating signs you out everywhere. Your work stays, under your name."
    >
      <div className="flex items-center gap-4 rounded-md border border-danger-fg/25 px-4 py-3 max-sm:flex-col max-sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-medium">Deactivate account</p>
          <p className="text-sm text-text-secondary">
            Reactivation is done by us, on an email from the address on the account.
          </p>
        </div>
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
        renderError={error =>
          error.code === 'account.owns_organization' ? (
            <OwnedOrganizations slugs={error.validValues ?? []} />
          ) : undefined
        }
        onConfirm={body => deactivate.mutate(body)}
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            You are signed out everywhere and every access token is revoked, so connected agents and scripts stop
            working.
          </li>
          <li>
            Your memberships and everything you wrote stay, under your real name. Colleagues see your name greyed out,
            and you are no longer offered as an assignee or in mentions.
          </li>
          <li>
            We send you a confirmation email. To come back, <EmailUs /> from {user.email}.
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
      onError: error => toast.error(isApiError(error) ? error.message : 'That organisation could not be opened.'),
    });

  return (
    <FormAlert title={slugs.length === 1 ? 'You still own an organisation' : 'You still own organisations'}>
      <p>Someone has to be able to look after it. Transfer ownership, or delete it, first.</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {slugs.map(slug => (
          <li key={slug}>
            <button
              type="button"
              disabled={switchTo.isPending}
              onClick={() => open(slug)}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
            >
              {name(slug)} - Danger zone <ArrowRight className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </FormAlert>
  );
}
