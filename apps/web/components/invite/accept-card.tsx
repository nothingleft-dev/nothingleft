'use client';

import type { InvitationPreview, Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { StepPanel } from '@components/onboarding/step-panel';
import { InvitationCard } from '@components/invite/invitation-card';
import { useApiError } from '@hooks/use-api-error';
import { VerifyGate, needsVerification } from '@components/onboarding/verify-gate';
import { PendingButton } from '@components/pending-button';

interface AcceptCardProps {
  preview: InvitationPreview;
  user: Me;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
  error: unknown;
}

export function AcceptCard({ preview, user, onAccept, onDecline, isPending, error }: AcceptCardProps) {
  const parsed = useApiError(error, []);
  // A share link proves nothing about the address, so it needs a confirmed one.
  const blocked = preview.kind === 'link' && needsVerification(user);

  return (
    <StepPanel
      eyebrow="Step 1 of 2"
      title="Review your invitation"
      lede={`You are signed in as ${user.email}. Nothing happens to your account until you accept.`}
      footer={
        <>
          <PendingButton
            type="button"
            className="min-w-24"
            onClick={onAccept}
            disabled={blocked}
            pending={isPending}
            pendingLabel="Joining…"
          >
            Accept
          </PendingButton>
          <Button type="button" variant="outline" className="min-w-24" onClick={onDecline} disabled={isPending}>
            Decline
          </Button>
        </>
      }
    >
      <InvitationCard preview={preview} />

      {blocked ? (
        <VerifyGate
          user={user}
          reason="A share link can be forwarded, so the address has to be confirmed before you can join."
        />
      ) : null}
      {parsed.summary ? <FormAlert title={parsed.summary} /> : null}
    </StepPanel>
  );
}
