'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { MyWork } from '@components/dashboard/my-work';
import { ProjectsOverview } from '@components/dashboard/projects-overview';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { PageSkeleton } from '@components/skeletons';
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

  if (roles.isPending || !roles.org) return <PageSkeleton rows={6} />;

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
      {tab === 'work' ? <MyWork /> : <ProjectsOverview org={roles.org} />}
    </div>
  );
}
