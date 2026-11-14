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
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { Segmented } from '@components/segmented';
import { SettingsSection } from '@components/settings/section';
import { SettingsList, SettingsListRow, SettingsListSkeleton } from '@components/settings/settings-list';
import { TextButton } from '@components/text-button';
import { HueDot } from '@components/git/git-marks';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { useClaimGitIdentity, useMyGitIdentities, useRemoveMyGitIdentity } from '@hooks/use-git';
import { isApiError } from '@lib/api/errors';
import { providerLabel } from '@lib/git/words';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';

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
          <SettingsListSkeleton rows={2} label="Loading identities" trailing={['w-32', 'w-20', 'w-16']} />
        ) : identities.isError && !identities.data ? (
          <LoadError onRetry={() => void identities.refetch()} detail={errorDetail(identities.error)}>
            Your identities could not be loaded.
          </LoadError>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No identity added yet."
            description="Work signed with your verified account email already counts. Add a login, or another email your commits use, below."
          />
        ) : (
          <SettingsList>
            {rows.map(identity => (
              <IdentityRow key={identity.id} identity={identity} />
            ))}
          </SettingsList>
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
  const status = identity.pending ? (
    <span className="inline-flex items-center gap-1.5 text-warning-fg">
      <HueDot hue="amber" />
      Waiting for the link we sent
    </span>
  ) : (
    <span>{HOW[identity.verified_by]}</span>
  );

  return (
    <SettingsListRow>
      <ProviderGlyph provider={identity.provider} className="text-text-secondary" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-xs">{identity.login ? `@${identity.login}` : identity.email}</span>
        <span className="truncate text-xs text-text-secondary">
          {identity.login ? 'Login' : 'Commit email'} on {providerLabel(identity.provider)}
          {selfHosted ? ` at ${identity.base_url}` : ''}
        </span>
        <span className="text-xs text-text-secondary sm:hidden">{status}</span>
      </span>
      <span className="w-56 shrink-0 text-xs text-text-secondary max-sm:hidden">{status}</span>
      <RelativeTime
        value={identity.verified_at ?? identity.created_at}
        className="w-24 shrink-0 text-right text-xs text-text-secondary max-sm:hidden"
      />
      <span className="flex w-40 shrink-0 items-center justify-end gap-1 max-sm:w-auto max-sm:flex-col max-sm:items-end">
        {identity.pending ? (
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
                  onError: error => toastError('Could not send the verification link', error),
                },
              )
            }
          >
            Send again
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutateAsync(identity.id).then(
              () => toast.success(`${identity.login ? `@${identity.login}` : identity.email} is no longer yours.`),
              (error: Error) => toastError('Could not remove the identity', error),
            )
          }
        >
          Remove
        </Button>
      </span>
    </SettingsListRow>
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
            <span className="text-sm font-medium text-text-secondary">Type</span>
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
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="git-identity-value" className="text-sm font-medium text-text-secondary">
            {kind === 'login' ? 'Login' : 'Email'}
          </Label>
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
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="git-identity-base-url" className="text-sm font-medium text-text-secondary">
              Address of your {providerLabel(provider)}
            </Label>
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
          <PendingButton
            type="submit"
            size="sm"
            disabled={value.trim() === ''}
            pending={claim.isPending}
            pendingLabel="Adding…"
          >
            {kind === 'login' ? 'Add login' : 'Send verification link'}
          </PendingButton>
          {selfHosted ? null : (
            <TextButton className="text-xs font-normal" onClick={() => setSelfHosted(true)}>
              On a self-hosted {providerLabel(provider)}?
            </TextButton>
          )}
        </div>
      </form>
    </SettingsSection>
  );
}
