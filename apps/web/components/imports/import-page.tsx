'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@components/ui/button';
import { PageHeader } from '@components/page-header';
import { PageTitleSkeleton } from '@components/skeletons';
import { Skeleton } from '@components/ui/skeleton';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail, notFoundOn404 } from '@components/query-state';
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

  if (project.isPending || roles.isPending) return <ImportSkeleton />;
  if (!project.data) {
    notFoundOn404(project.error);
    return (
      <LoadError onRetry={() => void project.refetch()} detail={errorDetail(project.error)}>
        This project could not be loaded.
      </LoadError>
    );
  }

  const header = (
    <PageHeader
      title="Import issues"
      meta={
        <span>
          {project.data.name} · <span className="font-mono text-xs">{project.data.key}</span>
        </span>
      }
    />
  );

  if (!roles.canAdmin(projectKey)) {
    const archived = project.data.is_archived;
    const projectAdmin =
      roles.orgAdmin || roles.projects.some(p => p.key === projectKey && p.my_role === 'project_admin');
    const toSettings = archived && projectAdmin;
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyState
          title={
            archived
              ? `${project.data.name} is archived, so nothing can be imported into it.`
              : `Importing into ${project.data.name} needs a Project Admin.`
          }
          description={
            toSettings
              ? 'Unarchive it in the project’s settings, then import the file.'
              : archived
                ? 'A Project Admin can unarchive it in the project’s settings, then import the file.'
                : 'Ask one of its Project Admins, or an Org Admin, to import the file.'
          }
          action={
            <Button asChild variant="outline" size="sm">
              {toSettings ? (
                <Link href={`/projects/${projectKey}/settings` as Route}>Open project settings</Link>
              ) : (
                <Link href={`/projects/${projectKey}/issues` as Route}>Back to issues</Link>
              )}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="flex flex-col gap-5">
        <SettingsSection
          title="Import from CSV"
          description={`Each row becomes an issue in ${project.data.name}, created by you. Nobody is notified, and you are not added as a watcher.`}
        >
          <CsvImportFlow
            key={flow.run}
            project={projectKey}
            projectName={project.data.name}
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

function ImportSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <PageTitleSkeleton />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3 w-[30rem] max-w-full" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex h-5 items-center">
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed px-5 py-6">
            <Skeleton className="size-8 rounded-md" />
            <div className="flex w-full flex-col gap-1">
              <div className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-56" />
              </div>
              <div className="flex h-5 items-center">
                <Skeleton className="h-3 w-[32rem] max-w-full" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
