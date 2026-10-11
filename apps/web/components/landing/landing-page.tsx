'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PageTitle } from '@components/page-title';
import { PageSkeleton } from '@components/skeletons';
import { useLanding } from '@hooks/use-landing';
import { useOrganizations, useSwitchOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { OrganizationMark } from '@components/organization/organization-mark';
import { cn } from '@lib/utils';

/**
 * onboarding.md § Returning-user landing: the server decides, this page only routes. The
 * two answers that need a choice — several organisations, none at all — render here.
 */
export function LandingPage() {
  const router = useRouter();
  const session = useSession();
  const landing = useLanding(session.status === 'signed-in');
  const kind = landing.data?.kind;

  useEffect(() => {
    if (!landing.data) return;
    const { kind, project_key } = landing.data;
    if (kind === 'project' && project_key) router.replace(`/projects/${project_key}/issues` as Route);
    if (kind === 'project_list') router.replace('/projects');
    if (kind === 'welcome') router.replace('/welcome');
  }, [landing.data, router]);

  if (landing.isError)
    return (
      <FormAlert title="Your starting point could not be worked out.">
        Open the dashboard from the sidebar instead.
      </FormAlert>
    );
  if (!landing.data || kind === 'project' || kind === 'project_list' || kind === 'welcome') {
    return <PageSkeleton rows={3} />;
  }
  if (kind === 'no_org') return <NoOrganisation />;
  return <OrganisationSwitcher preferred={landing.data.organization_slug} />;
}

function OrganisationSwitcher({ preferred }: { preferred: string | null }) {
  const router = useRouter();
  const organizations = useOrganizations();
  const switchTo = useSwitchOrganization();
  const session = useSession();
  const current = session.status === 'signed-in' ? session.user.current_organization_slug : null;

  const go = (slug: string) => {
    const done = () => router.replace('/dashboard');
    if (slug === current) done();
    else switchTo.mutate(slug, { onSuccess: done });
  };

  return (
    <div className="flex max-w-lg flex-col gap-5">
      <div>
        <PageTitle>Where to</PageTitle>
        <p className="mt-1 text-text-secondary">
          You belong to several organisations. Pick the one to work in; the switcher in the sidebar changes it any time.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
        {(organizations.data ?? []).map(org => {
          const isPreferred = org.slug === (preferred ?? current);
          return (
            <li key={org.slug}>
              <button
                type="button"
                onClick={() => go(org.slug)}
                disabled={switchTo.isPending}
                className="flex h-12 w-full items-center gap-3 px-3 text-left hover:bg-hover disabled:opacity-60"
              >
                <OrganizationMark organization={org} />
                <span className="flex min-w-0 flex-1 flex-col leading-4">
                  <span className="truncate font-medium">{org.name}</span>
                  <span className="text-2xs text-text-muted">
                    {org.seats.used} {org.seats.used === 1 ? 'member' : 'members'}
                    {isPreferred ? ' · most recently used' : ''}
                  </span>
                </span>
                {isPreferred ? (
                  <Check className="size-icon-sm text-text-secondary" />
                ) : (
                  <ArrowRight className="size-icon-sm text-text-muted" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NoOrganisation() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const token = link.trim().split('/invite/').pop()?.trim() ?? '';

  return (
    <div className="flex max-w-lg flex-col gap-5">
      <EmptyState
        title="You’re not a member of any organisation."
        description="Every membership you had has been removed. Create an organisation of your own, or paste an invitation link somebody sent you."
        action={
          <Button asChild>
            <Link href={'/welcome/organization' as Route}>Create an organisation</Link>
          </Button>
        }
      />
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={event => {
          event.preventDefault();
          if (token) router.push(`/invite/${encodeURIComponent(token)}` as Route);
        }}
      >
        <Field
          label="Invitation link"
          placeholder="https://work.nothingleft.dev/invite/…"
          value={link}
          onChange={e => setLink(e.target.value)}
          hint="The whole link, or just the part after /invite/."
        />
        <Button type="submit" variant="outline" className={cn('self-start')} disabled={token === ''}>
          Open the invitation
        </Button>
      </form>
    </div>
  );
}
