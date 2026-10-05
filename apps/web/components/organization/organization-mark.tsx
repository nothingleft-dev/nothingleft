import type { Organization } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { initialsOf } from '@lib/initials';
import { cn } from '@lib/utils';

interface OrganizationMarkProps {
  organization: Pick<Organization, 'avatar_url' | 'name'> | null;
  className?: string;
}

/** The organisation's DiceBear blobs mark; its initials on ink stand in until it loads. */
export function OrganizationMark({ organization, className }: OrganizationMarkProps) {
  return (
    <Avatar className={cn('size-avatar flex-none rounded-sm', className)}>
      {organization ? <AvatarImage src={organization.avatar_url} alt="" /> : null}
      <AvatarFallback
        className={cn(
          'rounded-[inherit] text-[11px] font-semibold',
          organization ? 'bg-ink text-ink-fg' : 'bg-inset text-text-secondary',
        )}
      >
        {organization ? initialsOf(organization.name) : '?'}
      </AvatarFallback>
    </Avatar>
  );
}
