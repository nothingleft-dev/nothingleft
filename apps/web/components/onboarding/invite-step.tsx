'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { Organization, Project } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Separator } from '@components/ui/separator';
import { BackButton, SkipButton, StepPanel } from '@components/onboarding/step-panel';
import { InviteEmailsForm } from '@components/invitations/invite-emails-form';
import { ShareLinks } from '@components/invitations/share-links';
import { useInvitations } from '@hooks/use-invitations';

export function InviteStep({ organization, project }: { organization: Organization; project: Project }) {
  const router = useRouter();
  const land = () => router.push(`/projects/${project.key}` as Route);
  const scope = { kind: 'project', key: project.key } as const;
  const invitations = useInvitations(scope);
  const [pending, setPending] = useState(0);
  const invited = (invitations.data ?? []).some(invitation => invitation.status !== 'revoked');
  // One filled button at a time: Send while addresses wait, Finish once somebody is invited.
  const sendFirst = pending > 0 || !invited;

  return (
    <StepPanel
      eyebrow="Step 4 of 4"
      title="Invite your teammates"
      stickyFooter
      lede={`Anyone you add joins ${organization.name} and ${project.name} in one step. You can also invite people later.`}
      footer={
        <>
          <BackButton onClick={() => router.push('/welcome/project')} />
          {invited ? (
            <Button type="button" variant={sendFirst ? 'outline' : 'default'} onClick={land}>
              Finish
            </Button>
          ) : invitations.data ? (
            <div className="ml-auto">
              <SkipButton onClick={land}>Skip for now</SkipButton>
            </div>
          ) : null}
          {invited && pending > 0 ? (
            <span className="text-sm text-text-secondary">
              {pending === 1 ? 'One address is not sent yet.' : `${pending} addresses are not sent yet.`}
            </span>
          ) : null}
        </>
      }
    >
      <InviteEmailsForm
        scope={scope}
        canGrantOrgAdmin
        seats={organization.seats}
        submitLabel="Send invitations"
        submitVariant={sendFirst ? 'default' : 'outline'}
        onPendingChange={setPending}
      />

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium">Or share a link</h2>
          <p className="text-xs text-text-secondary">Anyone with the link can join. You can revoke it at any time.</p>
        </div>
        <ShareLinks scope={scope} orgSlug={organization.slug} />
      </div>
    </StepPanel>
  );
}
