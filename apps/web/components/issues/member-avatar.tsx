import type { MemberRef } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { initialsOf } from '@lib/initials';
import { cn } from '@lib/utils';

interface MemberAvatarProps {
  member: Pick<MemberRef, 'name' | 'avatar_url'> & { deactivated?: boolean };
  className?: string;
  initialsClassName?: string;
}

export function MemberAvatar({ member, className, initialsClassName = 'text-[9px]' }: MemberAvatarProps) {
  return (
    <Avatar className={cn(className ?? 'size-avatar-sm', member.deactivated && 'opacity-50 grayscale')}>
      {member.avatar_url ? <AvatarImage src={member.avatar_url} alt="" /> : null}
      <AvatarFallback className={cn('bg-inset font-semibold text-text-secondary', initialsClassName)}>
        {initialsOf(member.name)}
      </AvatarFallback>
    </Avatar>
  );
}
