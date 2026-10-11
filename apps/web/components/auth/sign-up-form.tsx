'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SignUpSchema, type Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { AuthHeading, ExternalLink, FinePrint, Swap, TextLink } from '@components/auth/auth-card';
import { ProviderButtons } from '@components/auth/provider-buttons';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PasswordStrength } from '@components/auth/password-strength';
import { useAuthForm } from '@components/auth/use-auth-form';
import { signUp } from '@lib/api/auth';
import { queryKeys } from '@lib/query/keys';
import { viewerTimeZone } from '@lib/datetime';
import { trackAuthConversion } from '@lib/analytics/google-analytics';

export function SignUpForm() {
  const router = useRouter();
  const client = useQueryClient();

  const form = useAuthForm({
    schema: SignUpSchema,
    initial: { name: '', email: '', password: '' },
    messages: {
      name: 'Tell us what to call you.',
      email: 'Enter a valid email address — this is where your verification link goes.',
      password: 'Passwords need at least 8 characters.',
    },
    submit: values => signUp({ ...values, timezone: viewerTimeZone() }).then(r => r.data),
    onSuccess: (me: Me) => {
      trackAuthConversion('sign_up', 'email');
      client.setQueryData(queryKeys.me(), me);
      // Path C starts at the profile step, which is also where the verification gate
      // lives — onboarding.md § Path C.
      router.replace('/welcome');
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Create your account" lede="Free for 20 people per organisation, forever. No card." />

      <ProviderButtons verb="sign up" />

      {form.summary ? <FormAlert title={form.summary} /> : null}

      <form noValidate className="flex flex-col gap-4" onSubmit={form.onSubmit}>
        <Field
          label="Full name"
          autoComplete="name"
          autoFocus
          placeholder="Jordan Rivera"
          value={form.values.name}
          error={form.errors.name}
          onChange={e => form.set('name', e.target.value)}
        />
        <Field
          label="Work email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={form.values.email}
          error={form.errors.email}
          onChange={e => form.set('email', e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="Three or four unrelated words"
          value={form.values.password}
          error={form.errors.password}
          below={
            <PasswordStrength
              value={form.values.password}
              context={{ name: form.values.name, email: form.values.email }}
            />
          }
          onChange={e => form.set('password', e.target.value)}
        />
        <Button type="submit" disabled={form.isPending} className="mt-1 w-full">
          {form.isPending ? 'Creating your account…' : 'Create account'}
        </Button>
        <FinePrint>
          By continuing you agree to the <ExternalLink href="https://nothingleft.dev/terms">terms</ExternalLink> &{' '}
          <ExternalLink href="https://nothingleft.dev/privacy">privacy policy</ExternalLink>. Until you opt in, we only
          email you about your account.
        </FinePrint>
      </form>

      <Swap>
        Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
      </Swap>
    </div>
  );
}
