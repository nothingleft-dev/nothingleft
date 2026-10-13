'use client';

import type { Route } from 'next';
import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SignInSchema, type Me, type TwoFactorChallenge } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { AuthHeading, Swap, TextLink } from '@components/auth/auth-card';
import { ProviderButtons } from '@components/auth/provider-buttons';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { EmailUs } from '@components/email-us';
import { safeNextPath } from '@components/auth/next-path';
import { useAuthForm } from '@components/auth/use-auth-form';
import { TwoFactorStep } from '@components/auth/two-factor-step';
import { signIn } from '@lib/api/auth';
import { isApiError } from '@lib/api/errors';
import { queryKeys } from '@lib/query/keys';
import { viewerTimeZone } from '@lib/datetime';
import { trackAuthConversion } from '@lib/analytics/google-analytics';

export function SignInForm() {
  const router = useRouter();
  const client = useQueryClient();
  const params = useSearchParams();
  const next = params.get('next');
  const deactivated = params.get('deactivated') === '1';
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [expired, setExpired] = useState<string | null>(null);

  const finish = (me: Me) => {
    trackAuthConversion('login', 'email');
    client.setQueryData(queryKeys.me(), me);
    router.replace(safeNextPath(next) as Route);
  };

  const form = useAuthForm({
    schema: SignInSchema,
    initial: { email: '', password: '' },
    messages: {
      email: 'Enter the email address you signed up with.',
      password: 'Enter your password.',
    },
    // The device zone is exact and free; the server only falls back to edge headers.
    submit: values => signIn({ ...values, timezone: viewerTimeZone() }).then(r => r.data),
    onSuccess: (result: Me | TwoFactorChallenge) => {
      if ('two_factor_required' in result) {
        setExpired(null);
        setChallenge(result);
      } else finish(result);
    },
  });

  const setField = form.set;
  const onExpired = useCallback(
    (message: string) => {
      setChallenge(null);
      setExpired(message);
      setField('password', '');
    },
    [setField],
  );

  if (challenge) return <TwoFactorStep challenge={challenge} onSignedIn={finish} onExpired={onExpired} />;

  const code = isApiError(form.error) ? form.error.code : null;

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Sign in" lede="Welcome back. Use the email you signed up with." />

      <ProviderButtons verb="sign in" />

      {deactivated && !form.summary && !expired ? (
        <FormAlert tone="success" title="Your account is deactivated">
          You are signed out everywhere and your access tokens no longer work. To come back, <EmailUs /> from the
          address on the account.
        </FormAlert>
      ) : null}
      {expired && !form.summary ? <FormAlert title={expired} /> : null}

      {form.summary ? (
        <FormAlert title={form.summary}>
          {code === 'auth.account_deactivated' ? (
            <>
              To reactivate it, <EmailUs /> from the address on the account. Your memberships come back as they were.
            </>
          ) : code === 'auth.account_locked' ? (
            <>
              Wait, then try again - or <TextLink href="/reset-password">reset your password</TextLink>.
            </>
          ) : (
            <>
              Check both fields, or <TextLink href="/reset-password">reset your password</TextLink>. Five failed
              attempts pause sign-in for fifteen minutes.
            </>
          )}
        </FormAlert>
      ) : null}

      <form noValidate className="flex flex-col gap-4" onSubmit={form.onSubmit}>
        <Field
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          value={form.values.email}
          error={form.errors.email}
          onChange={e => form.set('email', e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          value={form.values.password}
          error={form.errors.password}
          trailing={
            <TextLink href="/reset-password" quiet className="text-xs">
              Forgot?
            </TextLink>
          }
          onChange={e => form.set('password', e.target.value)}
        />
        <Button type="submit" disabled={form.isPending} className="mt-1 w-full">
          {form.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <Swap>
        New here? <TextLink href="/sign-up">Create an account</TextLink>
      </Swap>
    </div>
  );
}
