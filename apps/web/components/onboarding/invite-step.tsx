'use client';

import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Separator } from '@components/ui/separator';
import { BackButton, SkipButton, StepPanel } from '@components/onboarding/step-panel';
import { InviteEmailsForm } from '@components/invitations/invite-emails-form';
import { ShareLinks } from '@components/invitations/share-links';

export function InviteStep({ organization, projectKey }: { organization: Organization; projectKey: string }) {
  const router = useRouter();
  const land = () => router.push(`/projects/${projectKey}` as Route);
  const scope = { kind: 'project', key: projectKey } as const;

  return (
    <StepPanel
      eyebrow="Step 4 of 4"
      title="Invite your teammates"
      lede={`Anyone you add joins ${organization.name} and ${projectKey} in one step. You can also invite people later.`}
      footer={
        <>
          <BackButton onClick={() => router.push('/welcome/project')} />
          <Button type="button" onClick={land}>
            Finish
          </Button>
          <div className="ml-auto">
            <SkipButton onClick={land}>Skip for now</SkipButton>
          </div>
        </>
      }
    >
      <InviteEmailsForm scope={scope} canGrantOrgAdmin seats={organization.seats} submitLabel="Send invitations" />

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium">Or share a link</h2>
          <p className="text-xs text-text-muted">Anyone with the link can join. You can revoke it at any time.</p>
        </div>
        <ShareLinks scope={scope} orgSlug={organization.slug} />
      </div>
    </StepPanel>
  );
}
