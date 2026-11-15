'use client';

import { useState } from 'react';
import { Link2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PROJECT_ROLES, type Invitation, type OrgRole, type ProjectRole } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { EmptyState } from '@components/empty-state';
import { RelativeTime } from '@components/relative-time';
import { formatDate } from '@lib/datetime';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError, errorDetail } from '@components/query-state';
import { cn } from '@lib/utils';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { useApiError } from '@hooks/use-api-error';
import {
  useCreateInvitationLink,
  useInvitationUses,
  useInvitations,
  useRevokeInvitation,
  useRotateInvitation,
} from '@hooks/use-invitations';
import type { InviteScope } from '@lib/api/invitations';
import { PROJECT_ROLE_HINTS, PROJECT_ROLE_LABELS, grantedRoleLabel } from '@lib/roles';
import { PendingButton } from '@components/pending-button';

const PROJECT_OPTIONS: ChoiceOption<ProjectRole>[] = PROJECT_ROLES.map(value => ({
  value,
  label: PROJECT_ROLE_LABELS[value],
  hint: PROJECT_ROLE_HINTS[value],
}));

interface ShareLinksProps {
  scope: InviteScope;
  /** Revoke, rotate and uses are addressed by id under the organisation, whatever the link's scope. */
  orgSlug: string;
  orgRole?: OrgRole;
}

export function ShareLinks({ scope, orgSlug, orgRole = 'member' }: ShareLinksProps) {
  const invitations = useInvitations(scope);
  const [projectRole, setProjectRole] = useState<ProjectRole>('contributor');
  const create = useCreateInvitationLink(scope);
  const error = useApiError(create.error, []);

  const links = (invitations.data ?? []).filter(i => i.kind === 'link' && i.status !== 'revoked');

  return (
    <div className="flex flex-col gap-4">
      {error.summary ? <FormAlert title="The link was not created.">{error.summary}</FormAlert> : null}

      <div className={cn('flex flex-wrap items-end gap-3', invitations.isError && !invitations.data && 'hidden')}>
        {scope.kind === 'project' ? (
          <div className="w-[240px]">
            <ChoiceSelect
              label="Link grants"
              value={projectRole}
              options={PROJECT_OPTIONS}
              onChange={setProjectRole}
              disabled={create.isPending}
            />
          </div>
        ) : null}
        <PendingButton
          type="button"
          variant="outline"
          pending={create.isPending}
          pendingLabel="Creating…"
          onClick={() =>
            create.mutate(
              {
                org_role: orgRole === 'org_admin' ? 'member' : orgRole,
                ...(scope.kind === 'project' ? { project_role: projectRole } : {}),
              },
              { onSuccess: () => toast.success('Share link created.') },
            )
          }
        >
          <Link2 className="size-icon-sm" />
          {links.length === 0 ? 'Create a share link' : 'Create link'}
        </PendingButton>
      </div>
      {invitations.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-row w-full rounded-md" />
          <Skeleton className="h-row w-3/4 rounded-md" />
        </div>
      ) : !invitations.data ? (
        <LoadError onRetry={() => void invitations.refetch()} detail={errorDetail(invitations.error)}>
          The share links could not be loaded.
        </LoadError>
      ) : links.length === 0 ? (
        <EmptyState
          title="No share link yet."
          description="A link can be pasted into a group chat and used by everyone who opens it. It never expires unless you say so, and revoking it is one click."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
          {links.map(link => (
            <ShareLinkRow key={link.id} link={link} scope={scope} orgSlug={orgSlug} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShareLinkRow({ link, scope, orgSlug }: { link: Invitation; scope: InviteScope; orgSlug: string }) {
  const [copied, setCopied] = useState(false);
  const [showUses, setShowUses] = useState(false);
  const revoke = useRevokeInvitation(scope, orgSlug);
  const rotate = useRotateInvitation(scope, orgSlug);

  const copy = async () => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('The clipboard is blocked. Select the address and copy it by hand.');
    }
  };

  const facts = [
    `Joins as ${grantedRoleLabel(link.org_role, link.project_role)}`,
    link.max_uses === null ? 'Unlimited uses' : `${link.use_count} of ${link.max_uses} used`,
    link.expires_at === null ? 'No expiry' : `Expires ${formatDate(link.expires_at)}`,
    link.allowed_email_domain ? `Only @${link.allowed_email_domain} emails` : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-1 max-sm:flex-wrap">
        <code className="mr-1 min-w-0 flex-1 truncate rounded-sm bg-inset max-sm:basis-full px-2 py-1 font-mono text-xs text-text-secondary">
          {link.url ?? 'Hidden'}
        </code>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Copy link"
              className="min-w-18"
              onClick={() => void copy()}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied' : 'Copy to the clipboard'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Replace link"
              disabled={rotate.isPending}
              onClick={() =>
                rotate.mutate(link.id, {
                  onSuccess: () => toast.success('New link issued. The old one stopped working.'),
                })
              }
            >
              Replace
            </Button>
          </TooltipTrigger>
          <TooltipContent>Issue a new address; the old one stops working</TooltipContent>
        </Tooltip>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Revoke link"
          disabled={revoke.isPending}
          onClick={() => revoke.mutate(link.id, { onSuccess: () => toast.success('Link revoked.') })}
        >
          Revoke
        </Button>
      </div>

      <ul className="flex flex-wrap items-center gap-y-1 text-xs text-text-secondary">
        {facts.map((fact, i) => (
          <li key={fact} className="flex items-center">
            {i > 0 ? <Dot /> : null}
            {fact}
          </li>
        ))}
        {link.use_count > 0 ? (
          <li className="flex items-center">
            <Dot />
            <button
              type="button"
              aria-expanded={showUses}
              onClick={() => setShowUses(v => !v)}
              className="inline-flex items-center gap-1 font-medium text-text-secondary underline decoration-current/45 underline-offset-4 hover:text-text hover:decoration-2"
            >
              <Users className="size-3" />
              {link.use_count} joined
            </button>
          </li>
        ) : null}
      </ul>

      {showUses ? <LinkUses orgSlug={orgSlug} id={link.id} /> : null}
    </li>
  );
}

function LinkUses({ orgSlug, id }: { orgSlug: string; id: number }) {
  const uses = useInvitationUses(orgSlug, id);

  if (uses.isPending) return <Skeleton className="h-8 w-full rounded-sm" />;

  return (
    <ul className="flex flex-col gap-1 rounded-sm bg-app px-2 py-1.5">
      {(uses.data ?? []).map(use => (
        <li key={`${use.username}-${use.used_at}`} className="flex items-center gap-2 text-xs">
          <span className="font-medium text-text-secondary">{use.name}</span>
          <span className="font-mono text-text-muted">@{use.username}</span>
          <RelativeTime value={use.used_at} className="ml-auto text-text-muted" />
        </li>
      ))}
    </ul>
  );
}

function Dot() {
  return (
    <span aria-hidden className="px-1.5 text-text-muted">
      ·
    </span>
  );
}
