import type { MemberRef } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { FormerMemberChip, personTitle, deactivatedInk } from '@components/former-member-chip';
import { cn } from '@lib/utils';

interface AssigneeStackProps {
  assignees: readonly MemberRef[];
  /** Show the first person's name beside the avatars. */
  withName?: boolean;
  className?: string;
}

/** Avatars overlapping 4px with a surface ring; a dashed hollow circle when nobody is assigned. */
export function AssigneeStack({ assignees, withName = true, className }: AssigneeStackProps) {
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

  const shown = assignees.slice(0, 3);
  const names = assignees.map(personTitle).join(', ');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-text-secondary', className)}>
          <span className="flex flex-none items-center">
            {shown.map((person, i) => (
              <MemberAvatar
                key={person.username}
                member={person}
                className={cn('size-5 ring-[1.5px] ring-surface', i > 0 && '-ml-1')}
              />
            ))}
          </span>
          {withName ? (
            <span className="truncate">
              <span className={deactivatedInk(assignees[0])}>{assignees[0]!.name}</span>
              {assignees[0]!.former_member ? <FormerMemberChip className="ml-1.5 align-middle" /> : null}
              {assignees.length > 1 ? <span className="text-text-muted"> +{assignees.length - 1}</span> : null}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{names}</TooltipContent>
    </Tooltip>
  );
}
