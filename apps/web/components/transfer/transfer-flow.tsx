'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Crown, ScrollText } from 'lucide-react';
import type { Me, Organization, OwnershipTransfer } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { FormAlert } from '@components/auth/form-alert';
import { FlowShell } from '@components/onboarding/flow-shell';
import { StepPanel } from '@components/onboarding/step-panel';
import type { FlowStep } from '@components/onboarding/step-rail';
import { OrganizationMark } from '@components/organization/organization-mark';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PersonName } from '@components/former-member-chip';
import { useApiError } from '@hooks/use-api-error';
import { useSession } from '@hooks/use-session';
import { useSignOut } from '@hooks/use-sign-out';
import { useSwitchOrganization } from '@hooks/use-organizations';
import { useAcceptTransfer, useDeclineTransfer, useTransferPreview } from '@hooks/use-organization-lifecycle';
import { formatDate } from '@lib/datetime';
import { isApiError } from '@lib/api/errors';

const STEPS: readonly FlowStep[] = [
  {
    id: 'review',
    title: 'Review the offer',
    body: 'Check the organisation and who is handing it over.',
    icon: ScrollText,
  },
  { id: 'owner', title: 'You’re the Owner', body: 'Look after it from its settings.', icon: Crown },
];
const INTRO = 'Someone wants to hand you an organisation. Nothing changes until you accept.';

export function TransferFlow({ token }: { token: string }) {
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const preview = useTransferPreview(token, user !== null);
  const accept = useAcceptTransfer();
  const decline = useDeclineTransfer();
  const [accepted, setAccepted] = useState<Organization | null>(null);
  const [declined, setDeclined] = useState(false);
  const here = `/transfer/${token}`;

  const shell = (current: number, children: ReactNode) => (
    <FlowShell steps={STEPS} current={current} intro={INTRO} email={user?.email ?? null}>
      {children}
    </FlowShell>
  );

  if (session.status === 'loading' || (user && preview.isPending)) return shell(0, <PanelSkeleton />);

  if (session.status === 'signed-out' || !user) {
    return shell(
      0,
      <StepPanel
        eyebrow="Step 1 of 2"
        title="Sign in to see this offer"
        lede="An ownership transfer is for one person. Sign in as the member it was sent to, and you come straight back here."
      >
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/sign-in?next=${encodeURIComponent(here)}` as Route}>Sign in</Link>
          </Button>
        </div>
      </StepPanel>,
    );
  }

  if (preview.isError) return shell(0, <Unusable user={user} error={preview.error} next={here} />);
  const transfer = preview.data!;

  if (accepted) return shell(1, <Accepted organization={accepted} previous={transfer} />);

  if (declined) {
    return shell(
      0,
      <StepPanel
        eyebrow="Declined"
        title="Offer declined"
        lede={`${transfer.from.name} stays the Owner of ${transfer.organization.name}, and hears that you said no. Nothing else changed.`}
      >
        <div>
          <Button asChild>
            <Link href="/">Back to your work</Link>
          </Button>
        </div>
      </StepPanel>,
    );
  }

  const error = accept.error ?? decline.error;
  const pending = accept.isPending || decline.isPending;

  return shell(
    0,
    <StepPanel
      eyebrow="Step 1 of 2"
      title={`Become the Owner of ${transfer.organization.name}?`}
      lede={`You are signed in as ${user.email}. Nothing changes until you accept.`}
      footer={
        <>
          <Button onClick={() => accept.mutate(token, { onSuccess: setAccepted })} disabled={pending}>
            {accept.isPending ? 'Accepting…' : 'Accept'}
          </Button>
          <Button
            variant="outline"
            onClick={() => decline.mutate(token, { onSuccess: () => setDeclined(true) })}
            disabled={pending}
          >
            {decline.isPending ? 'Declining…' : 'Decline'}
          </Button>
        </>
      }
    >
      <TransferCard transfer={transfer} />
      {error ? <ErrorAlert error={error} /> : null}
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-5 text-text-secondary">
        <li>You become the one person who can delete {transfer.organization.name} or hand it on.</li>
        <li>{transfer.from.name} stays in the organisation as an Org Admin.</li>
        <li>Both of you get an email, and the audit log records the transfer.</li>
      </ul>
    </StepPanel>,
  );
}

function TransferCard({ transfer }: { transfer: OwnershipTransfer }) {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-surface p-4">
      <div className="flex items-center gap-3">
        <OrganizationMark organization={transfer.organization} className="size-10 rounded-md" />
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-medium">{transfer.organization.name}</p>
          <p className="truncate font-mono text-xs text-text-secondary">{transfer.organization.slug}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 gap-y-2.5 border-t pt-4 text-sm">
        <dt className="text-text-secondary">From</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <MemberAvatar member={transfer.from} />
          <PersonName person={transfer.from} className="text-text" />
          <span className="text-text-secondary">· Owner</span>
        </dd>
        <dt className="text-text-secondary">To</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <MemberAvatar member={transfer.to} />
          <PersonName person={transfer.to} className="text-text" />
          <span className="text-text-secondary">· you</span>
        </dd>
        <dt className="text-text-secondary">Expires</dt>
        <dd className="text-text">{formatDate(transfer.expires_at)}</dd>
      </dl>
    </div>
  );
}

function ErrorAlert({ error }: { error: unknown }) {
  const parsed = useApiError(error);
  return parsed.summary ? <FormAlert title={parsed.summary} /> : null;
}

function Accepted({ organization, previous }: { organization: Organization; previous: OwnershipTransfer }) {
  const router = useRouter();
  const switchTo = useSwitchOrganization();

  return (
    <StepPanel
      eyebrow="Step 2 of 2"
      title={`You now own ${organization.name}`}
      lede={`${previous.from.name} is now an Org Admin. You alone can delete ${organization.name} or hand it on, from its Danger zone.`}
      footer={
        <Button
          disabled={switchTo.isPending}
          onClick={() => switchTo.mutate(organization.slug, { onSuccess: () => router.push('/organization' as Route) })}
        >
          Open {organization.name}
        </Button>
      }
    >
      <div className="flex items-center gap-3 rounded-md border bg-surface p-4">
        <OrganizationMark organization={organization} className="size-10 rounded-md" />
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-medium">{organization.name}</p>
          <p className="text-xs text-text-secondary">Owner</p>
        </div>
      </div>
    </StepPanel>
  );
}

function Unusable({ user, error, next }: { user: Me; error: unknown; next: string }) {
  const signOut = useSignOut(next);
  const code = isApiError(error) ? error.code : null;
  const message = isApiError(error) ? error.message : 'The server could not be reached. Try again.';

  if (code === 'ownership_transfer.wrong_account') {
    return (
      <StepPanel
        eyebrow="Wrong account"
        title="This offer is for someone else"
        lede={`You are signed in as ${user.email}. The link only works for the member the Owner chose.`}
      >
        <div className="flex gap-2">
          <Button disabled={signOut.isPending} onClick={() => signOut.mutate()}>
            Sign in as someone else
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to your work</Link>
          </Button>
        </div>
      </StepPanel>
    );
  }

  if (code !== 'ownership_transfer.expired' && code !== 'ownership_transfer.invalid') {
    return (
      <StepPanel
        eyebrow="Step 1 of 2"
        title="The offer could not be loaded"
        lede="Nothing changed. Reload the page to try again."
      >
        <FormAlert title={message} />
      </StepPanel>
    );
  }

  return (
    <StepPanel
      eyebrow={code === 'ownership_transfer.expired' ? 'Expired' : 'Not valid'}
      title={code === 'ownership_transfer.expired' ? 'This offer has expired' : 'This link no longer works'}
      lede={
        code === 'ownership_transfer.expired'
          ? 'An offer lasts 7 days. Ask the Owner to make it again from the organisation’s Danger zone.'
          : 'It was accepted, declined, cancelled or replaced by a newer offer. If you expected to receive the organisation, ask the Owner.'
      }
    >
      <div>
        <Button asChild variant="outline">
          <Link href="/">Back to your work</Link>
        </Button>
      </div>
    </StepPanel>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full max-w-[420px]" />
      </div>
      <Skeleton className="h-40 w-full rounded-md" />
      <Skeleton className="h-9 w-48" />
    </div>
  );
}
