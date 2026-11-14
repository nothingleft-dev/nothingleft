'use client';

import { useEffect, useRef, useState } from 'react';
import { DoorOpen, KeyRound, MailCheck, ScrollText, UserRound } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import type { AcceptedInvitation, Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { FlowFrame, FlowShell } from '@components/onboarding/flow-shell';
import { StepPanel } from '@components/onboarding/step-panel';
import type { FlowStep } from '@components/onboarding/step-rail';
import { VerifyGate } from '@components/onboarding/verify-gate';
import { AcceptCard } from '@components/invite/accept-card';
import { InvitationCard } from '@components/invite/invitation-card';
import { InviteProfileStep } from '@components/invite/invite-profile-step';
import { InviteSignUp } from '@components/invite/invite-sign-up';
import { takeInviteIntent } from '@components/invite/invite-intent';
import { useAcceptInvitation, useDeclineInvitation, useInvitationPreview } from '@hooks/use-invitations';
import { useSession } from '@hooks/use-session';
import { isApiError } from '@lib/api/errors';

const ACCOUNT_STEP: FlowStep = {
  id: 'account',
  title: 'Your account',
  body: 'Sign up with Google, GitHub or your email.',
  icon: KeyRound,
};

const VERIFY_STEP: FlowStep = {
  id: 'verify',
  title: 'Confirm your email',
  body: 'Verify your address before joining.',
  icon: MailCheck,
};

const PROFILE_STEP: FlowStep = {
  id: 'profile',
  title: 'Your profile',
  body: 'Choose your name, photo and username.',
  icon: UserRound,
};

const REVIEW_STEP: FlowStep = {
  id: 'review',
  title: 'Review the invitation',
  body: 'Check the organisation and your role.',
  icon: ScrollText,
};

const JOINED_STEP: FlowStep = {
  id: 'joined',
  title: 'You’re in',
  body: 'Start working with your team.',
  icon: DoorOpen,
};

const INTRO_NEW = 'Join your team’s existing workspace.';
const INTRO_EXISTING = 'Joining adds a workspace; your other workspaces stay as they are.';

export function InviteFlow({ token }: { token: string }) {
  const session = useSession();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  const user = session.status === 'signed-in' ? session.user : null;
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null);
  const [declined, setDeclined] = useState(false);

  // Set when the account was created on this page, so Path A finishes without asking a
  // second time for a decision the person already made by pressing "Join". Read once, on
  // the client: the server has no sessionStorage, and the first paint is a skeleton
  // either way, so the two renders agree.
  const [auto, setAuto] = useState(() => typeof window !== 'undefined' && takeInviteIntent(token));

  const blockedOnEmail = auto && user !== null && preview.data?.kind === 'link' && user.email_verified_at === null;
  const shouldAutoAccept = auto && user !== null && !blockedOnEmail && accepted === null;

  const fired = useRef(false);
  useEffect(() => {
    if (!shouldAutoAccept || fired.current) return;
    fired.current = true;
    accept.mutate(token, { onSuccess: setAccepted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoAccept, token]);

  if (session.status === 'loading' || preview.isPending) {
    return (
      <FlowShell
        steps={[REVIEW_STEP, JOINED_STEP]}
        current={0}
        intro={INTRO_EXISTING}
        email={session.status === 'loading' ? undefined : (user?.email ?? null)}
      >
        <PanelSkeleton />
      </FlowShell>
    );
  }

  if (preview.isError) {
    return (
      <InvitationUnusable error={preview.error} email={user?.email ?? null} onRetry={() => void preview.refetch()} />
    );
  }

  const data = preview.data;
  const steps: FlowStep[] = auto
    ? blockedOnEmail
      ? [ACCOUNT_STEP, VERIFY_STEP, PROFILE_STEP]
      : [ACCOUNT_STEP, PROFILE_STEP]
    : user === null
      ? [ACCOUNT_STEP, PROFILE_STEP]
      : [REVIEW_STEP, JOINED_STEP];

  const intro = user === null || auto ? INTRO_NEW : INTRO_EXISTING;
  const shell = (current: number, children: React.ReactNode) => (
    <FlowShell steps={steps} current={current} intro={intro} email={user?.email ?? null}>
      {children}
    </FlowShell>
  );

  if (declined) {
    return shell(
      steps.length - 1,
      <StepPanel
        eyebrow="Declined"
        title="Invitation declined"
        lede={`Nothing was shared with ${data.organization.name}, and you are not a member of it.`}
      >
        <p className="text-sm leading-6 text-text-secondary">
          Declining used up this invitation, so the link will not work again. If that was a mistake, ask the person who
          invited you to send another.
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/dashboard">Back to your work</Link>
          </Button>
        </div>
      </StepPanel>,
    );
  }

  if (user === null) {
    return shell(
      0,
      <InviteSignUp token={token} preview={data} stepCount={steps.length} onSignedUp={() => setAuto(true)} />,
    );
  }

  if (blockedOnEmail) {
    return shell(
      1,
      <StepPanel
        eyebrow={`Step 2 of ${steps.length}`}
        title="Confirm your email to join"
        lede={`This is a share link, so ${data.organization.name} needs to know the address is yours before it lets you in.`}
      >
        <InvitationCard preview={data} />
        <VerifyGate user={user} reason="Confirm your email to join this organisation." />
      </StepPanel>,
    );
  }

  if (accepted) {
    // Path A finishes on a profile step, because the account was made moments ago.
    // Path B has a profile already, so it gets a confirmation and a way in.
    return shell(
      steps.length - 1,
      auto ? (
        <InviteProfileStep
          user={user}
          accepted={accepted}
          projectName={data.project?.name ?? null}
          stepNumber={steps.length}
          stepCount={steps.length}
        />
      ) : (
        <Joined accepted={accepted} projectName={data.project?.name ?? null} />
      ),
    );
  }

  if (auto || accept.isPending) return shell(steps.length - 1, <PanelSkeleton />);

  if (data.already_member) {
    return shell(
      1,
      <AlreadyMember user={user} organizationName={data.organization.name} project={data.project ?? null} />,
    );
  }

  return shell(
    0,
    <AcceptCard
      preview={data}
      user={user}
      isPending={accept.isPending}
      error={accept.error}
      onAccept={() => accept.mutate(token, { onSuccess: setAccepted })}
      onDecline={() => decline.mutate(token, { onSuccess: () => setDeclined(true) })}
    />,
  );
}

function Joined({ accepted, projectName }: { accepted: AcceptedInvitation; projectName: string | null }) {
  const { organization, project_key } = accepted;

  return (
    <StepPanel
      eyebrow="Step 2 of 2"
      title={`You’re in ${organization.name}`}
      lede={
        project_key
          ? `You joined the organisation and ${projectName ?? 'its project'} in one step, and you are now working in ${organization.name}.`
          : `You joined the organisation, and you are now working in ${organization.name}.`
      }
      footer={
        <Button asChild>
          <Link href={(project_key ? `/projects/${project_key}` : '/projects') as Route}>
            {project_key ? `Open ${projectName ?? project_key}` : 'Go to your projects'}
          </Link>
        </Button>
      }
    >
      <p className="text-sm leading-6 text-text-secondary">
        People here will mention you as{' '}
        <span className="font-medium text-text">@{organization.membership.username}</span>. It was made from your
        address; change it whenever you like in the organisation’s member list.
      </p>
    </StepPanel>
  );
}

function AlreadyMember({
  user,
  organizationName,
  project,
}: {
  user: Me;
  organizationName: string;
  project: { key: string; name: string } | null;
}) {
  return (
    <StepPanel
      eyebrow="Nothing to do"
      title={`You are already in ${organizationName}`}
      lede={`This link grants what ${user.email} already has, so nothing changed.`}
    >
      <Button asChild>
        <Link href={(project ? `/projects/${project.key}` : '/dashboard') as Route}>
          {project ? `Open ${project.name}` : 'Go to your dashboard'}
        </Link>
      </Button>
    </StepPanel>
  );
}

const GONE_REASON: Record<string, string> = {
  'invitation.expired': 'It expired before it was used.',
  'invitation.revoked': 'The person who sent it withdrew it.',
  'invitation.exhausted': 'It has been used as many times as it allows.',
};

function InvitationUnusable({ error, email, onRetry }: { error: unknown; email: string | null; onRetry: () => void }) {
  const reached = isApiError(error);
  const reason = reached ? (GONE_REASON[error.code] ?? 'The link is incomplete, or it was never issued.') : null;

  return (
    <FlowFrame email={email}>
      <main className="flex flex-1 justify-center px-6 pt-[clamp(2rem,8vh,4.5rem)] pb-10 max-lg:px-page-x-mobile max-lg:pt-10">
        <div className="comfortable-form flex w-full max-w-[440px] flex-col gap-6">
          <header className="flex flex-col gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">
              {!reached
                ? 'The invitation could not be loaded'
                : error.status === 410
                  ? 'This invitation is no longer open'
                  : 'That invitation link did not work'}
            </h1>
            <p className="text-md leading-6 text-text-secondary">
              {reason
                ? `${reason} Ask the person who invited you for a new link.`
                : 'The server could not be reached. Nothing was changed; check the connection and try again.'}
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            {reason ? (
              <Button asChild>
                <Link href={email ? '/' : '/sign-in'}>{email ? 'Back to your work' : 'Go to sign in'}</Link>
              </Button>
            ) : (
              <Button onClick={onRetry}>Try again</Button>
            )}
          </div>
        </div>
      </main>
    </FlowFrame>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-[420px]" />
      </div>
      <Skeleton className="h-20 w-full rounded-md" />
      <Skeleton className="h-9 w-40" />
    </div>
  );
}
