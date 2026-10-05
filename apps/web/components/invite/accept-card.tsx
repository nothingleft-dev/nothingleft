'use client';

import type { InvitationPreview, Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { StepPanel } from '@components/onboarding/step-panel';
import { InvitationCard } from '@components/invite/invitation-card';
import { useApiError } from '@hooks/use-api-error';
import { VerifyGate, needsVerification } from '@components/onboarding/verify-gate';

interface AcceptCardProps {
  preview: InvitationPreview;
  user: Me;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
  error: unknown;
}

export function AcceptCard({ preview, user, onAccept, onDecline, isPending, error }: AcceptCardProps) {
  const parsed = useApiError(error);
  // A share link proves nothing about the address, so it needs a confirmed one.
  const blocked = preview.kind === 'link' && needsVerification(user);

  return (
    <StepPanel
      eyebrow="Step 1 of 2"
      title={`Join ${preview.organization.name}?`}
      lede={`You are signed in as ${user.email}. Nothing happens to your account until you accept.`}
      footer={
        <>
          <Button type="button" onClick={onAccept} disabled={isPending || blocked}>
            {isPending ? 'Joining…' : 'Accept'}
          </Button>
          <Button type="button" variant="outline" onClick={onDecline} disabled={isPending}>
            Decline
          </Button>
        </>
      }
    >
      <InvitationCard preview={preview} />

      {blocked ? (
        <VerifyGate
          user={user}
          reason="This is a share link, which proves nothing about who is opening it, so the address has to be confirmed before you can join."
        />
      ) : null}
      {parsed.summary ? <FormAlert title={parsed.summary} /> : null}

      <p className="text-xs leading-5 text-text-muted">
        The step is explicit on purpose. Share links get pasted into group chats, and opening one out of curiosity
        should not make you a member of somebody’s organisation.
      </p>
    </StepPanel>
  );
}
