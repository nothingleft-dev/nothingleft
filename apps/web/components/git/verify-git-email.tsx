'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useSearchParams } from 'next/navigation';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { AuthHeading, FinePrint } from '@components/auth/auth-card';
import { FormAlert } from '@components/auth/form-alert';
import { useConfirmGitIdentity } from '@hooks/use-git';
import { isApiError } from '@lib/api/errors';
import { providerLabel } from '@lib/git/words';

const SETTINGS = '/settings?tab=git' as Route;

const TITLES: Record<string, string> = {
  'auth.token_expired': 'This link has expired',
  'git.identity_taken': 'Someone else already added this address',
};

/** The target of the link sent to a claimed commit email; it needs no session, only the token. */
export function VerifyGitEmail() {
  const token = useSearchParams().get('token');
  const confirm = useConfirmGitIdentity();

  // The token is spent on first use; strict mode would otherwise spend it twice.
  const submitted = useRef<string | null>(null);
  useEffect(() => {
    if (!token || submitted.current === token) return;
    submitted.current = token;
    confirm.mutate(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token || confirm.isError) {
    const code = isApiError(confirm.error) ? confirm.error.code : null;
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading
          title={(code && TITLES[code]) ?? 'This link does not work'}
          lede={
            code === 'git.identity_taken'
              ? 'An address counts for one account only. If it is yours, ask whoever added it to remove it.'
              : 'It may have been copied only in part, used already, or it comes from an older email.'
          }
        />
        {confirm.error ? (
          <FormAlert
            title={
              isApiError(confirm.error)
                ? confirm.error.message
                : 'The server could not be reached. Nothing was changed; open the link again.'
            }
          />
        ) : null}
        <FinePrint>
          Send a new link from <Link href={SETTINGS}>Account settings → Git identities</Link>: add the address again and
          its row offers Send again.
        </FinePrint>
      </div>
    );
  }

  if (confirm.isPending || confirm.isIdle) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title="Verifying the address" lede="One moment — confirming the link you opened." />
        <div className="flex flex-col gap-3 rounded-md border bg-surface p-4" role="status" aria-label="Verifying">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  }

  const identity = confirm.data;
  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        title="Address verified"
        lede={`Commits written as ${identity.email ?? 'this address'} on ${providerLabel(identity.provider)} now show under your name, including the ones already linked.`}
      />
      <Button asChild className="w-full">
        <Link href={SETTINGS}>Open your git identities</Link>
      </Button>
      <FinePrint>Used for attribution only. It never signs you in.</FinePrint>
    </div>
  );
}
