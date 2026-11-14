import { Settings2 } from 'lucide-react';
import type { OrgActivity } from '@nothingleft/types';
import { MemberAvatar } from '@components/issues/member-avatar';
import { isSystemActivity } from '@components/organization/activity-labels';
import { cn } from '@lib/utils';

/** The actor's avatar, or a neutral system mark for an event nobody performed. */
export function ActivityAvatar({ row, className }: { row: OrgActivity; className?: string }) {
  if (isSystemActivity(row)) {
    return (
      <span
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center rounded-full bg-inset text-text-secondary',
          className ?? 'size-avatar',
        )}
      >
        <Settings2 className="size-3" />
      </span>
    );
  }
  return (
    <MemberAvatar
      member={row.actor ?? { name: '-', avatar_url: null }}
      className={className}
      initialsClassName="text-[10px]"
    />
  );
}
