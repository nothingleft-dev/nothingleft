'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import type { Project } from '@nothingleft/types';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { FormAlert } from '@components/auth/form-alert';
import { ProjectCard } from '@components/projects/project-card';
import { CreateProjectDialog } from '@components/projects/project-dialog';
import { useArchiveProject, useProjects } from '@hooks/use-projects';
import { useSession } from '@hooks/use-session';

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
  const creating = params.get('new') === '1';
  const setCreating = (open: boolean) => router.replace((open ? '/projects?new=1' : '/projects') as Route);

  const session = useSession();
  const hasOrg = session.status === 'signed-in' && session.user.current_organization_slug !== null;
  const projects = useProjects({ archived: filter === 'archived' ? 'true' : 'false' }, hasOrg);
  const archive = useArchiveProject();

  const rows = projects.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Projects"
        actions={
          <>
            <Segmented ariaLabel="Project filter" value={filter} options={FILTERS} onChange={setFilter} />
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-icon-sm" /> New project
            </Button>
          </>
        }
      />

      {projects.isError ? <FormAlert title="Your projects could not be loaded." /> : null}

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
      ) : projects.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-36 rounded-md" />
          <Skeleton className="h-36 rounded-md" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'archived' ? 'Nothing is archived.' : 'No projects yet.'}
          description={
            filter === 'archived'
              ? 'Archived projects keep everything in them; they just stop appearing in the sidebar.'
              : 'A project holds issues, boards and documents. Create the first one and you can start filing work.'
          }
          action={filter === 'active' ? <Button onClick={() => setCreating(true)}>Create a project</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
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
                        <Link href={`/projects/${project.key}/settings` as Route}>Project settings</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          project.is_archived
                            ? archive.mutate(
                                { key: project.key, archived: false },
                                { onSuccess: p => toast.success(`${p.name} is active again.`) },
                              )
                            : setArchiving(project)
                        }
                      >
                        {project.is_archived ? 'Unarchive' : 'Archive'}
                      </DropdownMenuItem>
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
              onError: e => toast.error(e.message),
            },
          );
        }}
      >
        <p>
          It leaves the sidebar and the active list for every member, and its issues become read-only. Nothing is
          deleted; unarchive it any time from the archived list.
        </p>
      </ConfirmDialog>
    </div>
  );
}
