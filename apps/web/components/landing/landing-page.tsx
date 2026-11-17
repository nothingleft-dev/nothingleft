'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Field } from '@components/auth/field';
import { FullPageState, SECONDARY_LINK } from '@components/full-page-state';
import { PageTitle } from '@components/page-title';
import { PageSkeleton } from '@components/skeletons';
import { useLanding } from '@hooks/use-landing';
import { useOrganizations, useSwitchOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { OrganizationMark } from '@components/organization/organization-mark';
import { plural } from '@lib/numbers';

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

  if (landing.isError) {
    return (
      <FullPageState
        className="pt-12"
        eyebrow="Error"
        title="Your start page did not open"
        actions={
          <>
            <Button onClick={() => void landing.refetch()} disabled={landing.isFetching}>
              Try again
            </Button>
            <Link href="/projects" className={SECONDARY_LINK}>
              Go to your projects
            </Link>
          </>
        }
      >
        We could not work out where you left off. Your work is untouched.
      </FullPageState>
    );
  }
  if (!landing.data || kind === 'project' || kind === 'project_list' || kind === 'welcome') {
    return <PageSkeleton rows={3} />;
  }
  if (kind === 'no_org') return <NoOrganisation />;
  return <OrganisationChooser preferred={landing.data.organization_slug} />;
}

function LandingHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <PageTitle>{title}</PageTitle>
      <p className="max-w-[72ch] text-pretty text-text-secondary">{children}</p>
    </div>
  );
}

function OrganisationChooser({ preferred }: { preferred: string | null }) {
  const router = useRouter();
  const organizations = useOrganizations();
  const switchTo = useSwitchOrganization();
  const session = useSession();
  const current = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  const marked = current ?? preferred;
  const all = organizations.data ?? [];
  const working = all.find(org => org.slug === current) ?? null;
  // The organisation the session is already in leads, so the list agrees with the sidebar.
  const ordered = [...all].sort((a, b) => Number(b.slug === marked) - Number(a.slug === marked));

  const go = (slug: string) => {
    const done = () => router.replace('/dashboard');
    if (slug === current) done();
    else switchTo.mutate(slug, { onSuccess: done });
  };

  return (
    <div className="flex flex-col gap-5">
      <LandingHeader title="Choose an organisation">
        {working
          ? `You belong to ${plural(all.length, 'organisation')} and are working in ${working.name}. Carry on there or switch to another; the switcher at the top of the sidebar does the same at any time.`
          : 'You belong to several organisations. Choose one to work in; the switcher at the top of the sidebar changes it at any time.'}
      </LandingHeader>
      {organizations.isPending ? (
        <div
          className="flex flex-col divide-y divide-border-subtle rounded-md border"
          role="status"
          aria-label="Loading"
        >
          {[0, 1].map(i => (
            <div key={i} className="flex h-14 items-center gap-3 px-3">
              <Skeleton className="size-8 rounded-md" />
              <span className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-20" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
          {ordered.map(org => (
            <li key={org.slug}>
              <button
                type="button"
                onClick={() => go(org.slug)}
                disabled={switchTo.isPending}
                className="flex h-14 w-full items-center gap-3 px-3 text-left transition-colors duration-(--dur-fast) hover:bg-hover disabled:opacity-60"
              >
                <OrganizationMark organization={org} className="size-8 rounded-md" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate leading-5 font-medium">{org.name}</span>
                    {org.slug === marked ? (
                      <span className="flex-none rounded-sm bg-inset px-1.5 text-xs leading-5 font-medium text-text-secondary">
                        {org.slug === current ? 'Current' : 'Last used'}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs leading-4 text-text-secondary">{plural(org.seats.used, 'member')}</span>
                </span>
                <ArrowRight className="size-icon-sm flex-none text-text-secondary" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoOrganisation() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const token = link.trim().split('/invite/').pop()?.trim() ?? '';

  return (
    <div className="flex flex-col gap-5">
      <LandingHeader title="Join or create an organisation">
        You are not a member of any organisation. Start one of your own, or open an invitation somebody sent you.
      </LandingHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col items-start gap-4 rounded-md border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Start your own</h2>
            <p className="text-sm text-pretty text-text-secondary">
              Name it, add a first project, and invite people when you are ready.
            </p>
          </div>
          <Button asChild className="mt-auto">
            <Link href={'/welcome/organization' as Route}>Create an organisation</Link>
          </Button>
        </section>
        <section className="flex flex-col gap-4 rounded-md border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Join with an invitation</h2>
            <p className="text-sm text-pretty text-text-secondary">
              Paste the link from the email or message you were sent, or just the part after /invite/.
            </p>
          </div>
          <form
            noValidate
            className="mt-auto flex items-end gap-2 max-sm:flex-col max-sm:items-stretch"
            onSubmit={event => {
              event.preventDefault();
              if (token) router.push(`/invite/${encodeURIComponent(token)}` as Route);
            }}
          >
            <div className="min-w-0 flex-1">
              <Field
                label="Invitation link"
                placeholder={`${window.location.origin}/invite/…`}
                value={link}
                onChange={e => setLink(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={token === ''}>
              Open the invitation
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
