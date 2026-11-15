'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  CreatePersonalAccessTokenSchema,
  type CreatedPersonalAccessToken,
  type PatScope,
  type PersonalAccessToken,
} from '@nothingleft/types';
import { LoadError, errorDetail } from '@components/query-state';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@components/dialog';
import { EmptyState } from '@components/empty-state';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { useApiError } from '@hooks/use-api-error';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { SettingsList, SettingsListRow, SettingsListSkeleton } from '@components/settings/settings-list';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { ScopeChecklist } from '@components/settings/token-scopes';
import { CopyButton } from '@components/copy-button';
import { useNeedsVerification, VerifyEmailNotice } from '@components/settings/verify-email-notice';
import { useCreateToken, useRevokeToken, useTokens } from '@hooks/use-tokens';
import { cn } from '@lib/utils';
import { PendingButton } from '@components/pending-button';
import { useFieldProblems } from '@hooks/use-field-problems';

const projectList = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

function projectReach(keys: readonly string[] | null): string {
  if (keys === null) return 'All projects';
  return keys.length > 0 ? `Only ${projectList.format(keys)}` : 'No project access';
}

const SHOWN_SCOPES = 2;

export function TokensTab() {
  const tokens = useTokens();
  const revoke = useRevokeToken();
  const [created, setCreated] = useState<CreatedPersonalAccessToken | null>(null);
  const unverified = useNeedsVerification();

  return (
    <SettingsSection
      title="Your tokens"
      description="For MCP clients, scripts and CI. A token never exceeds your own permissions, and its roles are checked again on every request."
      actions={<CreateTokenDialog onCreated={setCreated} disabled={unverified} />}
    >
      {unverified ? <VerifyEmailNotice title="Verify your email address before creating an access token." /> : null}
      {created ? <NewTokenNotice token={created} onDismiss={() => setCreated(null)} /> : null}

      {tokens.isPending ? <SettingsListSkeleton rows={2} label="Loading tokens" trailing={['w-28', 'w-16']} /> : null}
      {tokens.isError && !tokens.data ? (
        <LoadError onRetry={() => void tokens.refetch()} detail={errorDetail(tokens.error)}>
          Your tokens could not be loaded.
        </LoadError>
      ) : null}
      {tokens.isSuccess && tokens.data.length === 0 ? (
        <EmptyState title="No access tokens yet." description="Create one to connect an MCP client or a script." />
      ) : null}

      {tokens.isSuccess && tokens.data.length > 0 ? (
        <SettingsList>
          {[...tokens.data]
            .sort((a, b) => Number(a.revoked_at !== null) - Number(b.revoked_at !== null))
            .map(token => (
              <TokenRow
                key={token.id}
                token={token}
                fresh={token.id === created?.id}
                onRevoke={() => revoke.mutate(token.id, { onSuccess: () => toast.success('Token revoked.') })}
              />
            ))}
        </SettingsList>
      ) : null}
    </SettingsSection>
  );
}

function TokenRow({ token, fresh, onRevoke }: { token: PersonalAccessToken; fresh: boolean; onRevoke: () => void }) {
  const revoked = token.revoked_at !== null;
  const hidden = token.scopes.length - SHOWN_SCOPES;
  return (
    <SettingsListRow className={cn(fresh && 'bg-selected')}>
      <KeyRound className="size-icon shrink-0 text-text-secondary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('truncate', revoked && 'text-text-secondary')}>{token.name}</span>
          {revoked ? (
            <span className="h-4.5 shrink-0 rounded-xs border px-1.5 text-2xs leading-4 whitespace-nowrap text-text-secondary">
              Revoked
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-text-secondary">
          <span className="font-mono tabular">{token.token_prefix}…</span>
          <span aria-hidden>·</span>
          <span className="truncate">{token.scopes.slice(0, SHOWN_SCOPES).join(', ')}</span>
          {hidden > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="h-4.5 shrink-0 rounded-xs border px-1 text-2xs leading-4 tabular">+{hidden}</span>
              </TooltipTrigger>
              <TooltipContent>{token.scopes.join(', ')}</TooltipContent>
            </Tooltip>
          ) : null}
        </span>
        <span className="truncate text-xs text-text-secondary sm:hidden">
          {projectReach(token.project_keys)} · <LastUse token={token} />
        </span>
      </div>
      <div className="flex w-44 shrink-0 flex-col items-end text-xs text-text-secondary max-sm:hidden">
        <span className="max-w-full truncate">{projectReach(token.project_keys)}</span>
        <span>
          <LastUse token={token} />
        </span>
      </div>
      <div className="flex w-20 shrink-0 justify-end">
        {revoked ? null : (
          <Button variant="ghost" size="sm" onClick={onRevoke}>
            Revoke
          </Button>
        )}
      </div>
    </SettingsListRow>
  );
}

function LastUse({ token }: { token: PersonalAccessToken }) {
  if (token.revoked_at)
    return (
      <>
        Revoked <RelativeTime value={token.revoked_at} className="text-text-secondary" />
      </>
    );
  if (!token.last_used_at) return <>Never used</>;
  return (
    <>
      Used <RelativeTime value={token.last_used_at} className="text-text-secondary" />
    </>
  );
}

function NewTokenNotice({ token, onDismiss }: { token: CreatedPersonalAccessToken; onDismiss: () => void }) {
  return (
    <FormAlert
      tone="warning"
      title={
        <>
          Token “<span className="font-semibold">{token.name}</span>” created
        </>
      }
    >
      <p>Copy it now — this is the only time it is shown.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xs bg-surface px-2 py-1 font-mono text-2xs text-text">
          {token.token}
        </code>
        <CopyButton value={token.token} what="Token" />
        <Button variant="outline" size="sm" className="text-text" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </FormAlert>
  );
}

function CreateTokenDialog({
  onCreated,
  disabled,
}: {
  onCreated: (token: CreatedPersonalAccessToken) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<PatScope[]>(['issues:read']);
  const create = useCreateToken();
  const error = useApiError(create.error, ['name']);
  const local = useFieldProblems(CreatePersonalAccessTokenSchema, { name: 'Name' });

  const reset = () => {
    setName('');
    local.clear('name');
    setScopes(['issues:read']);
    create.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>New token</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New access token</DialogTitle>
          <DialogDescription>
            Scopes narrow what the token can do; they never widen it beyond your own roles. It reaches every project you
            can open and does not expire.
          </DialogDescription>
        </DialogHeader>

        {error.summary ? <FormAlert title={error.summary} /> : null}

        <form
          noValidate
          id="create-token"
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault();
            if (!local.check({ name, scopes })) return;
            create.mutate(
              { name, scopes },
              {
                onSuccess: token => {
                  onCreated(token);
                  setOpen(false);
                  reset();
                },
              },
            );
          }}
        >
          <Field
            label="Name"
            placeholder="MCP client on my laptop"
            value={name}
            error={local.problems['name'] ?? error.fields['name']}
            onChange={e => {
              setName(e.target.value);
              local.clear('name');
            }}
          />
          <ScopeChecklist value={scopes} onChange={setScopes} />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <PendingButton
            type="submit"
            form="create-token"
            disabled={scopes.length === 0}
            pending={create.isPending}
            pendingLabel="Creating…"
          >
            Create token
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
