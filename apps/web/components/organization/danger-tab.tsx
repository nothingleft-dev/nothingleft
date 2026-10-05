'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';
import { ORG_DELETION_GRACE_DAYS, PAGINATION_MAX_LIMIT, type Me, type Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { StepUpDialog } from '@components/step-up-dialog';
import { SettingsSection } from '@components/settings/section';
import { MemberPicker } from '@components/organization/member-picker';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PersonName } from '@components/former-member-chip';
import { useApiError } from '@hooks/use-api-error';
import { useMembers } from '@hooks/use-members';
import {
  useCancelDeletion,
  useCancelTransfer,
  useOfferOwnership,
  usePendingTransfer,
  useScheduleDeletion,
} from '@hooks/use-organization-lifecycle';
import { formatDate } from '@lib/datetime';

type DangerConfirm = 'transfer' | 'delete';
const DANGER_TAB = '/organization?tab=danger';

/** Owner only: the tab is not offered to anyone else, and the API refuses them too. */
export function DangerTab({ organization, user }: { organization: Organization; user: Me }) {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('confirm');
  const confirm: DangerConfirm | null = requested === 'transfer' || requested === 'delete' ? requested : null;
  const handled = () => {
    if (confirm) router.replace(DANGER_TAB as Route);
  };

  return (
    <div className="flex flex-col gap-5">
      <TransferSection
        organization={organization}
        user={user}
        reopen={confirm === 'transfer' ? params.get('to') : null}
        onReopened={handled}
      />
      <DeleteSection organization={organization} user={user} reopen={confirm === 'delete'} onReopened={handled} />
    </div>
  );
}

interface SectionProps {
  organization: Organization;
  user: Me;
  onReopened: () => void;
}

function TransferSection({ organization, user, reopen, onReopened }: SectionProps & { reopen: string | null }) {
  const slug = organization.slug;
  const pending = usePendingTransfer(slug, true);
  const members = useMembers(slug, { limit: PAGINATION_MAX_LIMIT });
  const offer = useOfferOwnership(slug);
  const cancel = useCancelTransfer(slug);
  const cancelError = useApiError(cancel.error);
  const [picked, setTarget] = useState<string | null>(null);
  const [chosenOpen, setOpen] = useState(false);
  const target = picked ?? reopen;
  const open = chosenOpen || reopen !== null;

  // Only someone who can actually receive it: active, with a verified address, not the Owner.
  const candidates = (members.data ?? []).filter(m => !m.is_owner && !m.deactivated && m.email_verified);
  const chosen = candidates.find(m => m.username === target) ?? null;
  const scheduled = organization.deletion !== null;
  const transfer = pending.data ?? null;

  return (
    <SettingsSection
      title="Transfer ownership"
      description="Every organisation has one Owner, who alone can delete it or hand it over. The member you choose gets an email to accept or decline; until then you stay the Owner."
    >
      {pending.isPending ? (
        <Skeleton className="h-14 w-full rounded-md" />
      ) : transfer ? (
        <div className="flex items-center gap-3 rounded-md border px-4 py-3 max-sm:flex-col max-sm:items-start">
          <MemberAvatar member={transfer.to} className="size-avatar" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="flex min-w-0 items-center gap-1.5">
              <span className="text-text-secondary">Offered to</span>
              <PersonName person={transfer.to} className="font-medium" />
            </p>
            <p className="text-sm text-text-secondary">
              Sent {formatDate(transfer.created_at)}. The link works until {formatDate(transfer.expires_at)}; a new
              offer replaces this one.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(undefined, {
                onSuccess: () => toast.success(`Offer to ${transfer.to.name} cancelled.`),
              })
            }
          >
            Cancel offer
          </Button>
        </div>
      ) : null}
      {cancelError.summary ? <FormAlert title={cancelError.summary} /> : null}

      {scheduled ? (
        <p className="text-sm text-text-secondary">
          Ownership cannot be handed over while the organisation is scheduled for deletion. Cancel the deletion first.
        </p>
      ) : (
        <div className="flex max-w-lg items-end gap-2 max-sm:flex-col max-sm:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">New owner</span>
            <MemberPicker
              people={candidates}
              value={target}
              onChange={setTarget}
              placeholder="Choose a member"
              label="New owner"
              loading={members.isPending}
            />
          </div>
          <Button size="sm" disabled={chosen === null} onClick={() => setOpen(true)}>
            {transfer ? 'Make a new offer' : 'Transfer ownership'}
          </Button>
        </div>
      )}
      {!scheduled && !members.isPending && candidates.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Nobody can receive it yet: the new Owner has to be an active member with a verified email address. Invite
          someone from the Invites tab.
        </p>
      ) : null}

      {chosen ? (
        <StepUpDialog
          open={open}
          onOpenChange={next => {
            setOpen(next);
            if (!next) {
              offer.reset();
              onReopened();
            }
          }}
          user={user}
          title={`Offer ${organization.name} to ${chosen.name}?`}
          confirmLabel="Send offer"
          pendingLabel="Sending…"
          destructive={false}
          returnTo={`${DANGER_TAB}&confirm=transfer&to=${encodeURIComponent(chosen.username)}`}
          pending={offer.isPending}
          error={offer.error}
          onConfirm={body =>
            offer.mutate(
              { ...body, username: chosen.username },
              {
                onSuccess: () => {
                  setOpen(false);
                  setTarget(null);
                  onReopened();
                  toast.success(`Offer sent to ${chosen.name}.`);
                },
              },
            )
          }
        >
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>{chosen.name} gets an email with a link to accept or decline, valid for 7 days.</li>
            <li>
              When they accept, they become the Owner and you stay an Org Admin. If they decline, nothing changes.
            </li>
            <li>
              {transfer ? `This replaces the offer to ${transfer.to.name}.` : 'You can cancel the offer until then.'}
            </li>
          </ul>
        </StepUpDialog>
      ) : null}
    </SettingsSection>
  );
}

function DeleteSection({ organization, user, reopen, onReopened }: SectionProps & { reopen: boolean }) {
  const slug = organization.slug;
  const schedule = useScheduleDeletion(slug);
  const cancel = useCancelDeletion(slug);
  const cancelError = useApiError(cancel.error);
  const [chosenOpen, setOpen] = useState(false);
  const open = chosenOpen || reopen;
  const [typed, setTyped] = useState('');

  const deletion = organization.deletion;

  return (
    <SettingsSection
      title="Delete organisation"
      description={`Deletion is scheduled, not immediate: nothing is removed for ${ORG_DELETION_GRACE_DAYS} days, and you can cancel at any time until then.`}
    >
      {cancelError.summary ? <FormAlert title={cancelError.summary} /> : null}
      {deletion ? (
        <div className="flex items-center gap-4 rounded-md border border-danger-fg/25 bg-danger-bg px-4 py-3 text-danger-fg max-sm:flex-col max-sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="font-medium">
              {organization.name} will be deleted on {formatDate(deletion.deletes_at)}
            </p>
            <p className="text-xs leading-5">
              Scheduled {formatDate(deletion.scheduled_at)}. Everyone can keep working until then; every member sees a
              banner with the date.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(undefined, { onSuccess: () => toast.success(`${organization.name} will not be deleted.`) })
            }
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel deletion'}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-md border border-danger-fg/25 px-4 py-3 max-sm:flex-col max-sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="font-medium">Delete {organization.name}</p>
            <p className="text-sm text-text-secondary">
              Projects, issues, comments, articles and files go after {ORG_DELETION_GRACE_DAYS} days. Members’ accounts
              are unaffected.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-danger-fg hover:text-danger-fg"
            onClick={() => setOpen(true)}
          >
            Delete organisation
          </Button>
        </div>
      )}

      <StepUpDialog
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) {
            setTyped('');
            schedule.reset();
            onReopened();
          }
        }}
        user={user}
        title={`Delete ${organization.name}?`}
        confirmLabel="Delete organisation"
        pendingLabel="Scheduling…"
        returnTo={`${DANGER_TAB}&confirm=delete`}
        ready={typed.trim() === slug}
        pending={schedule.isPending}
        error={schedule.error}
        onConfirm={body =>
          schedule.mutate(body, {
            onSuccess: () => {
              setOpen(false);
              setTyped('');
              onReopened();
              toast.success(`${organization.name} is scheduled for deletion.`);
            },
          })
        }
        before={
          <Field
            label={`Type ${slug} to confirm`}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="font-mono"
            value={typed}
            onChange={e => setTyped(e.target.value)}
          />
        }
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            In {ORG_DELETION_GRACE_DAYS} days its projects, issues, comments, articles and files are deleted, and nobody
            can open it any more. Files in your own connected bucket are never touched.
          </li>
          <li>
            Until then everyone can keep working and sees a banner with the date. You can cancel at any time; you, and
            every Org Admin, get an email now, a reminder the day before, and another when it is done.
          </li>
          <li>A pending ownership transfer is cancelled. The address {slug} stays reserved and is never reused.</li>
        </ul>
      </StepUpDialog>
    </SettingsSection>
  );
}
