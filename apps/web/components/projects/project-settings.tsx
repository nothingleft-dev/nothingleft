'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';
import type { Project } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { PageHeader } from '@components/page-header';
import { Tabs } from '@components/tabs';
import { RowsSkeleton } from '@components/skeletons';
import { Skeleton } from '@components/ui/skeleton';
import { LoadError, errorDetail, notFoundOn404 } from '@components/query-state';
import { ConfirmDialog } from '@components/confirm-dialog';
import { SettingsSection } from '@components/settings/section';
import { InviteEmailsForm } from '@components/invitations/invite-emails-form';
import { ShareLinks } from '@components/invitations/share-links';
import { ProjectGeneralForm } from '@components/projects/project-general';
import { ReadOnlyNotice } from '@components/projects/read-only-notice';
import { ProjectPeople } from '@components/projects/project-people';
import { SchemaValues } from '@components/projects/schema-values';
import { DeletedIssues } from '@components/projects/deleted-issues';
import { TimeTrackingSwitch } from '@components/projects/time-tracking-switch';
import { TimeFields } from '@components/projects/time-fields';
import { WorkItemAttributes } from '@components/projects/work-item-attributes';
import { CustomFieldsSettings } from '@components/projects/custom-fields-settings';
import { BoardSettings } from '@components/agile/board-settings';
import { RepositoriesSettings } from '@components/projects/repositories-settings';
import { AutomationsSettings } from '@components/projects/automations/automations-settings';
import { useProjectRepositories } from '@hooks/use-git';
import type { SchemaTable } from '@lib/api/project-schema';
import { useArchiveProject, useProject } from '@hooks/use-projects';
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'statuses', label: 'Statuses' },
  { value: 'priorities', label: 'Priorities' },
  { value: 'types', label: 'Types' },
  { value: 'fields', label: 'Fields' },
  { value: 'time-tracking', label: 'Time tracking' },
  { value: 'boards', label: 'Boards' },
  { value: 'repositories', label: 'Repositories' },
  { value: 'automations', label: 'Automations' },
  { value: 'people', label: 'People' },
  { value: 'invites', label: 'Invites' },
  { value: 'deleted', label: 'Deleted issues' },
] as const;

type Tab = (typeof TABS)[number]['value'];

const SCHEMA_TABS: Partial<Record<Tab, SchemaTable>> = {
  statuses: 'statuses',
  priorities: 'priorities',
  types: 'types',
  'time-tracking': 'work-types',
};

const ADMIN_ONLY: readonly Tab[] = ['deleted', 'invites'];

// The tabs that say once, above everything, why nothing in them can change; the others say it in their own place.
const NOTICE_TABS: readonly Tab[] = ['statuses', 'priorities', 'types', 'fields', 'time-tracking', 'boards'];

const isTab = (value: string | null): value is Tab => TABS.some(t => t.value === value);

export function ProjectSettings({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const requested: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'general';

  const session = useSession();
  const slug = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  const project = useProject(projectKey);
  const organization = useOrganization(slug);
  const repositories = useProjectRepositories(projectKey, requested === 'automations');

  if (project.isPending) return <ProjectSettingsSkeleton />;
  if (!project.data) {
    notFoundOn404(project.error);
    return (
      <LoadError onRetry={() => void project.refetch()} detail={errorDetail(project.error)}>
        This project could not be loaded.
      </LoadError>
    );
  }

  const isAdmin = project.data.my_role === 'project_admin';
  const canEdit = isAdmin && !project.data.is_archived;
  const gitEnabled = project.data.git_enabled;
  const orgAdmin =
    organization.data?.membership.org_role === 'org_admin' || organization.data?.membership.is_owner === true;
  // Repositories is how a Project Admin turns git on; to anyone else it is noise until it is on (plan § 14).
  const tabs = TABS.filter(
    t => (isAdmin || !ADMIN_ONLY.includes(t.value)) && (t.value !== 'repositories' || isAdmin || gitEnabled),
  );
  const tab: Tab = tabs.some(t => t.value === requested) ? requested : 'general';
  const schemaTable = SCHEMA_TABS[tab];
  const readOnlyReason = project.data.is_archived
    ? 'The project is archived, so nothing here can change.'
    : 'Only a Project Admin can change these.';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <PageHeader title={project.data.name} meta={<span className="font-mono">{project.data.key}</span>} />
        <Tabs
          ariaLabel="Project settings"
          value={tab}
          options={tabs}
          onChange={next => router.replace(`/projects/${projectKey}/settings?tab=${next}` as Route)}
        />
      </div>

      <div className="flex flex-col gap-5">
        {!canEdit && NOTICE_TABS.includes(tab) ? <ReadOnlyNotice>{readOnlyReason}</ReadOnlyNotice> : null}

        {tab === 'general' ? (
          <div className="flex max-w-xl flex-col gap-5">
            {canEdit ? null : <ReadOnlyNotice>{readOnlyReason}</ReadOnlyNotice>}
            <SettingsSection title="Identity" description="What this project is called and how its issues are keyed.">
              <ProjectGeneralForm project={project.data} canEdit={canEdit} />
            </SettingsSection>
            {isAdmin ? <ArchiveSection project={project.data} /> : null}
          </div>
        ) : null}

        {tab === 'fields' ? <CustomFieldsSettings projectKey={projectKey} canEdit={canEdit} /> : null}

        {tab === 'time-tracking' ? (
          <>
            <TimeTrackingSwitch project={project.data} canEdit={canEdit} />
            <TimeFields project={project.data} canEdit={canEdit} />
          </>
        ) : null}

        {schemaTable === 'work-types' ? (
          <WorkItemAttributes projectKey={projectKey} canEdit={canEdit} />
        ) : schemaTable ? (
          <SchemaValues key={schemaTable} projectKey={projectKey} table={schemaTable} canEdit={canEdit} />
        ) : null}

        {tab === 'boards' ? (
          <BoardSettings projectKey={projectKey} selectedSlug={params.get('board')} canEdit={canEdit} />
        ) : null}

        {tab === 'repositories' ? (
          <RepositoriesSettings
            projectKey={projectKey}
            orgSlug={slug}
            canEdit={canEdit}
            orgAdmin={orgAdmin}
            readOnlyReason={readOnlyReason}
          />
        ) : null}

        {tab === 'automations' ? (
          repositories.isPending && gitEnabled ? (
            <RowsSkeleton rows={4} columns={['lines', 'chip', 'icon']} />
          ) : (
            <AutomationsSettings
              projectKey={projectKey}
              canEdit={canEdit}
              orgAdmin={orgAdmin}
              readOnlyReason={
                project.data.is_archived
                  ? readOnlyReason
                  : 'Only a Project Admin can change automations; you can read them and their runs.'
              }
              repositories={repositories.data ?? []}
            />
          )
        ) : null}

        {tab === 'deleted' ? <DeletedIssues projectKey={projectKey} canRestore={canEdit} /> : null}

        {tab === 'people' ? <ProjectPeople project={project.data} orgSlug={slug} canEdit={isAdmin} /> : null}

        {tab === 'invites' ? (
          <>
            <SettingsSection
              title="Invite by email"
              description="Accepting joins the organisation and this project in one step, so nobody is invited twice."
            >
              <InviteEmailsForm
                scope={{ kind: 'project', key: projectKey }}
                canGrantOrgAdmin={organization.data?.membership.org_role === 'org_admin'}
                seats={organization.data?.seats}
              />
            </SettingsSection>
            <SettingsSection title="Share links" description="Anyone with a link joins with that link’s role.">
              {slug ? <ShareLinks scope={{ kind: 'project', key: projectKey }} orgSlug={slug} /> : null}
            </SettingsSection>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ArchiveSection({ project }: { project: Project }) {
  const [confirming, setConfirming] = useState(false);
  const archive = useArchiveProject();

  return (
    <SettingsSection
      title={project.is_archived ? 'Archived' : 'Archive'}
      description={
        project.is_archived
          ? 'It keeps everything in it and stays readable; it just does not appear in the sidebar.'
          : 'Takes it out of the sidebar and the active list. Nothing in it is deleted.'
      }
      actions={
        project.is_archived ? (
          <Button
            variant="outline"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(
                { key: project.key, archived: false },
                { onSuccess: () => toast.success('Project is active again.') },
              )
            }
          >
            Unarchive
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Archive project
          </Button>
        )
      }
    >
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${project.name}?`}
        confirmLabel="Archive project"
        pendingLabel="Archiving…"
        destructive={false}
        pending={archive.isPending}
        onConfirm={() =>
          archive.mutate(
            { key: project.key, archived: true },
            {
              onSuccess: () => {
                toast.success(`${project.name} archived.`);
                setConfirming(false);
              },
            },
          )
        }
      >
        <p>Its issues, boards and documents stay exactly where they are and stay readable.</p>
        <p>It leaves the sidebar and the active project list. Unarchiving puts it back, whole.</p>
      </ConfirmDialog>
    </SettingsSection>
  );
}

/** The page before the project loads: its title, the tab strip and the General form at their real sizes. */
function ProjectSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="flex min-h-10 items-center gap-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-8" />
        </div>
        <div className="flex h-11 items-center gap-6 overflow-hidden border-b px-3">
          {[52, 60, 62, 40, 40, 92, 48, 88, 84, 50, 46, 96].map((width, i) => (
            <Skeleton key={i} className="h-3.5 flex-none" style={{ width }} />
          ))}
        </div>
      </div>
      <div className="flex max-w-xl flex-col gap-4" aria-hidden>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map(i => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="h-control w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-14" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 14 }, (_, i) => (
              <Skeleton key={i} className="size-6 rounded-sm" />
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
