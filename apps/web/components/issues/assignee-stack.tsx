import type { MemberRef } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PersonName, personTitle } from '@components/former-member-chip';
import { cn } from '@lib/utils';

interface AssigneeStackProps {
  assignees: readonly MemberRef[];
  /** Show the first person's name beside the avatars. */
  withName?: boolean;
  /** The first person's Former member or Inactive chip; rows leave it to the tooltip. */
  chip?: boolean;
  /** One avatar and a first name, then `+N` for everyone else: a single way to count, where the cell is narrow. */
  short?: boolean;
  nameClassName?: string;
  className?: string;
}

/** Avatars overlapping 4px with a surface ring; a dashed hollow circle when nobody is assigned. */
export function AssigneeStack({
  assignees,
  withName = true,
  chip = false,
  short = false,
  nameClassName,
  className,
}: AssigneeStackProps) {
  if (assignees.length === 0) {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-text-muted', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label="Unassigned"
              className="inline-block size-5 rounded-full border border-dashed border-border-strong"
            />
          </TooltipTrigger>
          <TooltipContent>Unassigned</TooltipContent>
        </Tooltip>
        {withName ? <span className="truncate">Unassigned</span> : null}
      </span>
    );
  }

  const shown = assignees.slice(0, short ? 1 : 3);
  const names = assignees.map(personTitle).join(', ');
  const hidden = assignees.length - shown.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-text-secondary', className)}>
          <span className="flex flex-none items-center">
            {shown.map((person, i) => (
              <MemberAvatar
                key={person.username}
                member={person}
                // The ring is drawn outside the avatar: 2.5px plus the 1.5px ring is the 4px overlap.
                className={cn('size-5 ring-[1.5px] ring-surface', i > 0 && '-ml-[2.5px]')}
              />
            ))}
            {!withName && hidden > 0 ? (
              <span className="-ml-[2.5px] grid h-5 min-w-5 place-items-center rounded-full bg-inset px-1 text-[10px] font-medium tabular text-text-secondary ring-[1.5px] ring-surface">
                +{hidden}
              </span>
            ) : null}
          </span>
          {withName ? (
            <>
              <PersonName
                person={assignees[0]!}
                chip={chip}
                className={nameClassName}
                {...(short ? { label: assignees[0]!.name.split(' ')[0]! } : {})}
              />
              {assignees.length > 1 ? (
                <span className="flex-none tabular text-text-muted">+{assignees.length - 1}</span>
              ) : null}
            </>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{names}</TooltipContent>
    </Tooltip>
  );
}
