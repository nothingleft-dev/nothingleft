import type { InvitationPreview } from '@nothingleft/types';
import { OrganizationMark } from '@components/organization/organization-mark';
import { grantedRoleLabel } from '@lib/roles';

/** The card that states what is being joined before anything is asked — onboarding.md Path A step 1. */
export function InvitationCard({ preview }: { preview: InvitationPreview }) {
  const role = grantedRoleLabel(preview.org_role, preview.project_role);

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-surface p-4">
      <div className="flex items-start gap-3">
        <OrganizationMark organization={preview.organization} className="size-8 rounded-md" />
        <div className="flex min-w-0 flex-col">
          <p className="line-clamp-2 font-medium" title={preview.organization.name}>
            {preview.organization.name}
          </p>
          {preview.project ? <p className="line-clamp-2 text-xs text-text-secondary">{preview.project.name}</p> : null}
        </div>
      </div>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2.5 border-t pt-4 text-sm">
        <dt className="text-text-secondary">Invited by</dt>
        <dd className="min-w-0 text-text">{preview.invited_by.name}</dd>
        <dt className="text-text-secondary">Role</dt>
        <dd className="text-text">{role}</dd>
        {preview.allowed_email_domain ? (
          <>
            <dt className="text-text-secondary">Open to</dt>
            <dd className="text-text">@{preview.allowed_email_domain} addresses</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
