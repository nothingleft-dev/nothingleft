'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@components/ui/button';
import { PageHeader } from '@components/page-header';
import { PageSkeleton } from '@components/skeletons';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { SettingsSection } from '@components/settings/section';
import { CsvImportFlow } from '@components/imports/csv-import-flow';
import { RecentImports } from '@components/imports/recent-imports';
import { useProject } from '@hooks/use-projects';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useRecordProjectVisit } from '@hooks/use-project-visit';

export function ImportPage({ projectKey }: { projectKey: string }) {
  const project = useProject(projectKey);
  const roles = useProjectRoles();
  const [flow, setFlow] = useState({ run: 0, resumeId: null as number | null });
  useRecordProjectVisit(projectKey);

  if (project.isPending || roles.isPending) return <PageSkeleton rows={4} />;
  if (project.isError || !project.data) return <FormAlert title="This project could not be loaded." />;

  const header = (
    <PageHeader
      title="Import issues"
      meta={
        <span>
          {project.data.name} <span className="font-mono">{project.data.key}</span>
        </span>
      }
    />
  );

  if (!roles.canAdmin(projectKey)) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyState
          title={
            project.data.is_archived
              ? `${project.data.name} is archived, so nothing can be imported into it.`
              : `Importing into ${project.data.name} needs a Project Admin.`
          }
          description="Ask one of its Project Admins, or an Org Admin, to import the file."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${projectKey}/issues` as Route}>Back to the issues</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="flex max-w-6xl flex-col gap-5">
        <SettingsSection
          title="Import from CSV"
          description={`Each row becomes an issue in ${project.data.name}, created by you. Nobody is notified, and you are not added as a watcher.`}
        >
          <CsvImportFlow
            key={flow.run}
            project={projectKey}
            resumeId={flow.resumeId}
            onDone={() => setFlow(f => ({ run: f.run + 1, resumeId: null }))}
          />
        </SettingsSection>
        <SettingsSection title="Recent imports" description="The latest imports into this project, by anyone.">
          <RecentImports
            project={projectKey}
            onContinue={job => {
              setFlow(f => ({ run: f.run + 1, resumeId: job.id }));
              document.querySelector('[data-scroll-root]')?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
