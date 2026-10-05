import type { Project } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { cn } from '@lib/utils';

interface ProjectMarkProps {
  project: Pick<Project, 'avatar_url' | 'avatar_color' | 'avatar_initials' | 'name'>;
  className?: string;
}

/** The project's DiceBear initials mark; the palette-tinted initials stand in until it loads. */
export function ProjectMark({ project, className }: ProjectMarkProps) {
  return (
    <Avatar className={cn('size-avatar-lg rounded-md', `c-${project.avatar_color}`, className)}>
      <AvatarImage src={project.avatar_url} alt="" />
      <AvatarFallback className="rounded-[inherit] bg-c-bg text-xs font-semibold text-c-fg">
        {project.avatar_initials}
      </AvatarFallback>
    </Avatar>
  );
}
