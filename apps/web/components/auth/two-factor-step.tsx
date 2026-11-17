'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Me, TwoFactorChallenge, TwoFactorSignIn } from '@nothingleft/types';
import { AlertLink, INLINE_LINK, AuthHeading } from '@components/auth/auth-card';
import { CODE_LENGTH, CodeInput } from '@components/auth/code-input';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { signInWithTwoFactor } from '@lib/api/auth';
import { isApiError, isRateLimited } from '@lib/api/errors';
import { PendingButton } from '@components/pending-button';
import { RateLimitWait } from '@components/rate-limit';
import { useRateLimit } from '@hooks/use-rate-limit';

// The API's own sentence for two_factor.challenge_expired, for when the clock runs out before
// anything is sent.
export const CHALLENGE_EXPIRED = 'That sign-in has expired. Enter your email and password again.';

interface TwoFactorStepProps {
  challenge: TwoFactorChallenge;
  onSignedIn: (me: Me) => void;
  onExpired: (message: string) => void;
}

export function TwoFactorStep({ challenge, onSignedIn, onExpired }: TwoFactorStepProps) {
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [missing, setMissing] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: (body: TwoFactorSignIn) => signInWithTwoFactor(body).then(r => r.data),
    meta: { rateLimit: 'inline' },
    onSuccess: onSignedIn,
    onError: error => {
      if (isApiError(error) && error.code === 'two_factor.challenge_expired') onExpired(error.message);
      if (mode === 'code') setCode('');
    },
  });

  useEffect(() => {
    const left = new Date(challenge.expires_at).getTime() - Date.now();
    const timer = window.setTimeout(() => onExpired(CHALLENGE_EXPIRED), Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [challenge.expires_at, onExpired]);

  const { secondsLeft } = useRateLimit();
  const error = verify.error;
  const locked = isApiError(error) && error.code === 'auth.account_locked';
  const limited = isRateLimited(error);
  const waiting = limited && secondsLeft > 0;
  const message =
    missing ??
    (error && !locked && !limited
      ? isApiError(error)
        ? error.message
        : 'The server could not be reached. Try again.'
      : undefined);

  const submitCode = (value: string) => {
    if (value.length < CODE_LENGTH) return setMissing(`Enter all ${CODE_LENGTH} digits of the code.`);
    setMissing(null);
    verify.mutate({ code: value });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'code') return submitCode(code);
    if (recovery.trim() === '') return setMissing('Enter one of your recovery codes.');
    setMissing(null);
    verify.mutate({ recovery_code: recovery });
  };

  const switchTo = (next: 'code' | 'recovery') => {
    setMode(next);
    setMissing(null);
    verify.reset();
  };

  return (
    <div className="flex flex-col gap-6">
      {mode === 'code' ? (
        <AuthHeading
          title="Two-factor code"
          lede="Open your authenticator app and enter the 6-digit code for Nothing Left."
        />
      ) : (
        <AuthHeading
          title="Use a recovery code"
          lede="Enter one of the ten codes you saved when you turned on two-factor. Each one works once."
        />
      )}

      {locked ? (
        <FormAlert title={error.message}>
          Wait, then <AlertLink href="/sign-in">sign in again</AlertLink> with your password.
        </FormAlert>
      ) : null}
      {limited ? (
        <FormAlert title="Too many attempts.">
          <RateLimitWait />
        </FormAlert>
      ) : null}

      <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
        {mode === 'code' ? (
          <CodeInput
            label="Two-factor code"
            autoFocus
            value={code}
            disabled={verify.isPending || locked || waiting}
            error={message}
            onChange={value => {
              setCode(value);
              setMissing(null);
            }}
            onComplete={submitCode}
          />
        ) : (
          <Field
            label="Recovery code"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="xxxxx-xxxxx"
            className="font-mono"
            hint="Spaces, dashes and capitals do not matter."
            value={recovery}
            disabled={verify.isPending || locked || waiting}
            error={message}
            onChange={event => {
              setRecovery(event.target.value);
              setMissing(null);
            }}
          />
        )}
        <PendingButton
          type="submit"
          disabled={locked || waiting}
          className="mt-1 w-full"
          pending={verify.isPending}
          pendingLabel="Verifying…"
        >
          Verify
        </PendingButton>
      </form>

      <p className="text-sm text-text-secondary">
        {mode === 'code' ? 'Lost your phone? ' : 'Have your phone? '}
        <button type="button" onClick={() => switchTo(mode === 'code' ? 'recovery' : 'code')} className={INLINE_LINK}>
          {mode === 'code' ? 'Use a recovery code' : 'Use your authenticator app'}
        </button>
      </p>
    </div>
  );
}
