'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import type { CreatedPersonalAccessToken, PatScope, PersonalAccessToken } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@components/ui/dialog';
import { EmptyState } from '@components/empty-state';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { useApiError } from '@hooks/use-api-error';
import { RelativeTime } from '@components/relative-time';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { ScopeChecklist } from '@components/settings/token-scopes';
import { CopyButton } from '@components/copy-button';
import { useNeedsVerification, VerifyEmailNotice } from '@components/settings/verify-email-notice';
import { useCreateToken, useRevokeToken, useTokens } from '@hooks/use-tokens';
import { cn } from '@lib/utils';

function projectReach(keys: readonly string[] | null): string {
  if (keys === null) return 'all projects';
  return keys.length > 0 ? keys.join(', ') : 'no projects';
}

export function TokensTab() {
  const tokens = useTokens();
  const revoke = useRevokeToken();
  const [created, setCreated] = useState<CreatedPersonalAccessToken | null>(null);
  const unverified = useNeedsVerification();

  return (
    <SettingsSection
      title="Access tokens"
      description="For MCP clients, scripts and CI. A token never exceeds your own permissions, and its roles are re-evaluated on every request."
      actions={<CreateTokenDialog onCreated={setCreated} disabled={unverified} />}
    >
      {unverified ? <VerifyEmailNotice title="Verify your email address before creating an access token." /> : null}
      {created ? <NewTokenNotice token={created} onDismiss={() => setCreated(null)} /> : null}

      {tokens.isPending ? <RowsSkeleton rows={2} /> : null}
      {tokens.isError ? <FormAlert title="Your tokens could not be loaded." /> : null}
      {tokens.isSuccess && tokens.data.length === 0 ? (
        <EmptyState title="No access tokens yet." description="Create one to connect an MCP client or a script." />
      ) : null}

      {tokens.isSuccess && tokens.data.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {tokens.data.map(token => (
            <TokenRow
              key={token.id}
              token={token}
              onRevoke={() => revoke.mutate(token.id, { onSuccess: () => toast.success('Token revoked.') })}
            />
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}

function TokenRow({ token, onRevoke }: { token: PersonalAccessToken; onRevoke: () => void }) {
  const revoked = token.revoked_at !== null;
  return (
    <li className={cn('flex min-h-row items-center gap-3 py-2', revoked && 'text-text-disabled')}>
      <KeyRound className="size-icon shrink-0 text-text-muted" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">
          {token.name}
          {revoked ? <span className="ml-2 text-xs text-text-muted">revoked</span> : null}
        </span>
        <span className="text-xs text-text-muted">
          <span className="font-mono tabular">{token.token_prefix}…</span> · {token.scopes.join(', ')}
          {` · ${projectReach(token.project_keys)}`} ·{' '}
          {token.last_used_at ? (
            <>
              last used <RelativeTime value={token.last_used_at} />
            </>
          ) : (
            'never used'
          )}
        </span>
      </div>
      <Button variant="ghost" size="sm" disabled={revoked} onClick={onRevoke} className="ml-auto shrink-0">
        Revoke
      </Button>
    </li>
  );
}

function NewTokenNotice({ token, onDismiss }: { token: CreatedPersonalAccessToken; onDismiss: () => void }) {
  return (
    <FormAlert tone="success" title="Copy your token now — this is the only time it is shown.">
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xs bg-inset px-2 py-1 font-mono text-2xs">{token.token}</code>
        <CopyButton value={token.token} what="Token" />
        <Button variant="ghost" size="sm" onClick={onDismiss}>
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
  const error = useApiError(create.error);

  const reset = () => {
    setName('');
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
            Scopes narrow what the token can do; they never widen it beyond your own roles.
          </DialogDescription>
        </DialogHeader>

        {error.summary ? <FormAlert title={error.summary} /> : null}

        <form
          noValidate
          id="create-token"
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault();
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
            error={error.fields['name']}
            onChange={e => setName(e.target.value)}
          />
          <ScopeChecklist value={scopes} onChange={setScopes} />
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-token" disabled={scopes.length === 0 || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create token'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
