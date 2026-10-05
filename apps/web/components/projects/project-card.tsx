import Link from 'next/link';
import type { Route } from 'next';
import type { Project } from '@nothingleft/types';
import { ProjectMark } from '@components/projects/project-mark';
import { RelativeTime } from '@components/relative-time';
import { cn } from '@lib/utils';
import { PersonName } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';

export function ProjectCard({ project, actions }: { project: Project; actions?: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border bg-surface p-4 transition-colors hover:border-border-strong',
        project.is_archived && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <ProjectMark project={project} />

        <div className="flex min-w-0 flex-1 flex-col leading-5">
          <Link href={`/projects/${project.key}` as Route} className="truncate font-medium hover:underline">
            {project.name}
          </Link>
          <span className="font-mono text-xs text-text-muted">{project.key}</span>
        </div>

        {project.is_archived ? (
          <span className="rounded-sm bg-inset px-1.5 py-0.5 text-2xs text-text-secondary">Archived</span>
        ) : null}
        {actions}
      </div>

      {project.description_md ? (
        <p className="line-clamp-2 text-xs leading-5 text-text-secondary">{project.description_md}</p>
      ) : (
        <p className="text-xs text-text-muted">No description</p>
      )}

      <div className="flex items-center gap-2 border-t pt-3 text-xs text-text-muted">
        {project.lead ? (
          <span className="flex items-center gap-1.5">
            <MemberAvatar member={project.lead} className="size-4" initialsClassName="text-[8px]" />
            <PersonName person={project.lead} />
          </span>
        ) : (
          <span>No lead</span>
        )}
        <span>·</span>
        <span>
          Updated <RelativeTime value={project.updated_at} className="inline" />
        </span>
      </div>
    </div>
  );
}
