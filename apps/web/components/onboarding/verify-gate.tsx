'use client';

import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { resendVerification } from '@lib/api/auth';
import { isApiError } from '@lib/api/errors';
import { queryKeys } from '@lib/query/keys';

const RESEND_COOLDOWN_SECONDS = 30;

/** A password account cannot create or join an organisation until it verifies — auth-and-tenancy.md § Flows. */
export const needsVerification = (user: Me) => user.email_verified_at === null;

export function VerifyGate({ user, reason }: { user: Me; reason?: string }) {
  const client = useQueryClient();
  const [cooldown, setCooldown] = useState(0);
  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
  });

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // The link is opened in another tab, so this page has to be told to look again.
  const recheck = useMutation({ mutationFn: () => client.invalidateQueries({ queryKey: queryKeys.me() }) });

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-surface p-4">
      <div className="flex gap-3">
        <span className="grid size-9 flex-none place-items-center rounded-md border bg-app text-text-secondary">
          <MailCheck className="size-icon" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">Confirm your email first</p>
          <p className="text-sm leading-6 text-text-secondary">
            We sent a link to <span className="text-text-secondary">{user.email}</span>. It works for 24 hours.{' '}
            {reason ?? 'Confirm your email to create your organisation.'}
          </p>
        </div>
      </div>

      {resend.isError ? (
        <FormAlert
          title={isApiError(resend.error) ? resend.error.message : 'The email could not be sent. Try again.'}
        />
      ) : null}
      {resend.isSuccess && cooldown > 0 ? <FormAlert tone="success" title="Sent again. Give it a minute." /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={recheck.isPending} onClick={() => recheck.mutate()}>
          {recheck.isPending ? 'Checking…' : 'Check verification'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cooldown > 0 || resend.isPending}
          onClick={() => resend.mutate()}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
        </Button>
      </div>
    </div>
  );
}
