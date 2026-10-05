'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  EMAIL_INVITATION_BATCH_MAX,
  ORG_ROLES,
  PROJECT_ROLES,
  type OrgRole,
  type ProjectRole,
  type Seats,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { EmailChips } from '@components/invitations/email-chips';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { SeatNotice } from '@components/invitations/seat-notice';
import { useApiError } from '@hooks/use-api-error';
import { useInviteByEmail } from '@hooks/use-invitations';
import type { InviteScope } from '@lib/api/invitations';
import { ORG_ROLE_HINTS, ORG_ROLE_LABELS, PROJECT_ROLE_HINTS, PROJECT_ROLE_LABELS } from '@lib/roles';

const ORG_OPTIONS: ChoiceOption<OrgRole>[] = ORG_ROLES.map(value => ({
  value,
  label: ORG_ROLE_LABELS[value],
  hint: ORG_ROLE_HINTS[value],
}));

const PROJECT_OPTIONS: ChoiceOption<ProjectRole>[] = PROJECT_ROLES.map(value => ({
  value,
  label: PROJECT_ROLE_LABELS[value],
  hint: PROJECT_ROLE_HINTS[value],
}));

interface InviteEmailsFormProps {
  scope: InviteScope;
  /** Only an Org Admin may bake in `org_role: org_admin`, so the picker is hidden otherwise. */
  canGrantOrgAdmin: boolean;
  seats?: Seats | undefined;
  onSent?: () => void;
  submitLabel?: string;
}

export function InviteEmailsForm({
  scope,
  canGrantOrgAdmin,
  seats,
  onSent,
  submitLabel = 'Send invitations',
}: InviteEmailsFormProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [orgRole, setOrgRole] = useState<OrgRole>('member');
  const [projectRole, setProjectRole] = useState<ProjectRole>('contributor');
  const invite = useInviteByEmail(scope);
  const error = useApiError(invite.error);
  const isProject = scope.kind === 'project';

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault();
        if (emails.length === 0) return;
        invite.mutate(
          {
            emails,
            org_role: orgRole,
            ...(isProject ? { project_role: projectRole } : {}),
          },
          {
            onSuccess: sent => {
              setEmails([]);
              toast.success(sent.length === 1 ? 'Invitation sent.' : `${sent.length} invitations sent.`);
              onSent?.();
            },
          },
        );
      }}
    >
      {seats ? <SeatNotice seats={seats} /> : null}
      {error.summary ? <FormAlert title={error.summary} /> : null}

      <EmailChips value={emails} onChange={setEmails} max={EMAIL_INVITATION_BATCH_MAX} disabled={invite.isPending} />

      <div className="grid gap-4 sm:grid-cols-2">
        {isProject ? (
          <ChoiceSelect
            label="Role in this project"
            showHint
            value={projectRole}
            options={PROJECT_OPTIONS}
            onChange={setProjectRole}
            disabled={invite.isPending}
          />
        ) : null}
        {canGrantOrgAdmin ? (
          <ChoiceSelect
            label="Role in the organisation"
            showHint
            value={orgRole}
            options={ORG_OPTIONS}
            onChange={setOrgRole}
            disabled={invite.isPending}
          />
        ) : null}
      </div>

      <div className="flex items-start gap-3 max-sm:flex-col">
        <Button type="submit" disabled={invite.isPending || emails.length === 0}>
          {invite.isPending ? 'Sending…' : submitLabel}
        </Button>
        <span className="text-xs text-text-muted">
          Invitations expire in 14 days and can be used once.
          {isProject ? ' Accepting joins the organisation and this project in one step.' : ''}
        </span>
      </div>
    </form>
  );
}
