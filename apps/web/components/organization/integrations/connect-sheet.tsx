'use client';

import { useState } from 'react';
import {
  CreateGitConnectionSchema,
  type CreateGitConnection,
  type GitConnectionCheck,
  type GitConnectionSecret,
  type GitProviderInfo,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@components/ui/sheet';
import { FormAlert } from '@components/auth/form-alert';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { useCheckGitConnection, useCreateGitConnection } from '@hooks/use-git';
import { isApiError } from '@lib/api/errors';
import { formatDate } from '@lib/datetime';
import { formatCount } from '@lib/numbers';
import { cn } from '@lib/utils';

export interface ConnectTarget {
  provider: GitProviderInfo;
  mode: 'token' | 'manual';
}

interface ConnectSheetProps {
  slug: string;
  target: ConnectTarget | null;
  onClose: () => void;
  onConnected: (connection: GitConnectionSecret) => void;
}

export function ConnectSheet({ slug, target, onClose, onConnected }: ConnectSheetProps) {
  return (
    <Sheet open={target !== null} onOpenChange={open => (open ? null : onClose())}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {target ? (
          <ConnectForm
            key={`${target.provider.kind}:${target.mode}`}
            slug={slug}
            target={target}
            onClose={onClose}
            onConnected={onConnected}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Field = 'base_url' | 'token' | 'account';

function ConnectForm({
  slug,
  target,
  onClose,
  onConnected,
}: Omit<ConnectSheetProps, 'target'> & { target: ConnectTarget }) {
  const { provider, mode } = target;
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [account, setAccount] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [checked, setChecked] = useState<GitConnectionCheck | null>(null);
  const check = useCheckGitConnection(slug);
  const create = useCreateGitConnection(slug);
  const manual = mode === 'manual';
  const label = provider.label;

  const body = (): CreateGitConnection | null => {
    const parsed = CreateGitConnectionSchema.safeParse({
      provider: provider.kind,
      mode,
      ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
      ...(token.trim() ? { token: token.trim() } : {}),
      ...(account.trim() ? { account: account.trim() } : {}),
    });
    const next: Partial<Record<Field, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        next[field] =
          field === 'base_url'
            ? 'An https:// address, such as https://gitlab.example.com.'
            : field === 'account'
              ? 'Letters, numbers, dots, dashes and underscores, as the account is spelled on the provider.'
              : 'Paste the whole token.';
      }
    }
    if (!manual && !token.trim()) next.token = 'A token is needed to read the repositories.';
    if (manual && !token.trim() && !account.trim())
      next.account = 'Without a token, name the account the webhooks come from.';
    setErrors(next);
    return parsed.success && Object.keys(next).length === 0 ? parsed.data : null;
  };

  const refuse = (error: Error) => {
    if (isApiError(error) && error.field && ['base_url', 'token', 'account'].includes(error.field)) {
      setErrors({ [error.field]: error.message });
      setFailure(null);
    } else setFailure(error.message);
  };

  const runCheck = () => {
    const input = body();
    if (!input) return;
    setFailure(null);
    check.mutate(input, { onSuccess: setChecked, onError: refuse });
  };

  const save = () => {
    const input = body();
    if (!input) return;
    setFailure(null);
    create.mutate(input, { onSuccess: onConnected, onError: refuse });
  };

  const changed = () => {
    setChecked(null);
    setFailure(null);
  };
  const pending = check.isPending || create.isPending;
  const canSave = manual ? !token.trim() || checked !== null : checked !== null;

  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        if (canSave) save();
        else runCheck();
      }}
      className="flex h-full flex-col"
    >
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle className="flex items-center gap-2">
          <ProviderGlyph provider={provider.kind} className="size-icon" />
          {manual ? `Connect ${label} by webhook` : `Connect ${label}`}
        </SheetTitle>
        <SheetDescription>
          {manual
            ? `You add a webhook to each repository yourself. A token is optional: with one, the server also reads a ${provider.pull_request_word}’s commits and recent history.`
            : `A group or project access token with the api scope, from someone with the Maintainer role: the server adds a webhook to each repository you link. The token is never shown again.`}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {failure ? <FormAlert title={failure} /> : null}

        <TextField
          id="git-base-url"
          label="Address"
          value={baseUrl}
          placeholder={provider.default_base_url}
          help={`Leave empty for ${provider.default_base_url}. A self-managed ${label} needs a publicly trusted certificate.`}
          error={errors.base_url}
          onChange={value => {
            setBaseUrl(value);
            changed();
          }}
        />
        {manual ? (
          <TextField
            id="git-account"
            label="Account"
            value={account}
            placeholder="acme-inc"
            help="The organisation or user the repositories belong to. Taken from the token when there is one."
            error={errors.account}
            onChange={value => {
              setAccount(value);
              changed();
            }}
          />
        ) : null}
        <TextField
          id="git-token"
          label={manual ? 'Token (optional)' : 'Access token'}
          value={token}
          type="password"
          mono
          help={
            manual
              ? 'A fine-grained token with read access to contents, pull requests and checks.'
              : 'Scope api, role Maintainer or above. A group token sees every project in the group.'
          }
          error={errors.token}
          onChange={value => {
            setToken(value);
            changed();
          }}
        />

        {checked ? (
          <div className="flex flex-col gap-1 rounded-md border px-3 py-2.5 text-sm" role="status">
            <span className="flex items-center gap-2 font-medium">
              <ProviderGlyph provider={checked.provider} />
              {checked.account.login}
            </span>
            <span className="text-xs text-text-secondary">
              Sees {formatCount(checked.repository_count)}{' '}
              {checked.repository_count === 1 ? 'repository' : 'repositories'}
              {checked.token_expires_at ? ` · the token expires ${formatDate(checked.token_expires_at)}` : ''}.
            </span>
          </div>
        ) : null}
        {checked?.can_manage_webhooks === false ? (
          <FormAlert tone="warning" title="This token cannot add webhooks.">
            Without the api scope and the Maintainer role, nothing reaches issues from the repositories you link. Make a
            token with both, then Check again.
          </FormAlert>
        ) : checked?.can_manage_webhooks === null ? (
          <p className="text-xs text-text-secondary">
            This {provider.label} does not say whether the token may add webhooks. If linking a repository fails, give
            the token the api scope and the Maintainer role.
          </p>
        ) : null}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        {token.trim() && !checked ? (
          <Button type="submit" disabled={pending}>
            {check.isPending ? 'Checking…' : 'Check'}
          </Button>
        ) : (
          <Button type="submit" disabled={pending || !canSave}>
            {create.isPending ? 'Connecting…' : 'Connect'}
          </Button>
        )}
      </SheetFooter>
    </form>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  help,
  error,
  placeholder,
  type = 'text',
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  help: string;
  error?: string | undefined;
  placeholder?: string;
  type?: 'text' | 'password';
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error !== undefined}
        aria-describedby={`${id}-help`}
        className={cn(mono && 'font-mono text-xs')}
        onChange={event => onChange(event.target.value)}
      />
      <p id={`${id}-help`} className={cn('text-xs', error ? 'text-danger-fg' : 'text-text-secondary')}>
        {error ?? help}
      </p>
    </div>
  );
}
