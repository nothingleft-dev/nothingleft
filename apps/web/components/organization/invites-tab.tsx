'use client';

import { toast } from 'sonner';
import type { Invitation, Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { RowsSkeleton } from '@components/skeletons';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { InviteEmailsForm } from '@components/invitations/invite-emails-form';
import { ShareLinks } from '@components/invitations/share-links';
import { useInvitations, useRevokeInvitation } from '@hooks/use-invitations';
import { grantedRoleLabel } from '@lib/roles';

const STATUS_LABEL: Record<Invitation['status'], string> = {
  active: 'Waiting',
  accepted: 'Accepted',
  expired: 'Expired',
  exhausted: 'Used up',
  revoked: 'Revoked',
};

export function InvitesTab({ organization }: { organization: Organization }) {
  const scope = { kind: 'organization', slug: organization.slug } as const;
  const invitations = useInvitations(scope);
  const revoke = useRevokeInvitation(scope, organization.slug);

  const emails = (invitations.data ?? []).filter(i => i.kind === 'email');

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection title="Invite by email" description="One single-use invitation per address, valid for 14 days.">
        <InviteEmailsForm scope={scope} canGrantOrgAdmin seats={organization.seats} />
      </SettingsSection>

      <SettingsSection
        title="Share links"
        description="Anyone with the link can join with the selected role. Replacing a link makes the old one stop working."
      >
        <ShareLinks scope={scope} orgSlug={organization.slug} />
      </SettingsSection>

      <SettingsSection title="Email invitations" description="Everything sent, in every state.">
        {invitations.isPending ? (
          <RowsSkeleton rows={4} />
        ) : emails.length === 0 ? (
          <EmptyState
            title="Nothing sent yet."
            description="Addresses you invite above appear here until they are used."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
            {emails.map(invitation => (
              <li key={invitation.id} className="flex h-row-lg items-center gap-3 px-3">
                <div className="flex min-w-0 flex-1 flex-col leading-4">
                  <span className="truncate">{invitation.email}</span>
                  <span className="truncate text-xs text-text-muted">
                    {grantedRoleLabel(invitation.org_role, invitation.project_role)}
                    {invitation.project_key ? ` · ${invitation.project_key}` : ''} · invited by{' '}
                    {invitation.created_by.name}
                  </span>
                </div>

                <span className="w-20 text-xs text-text-secondary">{STATUS_LABEL[invitation.status]}</span>
                <RelativeTime value={invitation.created_at} className="w-24 text-right text-xs max-sm:hidden" />

                {invitation.status === 'active' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(invitation.id, { onSuccess: () => toast.success('Invitation revoked.') })
                    }
                  >
                    Revoke
                  </Button>
                ) : (
                  <span className="w-[68px]" />
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
