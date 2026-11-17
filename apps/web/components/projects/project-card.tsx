import { markdownPlainText } from '@nothingleft/markdown';
import Link from 'next/link';
import type { Route } from 'next';
import type { Project } from '@nothingleft/types';
import { Skeleton } from '@components/ui/skeleton';
import { ProjectMark } from '@components/projects/project-mark';
import { RelativeTime } from '@components/relative-time';
import { cn } from '@lib/utils';
import { PersonName } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';

const CARD = 'flex min-w-0 flex-col gap-3 rounded-md border bg-surface p-4';

export function ProjectCard({ project, actions }: { project: Project; actions?: React.ReactNode }) {
  return (
    <div className={CARD}>
      <div className="flex items-start gap-3">
        <ProjectMark project={project} className={cn(project.is_archived && 'opacity-50 grayscale')} />

        <div className="flex min-w-0 flex-1 flex-col leading-5">
          <Link href={`/projects/${project.key}` as Route} className="truncate font-medium hover:underline">
            {project.name}
          </Link>
          <span className="font-mono text-xs text-text-muted">{project.key}</span>
        </div>

        {actions}
      </div>

      {project.description_md ? (
        <p className="line-clamp-2 min-h-10 flex-1 text-xs leading-5 text-text-secondary">
          {markdownPlainText(project.description_md)}
        </p>
      ) : (
        <p className="min-h-10 flex-1 text-xs leading-5 text-text-muted">No description</p>
      )}

      <div className="flex h-5 items-center gap-2 border-t pt-3 text-xs text-text-muted box-content">
        {project.lead ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <MemberAvatar member={project.lead} className="size-5 flex-none" initialsClassName="text-[9px]" />
            <PersonName person={project.lead} />
          </span>
        ) : (
          <span>No lead</span>
        )}
        <span aria-hidden>·</span>
        <span className="flex-none">
          Updated <RelativeTime value={project.updated_at} className="inline" />
        </span>
      </div>
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className={CARD} aria-hidden>
      <div className="flex items-start gap-3">
        <Skeleton className="size-avatar-lg flex-none rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-5 items-center">
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
      </div>
      <div className="flex min-h-10 flex-col">
        <div className="flex h-5 items-center">
          <Skeleton className="h-2.5 w-full max-w-[90%]" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-2.5 w-full max-w-[60%]" />
        </div>
      </div>
      <div className="flex h-5 items-center gap-2 border-t pt-3 box-content">
        <Skeleton className="size-5 flex-none rounded-full" />
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-2.5 w-28" />
      </div>
    </div>
  );
}
