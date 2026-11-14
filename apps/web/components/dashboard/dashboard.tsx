'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { MyWork } from '@components/dashboard/my-work';
import { ProjectsOverview } from '@components/dashboard/projects-overview';
import { EmptyState } from '@components/empty-state';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { CompactRowsSkeleton } from '@components/dashboard/compact-issue-row';
import { PageTitleSkeleton } from '@components/skeletons';
import { LoadError } from '@components/query-state';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useSession } from '@hooks/use-session';
import { formatLongDate } from '@lib/datetime';

const TABS = [
  { value: 'work', label: 'My work' },
  { value: 'projects', label: 'Projects' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/**
 * DESIGN-SYSTEM § 8: Contributors and Observers see only My work, with no tab bar; a
 * Project Admin or above sees both and lands on Projects.
 */
export function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const roles = useProjectRoles();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;

  if (roles.failed) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Home" />
        <LoadError onRetry={roles.retry}>Your dashboard could not be loaded.</LoadError>
      </div>
    );
  }
  if (roles.isPending) return <HomeSkeleton />;
  if (!roles.org) {
    return (
      <EmptyState
        title="This organisation is not available to you."
        description="You may have left it, or it may have been deleted. Choose another organisation to continue."
        action={
          <Button asChild size="sm">
            <Link href={'/' as Route}>Choose an organisation</Link>
          </Button>
        }
      />
    );
  }

  const requested = params.get('tab');
  const tab: Tab = roles.isAdmin ? (requested === 'work' ? 'work' : 'projects') : 'work';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={tab === 'work' ? 'My work' : 'Projects'}
        meta={formatLongDate(new Date(), timeZone)}
        actions={
          roles.isAdmin ? (
            <Segmented
              ariaLabel="Dashboard"
              value={tab}
              options={TABS}
              onChange={next => router.replace(`/dashboard${next === 'work' ? '?tab=work' : ''}` as Route)}
            />
          ) : undefined
        }
      />
      {tab === 'work' ? <MyWork /> : <ProjectsOverview org={roles.org} orgAdmin={roles.orgAdmin} />}
    </div>
  );
}

const zeroWidth = '\u200b';

/** The loaded page's geometry: a linked stat row with its inset first cell, section headings, rows, rail. */
function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <PageTitleSkeleton />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 border-y max-sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-0.5 border-r py-3 pr-4 pl-4 first:pl-3 last:border-r-0 max-sm:[&:nth-child(2n)]:border-r-0 max-sm:[&:nth-child(2n+1)]:pl-3 max-sm:[&:nth-child(n+3)]:border-t"
            >
              <span className="flex items-center text-xl font-semibold">
                <Skeleton className="h-5 w-12" />
                {zeroWidth}
              </span>
              <span className="flex items-center text-xs">
                <Skeleton className="h-3 w-24" />
                {zeroWidth}
              </span>
              {i === 3 ? <Skeleton className="mt-2 h-1 w-full" /> : null}
            </div>
          ))}
        </div>
        <div className="grid items-start gap-8 min-[1200px]:grid-cols-[minmax(0,1fr)_var(--rail)]">
          <div className="flex flex-col gap-1">
            <div className="flex h-control items-center">
              <Skeleton className="h-3.5 w-28" />
            </div>
            <div className="mt-2 h-7 rounded-sm bg-app" />
            <CompactRowsSkeleton rows={6} />
          </div>
          <div className="flex flex-col gap-1 max-[1199px]:hidden">
            <div className="flex h-control items-center">
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="flex flex-col gap-3 px-2 py-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
                  <Skeleton className="h-2.5 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
