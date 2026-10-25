'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';
import type { Project } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { PageSkeleton } from '@components/skeletons';
import { FormAlert } from '@components/auth/form-alert';
import { ConfirmDialog } from '@components/confirm-dialog';
import { SettingsSection } from '@components/settings/section';
import { InviteEmailsForm } from '@components/invitations/invite-emails-form';
import { ShareLinks } from '@components/invitations/share-links';
import { ProjectGeneralForm } from '@components/projects/project-dialog';
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

const ADMIN_ONLY: readonly Tab[] = ['deleted'];

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

  if (project.isPending) return <PageSkeleton rows={5} />;
  if (project.isError || !project.data) return <FormAlert title="This project could not be loaded." />;

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
      <PageHeader
        title={project.data.name}
        meta={<span className="font-mono">{project.data.key}</span>}
        actions={
          <Segmented
            ariaLabel="Project settings"
            value={tab}
            options={tabs}
            onChange={next => router.replace(`/projects/${projectKey}/settings?tab=${next}` as Route)}
          />
        }
      />

      <div className="flex max-w-4xl flex-col gap-5">
        {tab === 'general' ? (
          <>
            <SettingsSection title="Identity" description="What this project is called and how its issues are keyed.">
              <ProjectGeneralForm project={project.data} canEdit={canEdit} />
            </SettingsSection>
            {isAdmin ? <ArchiveSection project={project.data} /> : null}
          </>
        ) : null}

        {tab === 'fields' ? (
          <CustomFieldsSettings projectKey={projectKey} canEdit={canEdit} readOnlyReason={readOnlyReason} />
        ) : null}

        {tab === 'time-tracking' ? (
          <>
            <TimeTrackingSwitch project={project.data} canEdit={canEdit} />
            <TimeFields project={project.data} canEdit={canEdit} />
          </>
        ) : null}

        {schemaTable === 'work-types' ? (
          <WorkItemAttributes projectKey={projectKey} canEdit={canEdit} readOnlyReason={readOnlyReason} />
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
            <PageSkeleton rows={4} />
          ) : (
            <AutomationsSettings
              projectKey={projectKey}
              canEdit={canEdit}
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
            <SettingsSection title="Share links" description="Anyone with the link can join with the selected role.">
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
