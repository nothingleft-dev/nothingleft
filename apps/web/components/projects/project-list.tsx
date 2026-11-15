'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import type { Project } from '@nothingleft/types';
import { Archive, ArchiveRestore, MoreHorizontal, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { FormAlert } from '@components/auth/form-alert';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { LoadError, errorDetail } from '@components/query-state';
import { ProjectCard, ProjectCardSkeleton } from '@components/projects/project-card';
import { CreateProjectDialog } from '@components/projects/project-dialog';
import { useArchiveProject, useProjects } from '@hooks/use-projects';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useSession } from '@hooks/use-session';
import { toastError } from '@components/toast-error';
import { isRateLimited } from '@lib/api/errors';

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3';

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

export function ProjectList() {
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>('active');
  const [archiving, setArchiving] = useState<Project | null>(null);

  // The sidebar's + links here with ?new=1, so the URL is what opens the dialog and no
  // effect has to mirror it into state.
  const { orgAdmin } = useProjectRoles();
  const creating = orgAdmin && params.get('new') === '1';
  const setCreating = (open: boolean) => router.replace((open ? '/projects?new=1' : '/projects') as Route);

  const session = useSession();
  const hasOrg = session.status === 'signed-in' && session.user.current_organization_slug !== null;
  const projects = useProjects({ archived: filter === 'archived' ? 'true' : 'false' }, hasOrg);
  const archive = useArchiveProject();

  const rows = projects.data ?? [];
  const emptyActive = filter === 'active' && projects.data !== undefined && rows.length === 0;
  const archiveFailed = archive.isError && !isRateLimited(archive.error) ? archive.error : null;
  const unarchive = (project: Project) =>
    archive.mutate(
      { key: project.key, archived: false },
      {
        onSuccess: p => toast.success(`${p.name} is active again.`),
        onError: e => toastError(`Could not unarchive ${project.name}`, e, { retry: () => unarchive(project) }),
      },
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Projects"
        actions={
          // On phones the actions always take their own row, so New project arriving with the roles moves nothing.
          <div className="flex items-center justify-end gap-1 max-sm:w-[calc(100vw-2rem)] max-sm:justify-between">
            <Segmented ariaLabel="Project filter" value={filter} options={FILTERS} onChange={setFilter} />
            {orgAdmin && !emptyActive ? (
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-icon-sm" /> New project
              </Button>
            ) : null}
          </div>
        }
      />

      {session.status === 'signed-in' && !hasOrg ? (
        <EmptyState
          title="You’re not a member of any organisation."
          description="Projects live inside an organisation. Create one, or open an invitation link somebody sent you."
          action={
            <Button asChild>
              <Link href={'/welcome/organization' as Route}>Create an organisation</Link>
            </Button>
          }
        />
      ) : projects.isError && !projects.data ? (
        <LoadError onRetry={() => void projects.refetch()} detail={errorDetail(projects.error)}>
          Your projects could not be loaded.
        </LoadError>
      ) : projects.isPending ? (
        <div className={GRID} role="status" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'archived' ? 'Nothing is archived.' : 'No projects yet.'}
          description={
            filter === 'archived'
              ? 'Archived projects keep everything in them; they just stop appearing in the sidebar.'
              : orgAdmin
                ? 'A project holds issues, boards and documents. Create the first one and you can start filing work.'
                : 'A project holds issues, boards and documents. An Org Admin creates projects and adds you to them.'
          }
          action={
            filter === 'active' && orgAdmin ? <Button onClick={() => setCreating(true)}>New project</Button> : undefined
          }
        />
      ) : (
        <div className={GRID}>
          {rows.map(project => (
            <ProjectCard
              key={project.key}
              project={project}
              actions={
                project.my_role === 'project_admin' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Manage ${project.name}`}>
                        <MoreHorizontal className="size-icon-sm" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link href={`/projects/${project.key}/settings` as Route}>
                          <Settings className="size-icon-sm" /> Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {project.is_archived ? (
                        <DropdownMenuItem onSelect={() => unarchive(project)}>
                          <ArchiveRestore className="size-icon-sm" /> Unarchive
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onSelect={() => {
                            archive.reset();
                            setArchiving(project);
                          }}
                        >
                          <Archive className="size-icon-sm" /> Archive
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <CreateProjectDialog open={creating} onOpenChange={setCreating} />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={open => (open ? null : setArchiving(null))}
        title={`Archive ${archiving?.name ?? ''}?`}
        confirmLabel="Archive project"
        pendingLabel="Archiving…"
        destructive={false}
        pending={archive.isPending}
        onConfirm={() => {
          if (!archiving) return;
          archive.mutate(
            { key: archiving.key, archived: true },
            {
              onSuccess: p => {
                toast.success(`${p.name} archived.`);
                setArchiving(null);
              },
              onError: e => {
                if (isRateLimited(e)) toastError(`Could not archive ${archiving.name}`, e);
              },
            },
          );
        }}
      >
        <p>
          It leaves the sidebar and the active list for every member, and its issues become read-only. Nothing is
          deleted; unarchive it any time from the archived list.
        </p>
        {archiveFailed ? (
          <FormAlert title={`Could not archive ${archiving?.name ?? 'the project'}`}>{archiveFailed.message}</FormAlert>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
