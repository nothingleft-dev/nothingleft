'use client';

import type { Project } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { useProjects } from '@hooks/use-projects';
import { cn } from '@lib/utils';

interface ProjectMarkProps {
  project: Pick<Project, 'avatar_url' | 'avatar_color' | 'avatar_initials' | 'name'>;
  /** `xs` sits inline with text: a picker option, a group heading, a field value. */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  xs: ['size-4 rounded-[4px]', 'text-[7px]'],
  sm: ['size-avatar-sm rounded-sm', 'text-[10px]'],
  md: ['size-avatar rounded-sm', 'text-xs'],
  lg: ['size-avatar-lg rounded-md', 'text-xs'],
} as const;

/** The project's DiceBear initials mark; the same colours stand in until it loads. */
export function ProjectMark({ project, size = 'lg', className }: ProjectMarkProps) {
  return (
    <Avatar className={cn(SIZE[size][0], `c-${project.avatar_color}`, className)}>
      <AvatarImage src={project.avatar_url} alt="" />
      <AvatarFallback className={cn('rounded-[inherit] bg-c-mark font-semibold text-mark-text', SIZE[size][1])}>
        {project.avatar_initials}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * A project's mark where only its key is at hand: read from the project list every page already holds,
 * never a request per row. A project not in it (archived, or out of reach) gets a neutral key badge.
 */
export function ProjectMarkByKey({
  projectKey,
  size = 'xs',
  className,
}: {
  projectKey: string;
  size?: ProjectMarkProps['size'];
  className?: string;
}) {
  const project = useProjects({ archived: 'false' }).data?.find(p => p.key === projectKey);
  if (project) return <ProjectMark project={project} size={size} className={className} />;
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center bg-inset font-semibold text-text-secondary',
        SIZE[size ?? 'xs'][0],
        SIZE[size ?? 'xs'][1],
        className,
      )}
    >
      {projectKey.slice(0, 2)}
    </span>
  );
}
