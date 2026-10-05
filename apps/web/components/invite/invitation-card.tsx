import type { InvitationPreview } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { initialsOf } from '@lib/initials';
import { grantedRoleLabel } from '@lib/roles';

/** The card that states what is being joined before anything is asked — onboarding.md Path A step 1. */
export function InvitationCard({ preview }: { preview: InvitationPreview }) {
  const role = grantedRoleLabel(preview.org_role, preview.project_role);

  return (
    <div className="flex items-start gap-3 rounded-md border bg-surface p-4">
      <Avatar className="size-10 rounded-md">
        <AvatarImage src={preview.organization.avatar_url} alt="" className="rounded-md" />
        <AvatarFallback className="rounded-md bg-inset font-semibold text-text-secondary">
          {initialsOf(preview.organization.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">
          {preview.organization.name}
          {preview.project ? <span className="font-normal text-text-muted"> · {preview.project.name}</span> : null}
        </p>
        <p className="text-xs text-text-secondary">
          <span className="font-medium text-text">{preview.invited_by.name}</span> invited you as a{' '}
          <span className="inline-flex h-5 items-center rounded-sm bg-inset px-1.5 text-2xs font-medium text-text-secondary">
            {role}
          </span>
        </p>
        {preview.allowed_email_domain ? (
          <p className="text-xs text-text-muted">Open to @{preview.allowed_email_domain} addresses.</p>
        ) : null}
      </div>
    </div>
  );
}
