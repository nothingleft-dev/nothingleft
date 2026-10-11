'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OAuthProviderSchema, type OAuthNotice, type OAuthProvider, type OAuthSignIn } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { AuthHeading } from '@components/auth/auth-card';
import { FormAlert } from '@components/auth/form-alert';
import { takeOAuthNext } from '@components/auth/next-path';
import { completeOAuth } from '@lib/api/auth';
import { isApiError } from '@lib/api/errors';
import { queryKeys } from '@lib/query/keys';
import { formatDate, viewerTimeZone } from '@lib/datetime';
import { trackAuthConversion } from '@lib/analytics/google-analytics';

const LABELS: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub' };

export function OAuthCallback({ provider: raw }: { provider: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const params = useSearchParams();
  const parsed = OAuthProviderSchema.safeParse(raw);
  const provider = parsed.success ? parsed.data : null;
  const code = params.get('code');
  const state = params.get('state');
  const denied = params.get('error');
  const [notice, setNotice] = useState<{ notice: OAuthNotice; next: string } | null>(null);

  const complete = useMutation({
    mutationFn: (input: { provider: OAuthProvider; code: string; state: string }) =>
      completeOAuth(input.provider, { code: input.code, state: input.state, timezone: viewerTimeZone() }).then(
        r => r.data,
      ),
    onSuccess: ({ me, created, notice }: OAuthSignIn, input) => {
      trackAuthConversion(created ? 'sign_up' : 'login', input.provider);
      client.setQueryData(queryKeys.me(), me);
      const next = takeOAuthNext();
      // The notice is explained here, once, before moving on; it is not stored anywhere.
      if (notice) setNotice({ notice, next });
      else router.replace(next as Route);
    },
  });

  // The code and state are single-use; strict mode's second effect run must not spend them again.
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current || !provider || !code || !state || denied) return;
    submitted.current = true;
    complete.mutate({ provider, code, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, code, state, denied]);

  const label = provider ? LABELS[provider] : 'The provider';

  if (denied) {
    return (
      <Failed
        title="Sign-in cancelled"
        lede={`${label} did not share your account, so nothing was created.`}
        alert={denied === 'access_denied' ? null : `${label} reported: ${denied}`}
      />
    );
  }

  if (!provider || !code || !state) {
    return (
      <Failed
        title="That link did not work"
        lede="This page is where Google or GitHub send you back after signing in. Start again from the sign-in page."
      />
    );
  }

  if (notice) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading
          title="We found an earlier account"
          lede={`An account for this address was created on ${formatDate(notice.notice.account_created_at)}, but the address was never confirmed.`}
        />
        <FormAlert tone="success" title={`${label} confirmed the address, so you are signed in to that account.`}>
          Nothing in it was deleted. Its password was removed and its other sessions were signed out, because nobody had
          proven they own this address. We emailed you the same explanation.
        </FormAlert>
        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={() => router.replace(notice.next as Route)}>
            Continue
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/settings?tab=security">Set a new password</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (complete.isError) {
    return (
      <Failed
        title="Sign-in did not finish"
        lede={`${label} signed you in, but Nothing Left could not complete it.`}
        alert={isApiError(complete.error) ? complete.error.message : 'Could not reach the server. Try again.'}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title={`Signing you in with ${label}`} lede="One moment — finishing the handshake." />
      <div className="flex flex-col gap-3 rounded-md border bg-surface p-4" role="status" aria-label="Signing in">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

function Failed({ title, lede, alert }: { title: string; lede: string; alert?: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title={title} lede={lede} />
      {alert ? <FormAlert title={alert} /> : null}
      <div className="flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-up">Create an account with email</Link>
        </Button>
      </div>
    </div>
  );
}
