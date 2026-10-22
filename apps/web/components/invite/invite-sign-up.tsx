'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SignUpSchema, type InvitationPreview, type Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PasswordStrength } from '@components/auth/password-strength';
import { ProviderButtons } from '@components/auth/provider-buttons';
import { TextLink } from '@components/auth/auth-card';
import { useAuthForm } from '@components/auth/use-auth-form';
import { StepPanel } from '@components/onboarding/step-panel';
import { InvitationCard } from '@components/invite/invitation-card';
import { rememberInviteIntent } from '@components/invite/invite-intent';
import { trackAuthConversion } from '@lib/analytics/google-analytics';
import { signUp } from '@lib/api/auth';
import { viewerTimeZone } from '@lib/datetime';
import { queryKeys } from '@lib/query/keys';

interface InviteSignUpProps {
  token: string;
  preview: InvitationPreview;
  stepCount: number;
  onSignedUp: () => void;
}

export function InviteSignUp({ token, preview, stepCount, onSignedUp }: InviteSignUpProps) {
  const router = useRouter();
  const client = useQueryClient();
  // An email invitation already proves the address, so it is fixed and marked verified.
  const fixedEmail = preview.kind === 'email' ? preview.email : null;

  const form = useAuthForm({
    schema: SignUpSchema,
    initial: { name: '', email: fixedEmail ?? '', password: '', invitation_token: token },
    messages: {
      name: 'Tell us what to call you.',
      email: 'Enter a valid email address — this is where your verification link goes.',
      password: 'Passwords need at least 8 characters.',
    },
    submit: values => signUp({ ...values, timezone: viewerTimeZone() }).then(r => r.data),
    onSuccess: (me: Me) => {
      trackAuthConversion('sign_up', 'email');
      client.setQueryData(queryKeys.me(), me);
      // The flow continues on this page, so only the router's signed-out prefetches are dropped.
      router.refresh();
      onSignedUp();
    },
  });

  return (
    <StepPanel
      eyebrow={`Step 1 of ${stepCount}`}
      title={`Join ${preview.organization.name}`}
      lede="Create an account to accept your invitation."
      footer={
        <p className="text-xs text-text-secondary">
          Already have an account?{' '}
          <TextLink href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in</TextLink> and we will ask
          you to accept.
        </p>
      }
    >
      <InvitationCard preview={preview} />

      <ProviderButtons verb="sign up" next={`/invite/${token}`} />

      {form.summary ? <FormAlert title={form.summary} /> : null}

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={event => {
          rememberInviteIntent(token);
          form.onSubmit(event);
        }}
      >
        <Field
          label="Full name"
          autoComplete="name"
          autoFocus
          placeholder="Jordan Rivera"
          value={form.values.name}
          error={form.errors.name}
          onChange={e => form.set('name', e.target.value)}
        />

        {fixedEmail ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Email</span>
            <div className="flex h-control items-center gap-2 rounded-md border bg-inset px-3 text-text-secondary">
              <span className="min-w-0 flex-1 truncate">{fixedEmail}</span>
              <span
                className="flex items-center gap-1 text-2xs text-success-fg"
                title="The invitation was sent to this address, so it counts as proven"
              >
                <Check className="size-3" strokeWidth={3} /> verified
              </span>
            </div>
            <p className="text-xs text-text-muted">
              This invitation was sent to this address, so your account starts confirmed.
            </p>
          </div>
        ) : (
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
        )}

        <Field
          label="Choose a password"
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

        <Button type="submit" disabled={form.isPending} className="mt-1">
          {form.isPending ? 'Creating your account…' : `Join ${preview.organization.name}`}
        </Button>
      </form>
    </StepPanel>
  );
}
