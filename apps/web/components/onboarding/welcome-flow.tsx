'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useIsFetching } from '@tanstack/react-query';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { FullPageLoader } from '@components/full-page-loader';
import { FlowShell } from '@components/onboarding/flow-shell';
import { WELCOME_INTRO, WELCOME_STEPS } from '@components/onboarding/steps';
import { ProfileStep } from '@components/onboarding/profile-step';
import { OrganizationStep } from '@components/onboarding/organization-step';
import { ProjectStep } from '@components/onboarding/project-step';
import { InviteStep } from '@components/onboarding/invite-step';
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { queryKeys } from '@lib/query/keys';

export type WelcomeStepId = 'profile' | 'organization' | 'project' | 'invite';

const INDEX: Record<WelcomeStepId, number> = { profile: 0, organization: 1, project: 2, invite: 3 };

export function WelcomeFlow({ step }: { step: WelcomeStepId }) {
  const router = useRouter();
  const projectKey = useSearchParams().get('project');
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const slug = user?.current_organization_slug ?? null;
  const organization = useOrganization(step === 'invite' ? slug : null);

  // Creating the organisation switches the session into it, so the slug only appears
  // once Me has been refetched. Judging the step before that lands would bounce the
  // person straight back to the form they just submitted.
  const settling = useIsFetching({ queryKey: queryKeys.me() }) > 0;

  // Arriving at a step out of order — a refresh, a bookmark, a back button — sends you
  // to the first one that is not done rather than to a form that cannot submit.
  const misplaced =
    user !== null &&
    !settling &&
    ((step === 'project' && slug === null) || (step === 'invite' && (slug === null || projectKey === null)));

  useEffect(() => {
    if (misplaced) router.replace(slug === null ? '/welcome/organization' : '/welcome/project');
  }, [misplaced, slug, router]);

  if (session.status === 'loading') return <FullPageLoader label="Checking your session" />;
  if (session.status === 'signed-out') return <FullPageLoader label="Taking you to sign-in" />;

  if (session.status === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center bg-app px-page-x-mobile">
        <div className="flex max-w-sm flex-col items-start gap-3">
          <h1 className="text-xl font-semibold tracking-tight">The server could not be reached</h1>
          <p className="text-text-secondary">Nothing was lost. Check the connection, then try again.</p>
          <Button onClick={session.retry}>Try again</Button>
        </div>
      </main>
    );
  }

  return (
    <FlowShell steps={WELCOME_STEPS} current={INDEX[step]} email={user?.email ?? null} intro={WELCOME_INTRO}>
      {misplaced ? (
        <StepSkeleton />
      ) : step === 'profile' && user ? (
        <ProfileStep user={user} />
      ) : step === 'organization' && user ? (
        <OrganizationStep user={user} />
      ) : step === 'project' ? (
        <ProjectStep />
      ) : organization.data && projectKey ? (
        <InviteStep organization={organization.data} projectKey={projectKey} />
      ) : (
        <StepSkeleton />
      )}
    </FlowShell>
  );
}

function StepSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-[420px]" />
      </div>
      <Skeleton className="h-control w-full" />
      <Skeleton className="h-control w-full" />
      <Skeleton className="h-9 w-40" />
    </div>
  );
}
