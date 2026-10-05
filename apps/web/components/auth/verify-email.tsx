'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@components/ui/button';
import { AuthHeading, FinePrint, Swap, TextLink } from '@components/auth/auth-card';
import { FormAlert } from '@components/auth/form-alert';
import { Skeleton } from '@components/ui/skeleton';
import { safeNextPath } from '@components/auth/next-path';
import { confirmEmailChange, resendVerification, verifyEmail } from '@lib/api/auth';
import { isApiError } from '@lib/api/errors';

const RESEND_COOLDOWN_SECONDS = 30;

const messageOf = (error: unknown) =>
  isApiError(error) ? error.message : error instanceof Error ? error.message : 'Something went wrong. Try again.';

/**
 * One screen, two jobs: the landing after sign-up ("check your inbox") and the target of
 * the link itself. A token issued for an email change is confirmed by a different
 * endpoint, so an unknown token is retried there before it is called invalid.
 */
export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get('token');
  // A share-link sign-up must verify before it can join, so the verification email
  // carries `next=/invite/<token>` and the flow resumes where it left off.
  const next = safeNextPath(params.get('next')) as Route;

  const confirm = useMutation({
    mutationFn: async (value: string) => {
      try {
        return await verifyEmail(value);
      } catch (error) {
        if (isApiError(error) && error.code === 'auth.invalid_token') return confirmEmailChange(value);
        throw error;
      }
    },
  });

  // One-time tokens are consumed on first use, and React's strict mode runs effects
  // twice in development — without this guard the second run spends a token the first
  // already succeeded with, and the page reports a valid link as invalid.
  const submitted = useRef<string | null>(null);
  useEffect(() => {
    if (!token || submitted.current === token) return;
    submitted.current = token;
    confirm.mutate(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return <CheckYourInbox address={params.get('sent')} next={next} />;

  if (confirm.isPending || confirm.isIdle) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title="Verifying your email" lede="One moment — confirming the link you opened." />
        <div className="flex flex-col gap-3 rounded-md border bg-surface p-4" role="status" aria-label="Verifying">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  }

  if (confirm.isSuccess) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title="Email verified" lede="That address is confirmed. You can invite people and be invited." />
        <Button asChild className="w-full">
          <Link href={next}>Continue</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="That link did not work" lede="Verification links last 24 hours and work once." />
      <FormAlert title={messageOf(confirm.error)}>
        If you already opened this link, your address is verified and there is nothing left to do. Otherwise, sign in
        and send a fresh one from account settings.
      </FormAlert>
      <div className="flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href={next}>Continue</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}

function CheckYourInbox({ address, next }: { address: string | null; next: Route }) {
  // A message was sent moments ago to get here, so the cooldown starts spent rather than
  // offering a resend the user has no reason to want yet.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
  });

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const waiting = cooldown > 0 || resend.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <span className="grid size-10 place-items-center rounded-md border bg-surface text-text-secondary">
          <MailCheck className="size-icon" />
        </span>
        <AuthHeading
          title="Check your inbox"
          lede={
            address
              ? `We sent a verification link to ${address}. It works for 24 hours.`
              : 'We sent you a verification link. It works for 24 hours.'
          }
        />
      </div>

      {resend.isError ? <FormAlert title={messageOf(resend.error)} /> : null}
      {resend.isSuccess && cooldown > 0 ? (
        <FormAlert tone="success" title="Sent again. Give it a minute to arrive." />
      ) : null}

      <Button asChild className="w-full">
        <Link href={next}>Continue to Nothing Left</Link>
      </Button>

      <div className="flex items-baseline justify-between gap-3 border-t pt-4">
        <span className="text-xs text-text-secondary">Nothing arrived?</span>
        {waiting ? (
          <span className="text-xs text-text-muted">
            Resend in <span className="font-mono tabular">{cooldown}s</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => resend.mutate()}
            className="text-xs font-medium text-text underline-offset-4 hover:underline"
          >
            Resend email
          </button>
        )}
      </div>

      <FinePrint>
        You can review your profile while you wait. Confirm your email before creating or joining an organisation.
      </FinePrint>

      <Swap>
        Wrong address? <TextLink href="/settings?tab=security">Change it in settings</TextLink>
      </Swap>
    </div>
  );
}
