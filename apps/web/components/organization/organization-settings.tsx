'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import type { Me, Organization } from '@nothingleft/types';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { PageSkeleton } from '@components/skeletons';
import { FormAlert } from '@components/auth/form-alert';
import { EmptyState } from '@components/empty-state';
import { Button } from '@components/ui/button';
import { SeatBanner } from '@components/invitations/seat-notice';
import { StorageBanner } from '@components/attachments/storage-banner';
import { GeneralTab } from '@components/organization/general-tab';
import { MembersTab } from '@components/organization/members-tab';
import { InvitesTab } from '@components/organization/invites-tab';
import { AuditTab } from '@components/organization/audit-tab';
import { PlanTab } from '@components/organization/plan-tab';
import { StorageTab } from '@components/organization/storage/storage-tab';
import { DangerTab } from '@components/organization/danger-tab';
import { TagsTab } from '@components/organization/tags/tags-tab';
import { ExportsTab } from '@components/organization/exports-tab';
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { useProjectRoles } from '@hooks/use-project-roles';
import { cn } from '@lib/utils';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'members', label: 'Members' },
  { value: 'invites', label: 'Invites' },
  { value: 'tags', label: 'Tags' },
  { value: 'audit', label: 'Audit log' },
  { value: 'storage', label: 'Storage' },
  { value: 'exports', label: 'Exports' },
  { value: 'plan', label: 'Plan' },
  { value: 'danger', label: 'Danger zone' },
] as const;

type Tab = (typeof TABS)[number]['value'];

const isTab = (value: string | null): value is Tab => TABS.some(t => t.value === value);

export function OrganizationSettings() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'general';

  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const slug = user?.current_organization_slug ?? null;
  const organization = useOrganization(slug);

  // Anything an admin cannot read answers 404, so the tabs an admin owns are hidden
  // rather than rendered into a wall of errors - permissions.md rule 4.
  const isAdmin =
    organization.data?.membership.org_role === 'org_admin' || organization.data?.membership.is_owner === true;
  const isOwner = organization.data?.membership.is_owner === true;
  // Tags open to a Project Admin of any project too (permissions.md § Tags).
  const roles = useProjectRoles();
  const projectAdmin = roles.isAdmin;
  const awaitingRoles = tab === 'tags' && !isAdmin && roles.isPending;
  const allowed = (t: Tab) =>
    t === 'danger' ? isOwner : isAdmin || t === 'general' || t === 'members' || (t === 'tags' && projectAdmin);
  const visible = TABS.filter(t => allowed(t.value));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Organisation"
        actions={
          <Segmented
            ariaLabel="Organisation settings"
            value={tab}
            options={visible}
            onChange={next => router.replace(`/organization?tab=${next}` as Route)}
          />
        }
      />

      {session.status === 'loading' || (slug !== null && organization.isPending) || awaitingRoles ? (
        <PageSkeleton rows={5} />
      ) : null}

      {slug === null && session.status === 'signed-in' ? <NoOrganization /> : null}

      {organization.isError ? <FormAlert title="This organisation could not be loaded." /> : null}

      {organization.data && user && !awaitingRoles ? (
        <OrganizationTabs
          organization={organization.data}
          user={user}
          tab={allowed(tab) ? tab : 'general'}
          isAdmin={isAdmin}
        />
      ) : null}
    </div>
  );
}

interface OrganizationTabsProps {
  organization: Organization;
  user: Me;
  tab: Tab;
  isAdmin: boolean;
}

function OrganizationTabs({ organization, user, tab, isAdmin }: OrganizationTabsProps) {
  return (
    // The storage tab's file list is a table of seven columns; the other tabs are forms.
    <div className={cn('flex flex-col gap-5', tab === 'storage' ? 'max-w-6xl' : 'max-w-4xl')}>
      {isAdmin ? <SeatBanner seats={organization.seats} /> : null}
      {tab === 'storage' ? null : <StorageBanner storage={organization.storage} withLink={false} />}

      {tab === 'general' ? <GeneralTab organization={organization} isAdmin={isAdmin} /> : null}
      {tab === 'members' ? <MembersTab organization={organization} isAdmin={isAdmin} /> : null}
      {tab === 'invites' ? <InvitesTab organization={organization} /> : null}
      {tab === 'audit' ? <AuditTab organization={organization} /> : null}
      {tab === 'tags' ? <TagsTab orgAdmin={isAdmin} /> : null}
      {tab === 'storage' ? <StorageTab organization={organization} user={user} /> : null}
      {tab === 'exports' ? <ExportsTab organization={organization} /> : null}
      {tab === 'plan' ? <PlanTab organization={organization} /> : null}
      {tab === 'danger' ? <DangerTab organization={organization} user={user} /> : null}
    </div>
  );
}

/** onboarding.md § Returning-user landing: never a blank screen or an error. */
function NoOrganization() {
  return (
    <EmptyState
      title="You’re not a member of any organisation."
      description="Create one, or open an invitation link somebody sent you. Nothing is lost - your account and your settings are still here."
      action={
        <Button asChild>
          <a href="/welcome/organization">Create an organisation</a>
        </Button>
      }
    />
  );
}
