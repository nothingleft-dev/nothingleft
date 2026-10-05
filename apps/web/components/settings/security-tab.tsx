'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { Me, OAuthProvider } from '@nothingleft/types';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@components/ui/button';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PasswordStrength } from '@components/auth/password-strength';
import { useApiError } from '@hooks/use-api-error';
import { SettingsSection } from '@components/settings/section';
import { DeactivateSection } from '@components/settings/deactivate-section';
import { TwoFactorSection, type SecurityConfirm } from '@components/settings/two-factor-section';
import { changePassword, requestEmailChange, requestPasswordReset } from '@lib/api/auth';
import { needsVerification } from '@components/onboarding/verify-gate';
import { VerifyEmailNotice } from '@components/settings/verify-email-notice';

const PROVIDER_LABELS: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub' };
const providerList = (user: Me) => user.linked_providers.map(p => PROVIDER_LABELS[p]).join(' and ');

const CONFIRMS: readonly SecurityConfirm[] = ['disable-two-factor', 'recovery-codes', 'deactivate'];

export function SecurityTab({ user }: { user: Me }) {
  const router = useRouter();
  // Set by the return from a provider sign-in, so the dialog that asked for it opens again.
  const requested = useSearchParams().get('confirm');
  const confirm = CONFIRMS.find(c => c === requested) ?? null;
  const handled = () => {
    if (confirm) router.replace('/settings?tab=security');
  };

  return (
    <div className="flex flex-col gap-5">
      <EmailSection user={user} />
      {user.has_password ? <PasswordSection /> : <SetPasswordSection user={user} />}
      <TwoFactorSection user={user} confirm={confirm} onConfirmHandled={handled} />
      <DeactivateSection user={user} reopen={confirm === 'deactivate'} onReopened={handled} />
    </div>
  );
}

function EmailSection({ user }: { user: Me }) {
  const [form, setForm] = useState({ current_password: '', email: '' });
  const change = useMutation({
    mutationFn: requestEmailChange,
    onSuccess: () => {
      setForm({ current_password: '', email: '' });
      toast.success('Confirm the new address from the email we just sent.');
    },
  });
  const error = useApiError(change.error);
  const unverified = needsVerification(user);

  return (
    <SettingsSection
      title="Email address"
      description={
        user.has_password
          ? 'Changing it needs your password, and the new address has to be confirmed before it takes effect.'
          : `Verified by ${providerList(user)}. Changing it needs a password - set one below first.`
      }
      actions={<span className="font-mono tabular text-xs text-text-secondary">{user.email}</span>}
    >
      <div className="flex flex-col gap-3">
        {unverified ? (
          <VerifyEmailNotice title="Verify your email address to invite people, be invited, create access tokens or change it." />
        ) : null}

        {error.summary ? <FormAlert title={error.summary} /> : null}
        {user.has_password ? (
          <form
            noValidate
            className="flex max-w-sm flex-col gap-3"
            onSubmit={event => {
              event.preventDefault();
              change.mutate(form);
            }}
          >
            <Field
              label="New email"
              type="email"
              autoComplete="email"
              value={form.email}
              disabled={unverified}
              error={error.fields['email']}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
            <Field
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={form.current_password}
              disabled={unverified}
              error={error.fields['current_password']}
              onChange={e => setForm({ ...form, current_password: e.target.value })}
            />
            <Button type="submit" disabled={unverified || change.isPending} className="self-start">
              {change.isPending ? 'Sending…' : 'Send confirmation'}
            </Button>
          </form>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function PasswordSection() {
  const [form, setForm] = useState({ current_password: '', password: '' });
  const change = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setForm({ current_password: '', password: '' });
      toast.success('Password changed. Every other session was signed out.');
    },
  });
  const error = useApiError(change.error);

  return (
    <SettingsSection
      title="Password"
      description="Changing it signs out every other session and emails you a confirmation."
    >
      {error.summary ? <FormAlert title={error.summary} /> : null}
      <form
        noValidate
        className="flex max-w-sm flex-col gap-3"
        onSubmit={event => {
          event.preventDefault();
          change.mutate(form);
        }}
      >
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={form.current_password}
          error={error.fields['current_password']}
          onChange={e => setForm({ ...form, current_password: e.target.value })}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          below={<PasswordStrength value={form.password} />}
          value={form.password}
          error={error.fields['password']}
          onChange={e => setForm({ ...form, password: e.target.value })}
        />
        <Button type="submit" disabled={change.isPending} className="self-start">
          {change.isPending ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </SettingsSection>
  );
}

// A provider-only account has no current password to type, so it gets a password the way a
// forgotten one is replaced: a single-use link to the address the provider already verified.
function SetPasswordSection({ user }: { user: Me }) {
  const send = useMutation({
    mutationFn: () => requestPasswordReset(user.email),
    onSuccess: () => toast.success(`We sent a link to ${user.email}.`),
  });
  const error = useApiError(send.error);

  return (
    <SettingsSection
      title="Password"
      description={`You sign in with ${providerList(user)}. Set a password to sign in with your email as well.`}
    >
      {error.summary ? <FormAlert title={error.summary} /> : null}
      <Button
        variant="outline"
        disabled={send.isPending || send.isSuccess}
        className="self-start"
        onClick={() => send.mutate()}
      >
        {send.isPending ? 'Sending…' : send.isSuccess ? 'Link sent' : 'Email me a link to set one'}
      </Button>
    </SettingsSection>
  );
}
