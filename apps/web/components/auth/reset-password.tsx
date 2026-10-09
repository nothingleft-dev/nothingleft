'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { RequestPasswordResetSchema, ResetPasswordSchema } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { AuthHeading, FinePrint, Swap, TextLink } from '@components/auth/auth-card';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PasswordStrength } from '@components/auth/password-strength';
import { useAuthForm } from '@components/auth/use-auth-form';
import { requestPasswordReset, resetPassword } from '@lib/api/auth';

export function ResetPassword() {
  const token = useSearchParams().get('token');
  return token ? <ChooseNewPassword token={token} /> : <RequestLink />;
}

function RequestLink() {
  const form = useAuthForm({
    schema: RequestPasswordResetSchema,
    initial: { email: '' },
    messages: { email: 'Enter the email address on your account.' },
    submit: values => requestPasswordReset(values.email),
  });

  if (form.isSuccess) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading
          title="Check your inbox"
          lede={`If ${form.values.email} has an account, a reset link is on its way. It arrives within a minute.`}
        />
        <FinePrint>
          We say the same thing either way, so this page can never be used to find out who has an account here.
        </FinePrint>
        <Swap>
          <TextLink href="/sign-in">Back to sign in</TextLink>
        </Swap>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        title="Reset your password"
        lede="We'll email a single-use link. It works for one hour, and using it signs you out everywhere."
      />

      {form.summary ? <FormAlert title={form.summary} /> : null}

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
        <Button type="submit" disabled={form.isPending} className="mt-1 w-full">
          {form.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <Swap>
        Remembered it? <TextLink href="/sign-in">Back to sign in</TextLink>
      </Swap>
    </div>
  );
}

function ChooseNewPassword({ token }: { token: string }) {
  const router = useRouter();
  const form = useAuthForm({
    schema: ResetPasswordSchema,
    initial: { token, password: '' },
    messages: { password: 'Passwords need at least 8 characters.', token: 'That link is not valid.' },
    submit: values => resetPassword(values),
    onSuccess: () => router.replace('/sign-in'),
  });

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        title="Choose a new password"
        lede="This link works once. Saving signs you out on every other device."
      />

      {form.summary ? (
        <FormAlert title={form.summary}>
          Reset links last one hour and work once. <TextLink href="/reset-password">Request a new one</TextLink>.
        </FormAlert>
      ) : null}

      <form noValidate className="flex flex-col gap-4" onSubmit={form.onSubmit}>
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          placeholder="Three or four unrelated words"
          value={form.values.password}
          error={form.errors.password}
          below={<PasswordStrength value={form.values.password} />}
          onChange={e => form.set('password', e.target.value)}
        />
        <Button type="submit" disabled={form.isPending} className="mt-1 w-full">
          {form.isPending ? 'Saving…' : 'Save and sign in'}
        </Button>
      </form>
    </div>
  );
}
