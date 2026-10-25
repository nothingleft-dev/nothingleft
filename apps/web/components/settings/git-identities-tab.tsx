'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ClaimGitIdentitySchema,
  GIT_PROVIDER_KINDS,
  type ClaimGitIdentity,
  type GitIdentity,
  type GitProviderKind,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Skeleton } from '@components/ui/skeleton';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { RelativeTime } from '@components/relative-time';
import { Segmented } from '@components/segmented';
import { SettingsSection } from '@components/settings/section';
import { HueDot } from '@components/git/git-marks';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { useClaimGitIdentity, useMyGitIdentities, useRemoveMyGitIdentity } from '@hooks/use-git';
import { isApiError } from '@lib/api/errors';
import { providerLabel } from '@lib/git/words';
import { cn } from '@lib/utils';

const PUBLIC_HOSTS: Record<GitProviderKind, string> = { github: 'https://github.com', gitlab: 'https://gitlab.com' };

const HOW: Record<GitIdentity['verified_by'], string> = {
  provider: 'Matched by the provider',
  email: 'Verified by email',
  claim: 'Claimed',
};

export function GitIdentitiesTab() {
  const identities = useMyGitIdentities();
  const rows = identities.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Your git identities"
        description="The logins and commit emails that are yours, so branches, commits and pull requests show under your name in every organisation you belong to. Used for attribution only, never to sign in."
      >
        {identities.isPending ? (
          <IdentitiesSkeleton />
        ) : identities.isError && !identities.data ? (
          <FormAlert title="Your identities could not be loaded.">
            <button type="button" onClick={() => void identities.refetch()}>
              Try again
            </button>
          </FormAlert>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No identity added yet."
            description="Work signed with your verified account email already counts. Add a login, or another email your commits use, below."
          />
        ) : (
          <ul className="divide-y divide-border-subtle rounded-md border">
            {rows.map(identity => (
              <IdentityRow key={identity.id} identity={identity} />
            ))}
          </ul>
        )}
      </SettingsSection>
      <AddIdentity />
    </div>
  );
}

function IdentityRow({ identity }: { identity: GitIdentity }) {
  const remove = useRemoveMyGitIdentity();
  const resend = useClaimGitIdentity();
  const selfHosted = identity.base_url !== PUBLIC_HOSTS[identity.provider];

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      <ProviderGlyph provider={identity.provider} className="text-text-muted" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-xs">{identity.login ? `@${identity.login}` : identity.email}</span>
        <span className="text-2xs text-text-secondary">
          {identity.login ? 'Login' : 'Commit email'} on {providerLabel(identity.provider)}
          {selfHosted ? ` at ${identity.base_url}` : ''}
        </span>
      </span>
      <span className="ml-auto flex items-center gap-3 text-xs text-text-secondary">
        {identity.pending ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-warning-fg">
              <HueDot hue="amber" />
              Waiting for the link we sent
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={resend.isPending}
              onClick={() =>
                resend.mutate(
                  {
                    provider: identity.provider,
                    email: identity.email!,
                    ...(selfHosted ? { base_url: identity.base_url } : {}),
                  },
                  {
                    onSuccess: () =>
                      toast.success(
                        `A link is on its way to ${identity.email}. If we sent one a few minutes ago, that one still works.`,
                      ),
                    onError: error => toast.error(error.message),
                  },
                )
              }
            >
              Send again
            </Button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <HueDot hue="green" />
            {HOW[identity.verified_by]}
          </span>
        )}
        <RelativeTime value={identity.verified_at ?? identity.created_at} className="w-20 text-right" />
        <Button
          variant="ghost"
          size="xs"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutateAsync(identity.id).then(
              () => toast.success(`${identity.login ? `@${identity.login}` : identity.email} is no longer yours.`),
              (error: Error) => toast.error(error.message),
            )
          }
        >
          Remove
        </Button>
      </span>
    </li>
  );
}

const KINDS = [
  { value: 'login', label: 'Login' },
  { value: 'email', label: 'Commit email' },
] as const;
type Kind = (typeof KINDS)[number]['value'];

const PROVIDERS = GIT_PROVIDER_KINDS.map(kind => ({ value: kind, label: providerLabel(kind) }));

function AddIdentity() {
  const [provider, setProvider] = useState<GitProviderKind>('github');
  const [kind, setKind] = useState<Kind>('login');
  const [value, setValue] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selfHosted, setSelfHosted] = useState(false);
  const [errors, setErrors] = useState<{ value?: string; base_url?: string }>({});
  const claim = useClaimGitIdentity();

  const submit = () => {
    const input = {
      provider,
      ...(kind === 'login' ? { login: value.trim() } : { email: value.trim() }),
      ...(selfHosted && baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
    };
    const parsed = ClaimGitIdentitySchema.safeParse(input);
    if (!parsed.success) {
      const bad = new Set(parsed.error.issues.map(i => i.path[0]));
      setErrors({
        ...(bad.has('login') || bad.has('email')
          ? {
              value:
                kind === 'login'
                  ? 'The login as it appears on the provider, such as alex-lee.'
                  : 'An email address, such as alex@example.com.',
            }
          : {}),
        ...(bad.has('base_url') ? { base_url: 'An https:// address, such as https://gitlab.example.com.' } : {}),
      });
      return;
    }
    setErrors({});
    claim.mutate(parsed.data as ClaimGitIdentity, {
      onSuccess: list => {
        const added = list.find(i =>
          kind === 'login' ? i.login === parsed.data.login : i.email === parsed.data.email,
        );
        toast.success(
          added?.pending
            ? `We sent a link to ${parsed.data.email}. It counts once you follow it.`
            : `${kind === 'login' ? `@${parsed.data.login}` : parsed.data.email} on ${providerLabel(provider)} is yours now.`,
        );
        setValue('');
      },
      onError: error => {
        if (isApiError(error) && (error.field === 'login' || error.field === 'email'))
          setErrors({ value: error.message });
        else if (isApiError(error) && error.field === 'base_url') setErrors({ base_url: error.message });
        else setErrors({});
      },
    });
  };

  const fieldError = errors.value;
  const failure = claim.isError && !fieldError && !errors.base_url ? claim.error.message : null;

  return (
    <SettingsSection
      title="Add an identity"
      description="A login counts at once; an Org Admin can remove one that is not yours. An email counts once you follow the link we send to it."
    >
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
        className="flex max-w-xl flex-col gap-4"
      >
        {failure ? <FormAlert title={failure} /> : null}
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Provider</span>
            <Segmented ariaLabel="Provider" value={provider} options={PROVIDERS} onChange={setProvider} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">What</span>
            <Segmented
              ariaLabel="Identity kind"
              value={kind}
              options={KINDS}
              onChange={next => {
                setKind(next);
                setErrors({});
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="git-identity-value">{kind === 'login' ? 'Login' : 'Email'}</Label>
          <Input
            id="git-identity-value"
            value={value}
            placeholder={kind === 'login' ? 'alex-lee' : 'alex@example.com'}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={fieldError !== undefined}
            aria-describedby="git-identity-help"
            className="font-mono text-xs"
            onChange={event => {
              setValue(event.target.value);
              if (fieldError) setErrors({ ...errors, value: undefined });
            }}
          />
          <p id="git-identity-help" className={cn('text-xs', fieldError ? 'text-danger-fg' : 'text-text-secondary')}>
            {fieldError ??
              (kind === 'login'
                ? `Your username on ${providerLabel(provider)}, without the @.`
                : 'The address in your commits’ author line: git config user.email.')}
          </p>
        </div>
        {selfHosted ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="git-identity-base-url">Address of your {providerLabel(provider)}</Label>
            <Input
              id="git-identity-base-url"
              value={baseUrl}
              placeholder={provider === 'gitlab' ? 'https://gitlab.example.com' : 'https://github.example.com'}
              aria-invalid={errors.base_url !== undefined}
              onChange={event => setBaseUrl(event.target.value)}
            />
            <p className={cn('text-xs', errors.base_url ? 'text-danger-fg' : 'text-text-secondary')}>
              {errors.base_url ?? 'A login there is a different identity from one on the public site.'}
            </p>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={claim.isPending || value.trim() === ''}>
            {claim.isPending ? 'Adding…' : kind === 'login' ? 'Add login' : 'Send verification link'}
          </Button>
          {selfHosted ? null : (
            <button
              type="button"
              className="text-xs text-text-secondary hover:text-text hover:underline"
              onClick={() => setSelfHosted(true)}
            >
              On a self-hosted {providerLabel(provider)}?
            </button>
          )}
        </div>
      </form>
    </SettingsSection>
  );
}

function IdentitiesSkeleton() {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading identities">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-3 px-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
