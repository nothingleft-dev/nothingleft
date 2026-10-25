'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { PageHeader } from '@components/page-header';
import { FormAlert } from '@components/auth/form-alert';
import { useFinishGitHubConnect } from '@hooks/use-git';
import { isApiError } from '@lib/api/errors';

const INTEGRATIONS = '/organization?tab=integrations' as Route;

const TITLES: Record<string, string> = {
  'git.connect_state_invalid': 'This connection attempt expired.',
  'git.installation_forbidden': 'You cannot connect that installation.',
  'git.connection_limit_reached': 'This organisation has all the connections its plan allows.',
};

/** Where GitHub returns after the app is installed: turns the installation into a connection. */
export function GitHubCallback() {
  const router = useRouter();
  const client = useQueryClient();
  const params = useSearchParams();
  const finish = useFinishGitHubConnect();
  const installation = params.get('installation_id');
  const state = params.get('state');
  const code = params.get('code');
  const setupAction = params.get('setup_action');
  // An owner of the GitHub organisation has to approve a member's install request first.
  const requested = setupAction === 'request' && !installation;

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !installation || !state || !code) return;
    sent.current = true;
    finish.mutate(
      { installation_id: installation, state, code, ...(setupAction ? { setup_action: setupAction } : {}) },
      {
        onSuccess: connection => {
          void client.invalidateQueries({ queryKey: ['organizations'] });
          toast.success(`${connection.account.login} on GitHub is connected.`);
          router.replace(INTEGRATIONS);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installation, state, code]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link href={INTEGRATIONS}>Back to Integrations</Link>
    </Button>
  );

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title="Connecting GitHub" />
      {requested ? (
        <FormAlert tone="warning" title="GitHub sent the request to an owner of that organisation.">
          Once they approve the installation, connect again from Integrations and it is picked up.
        </FormAlert>
      ) : !installation || !state || !code ? (
        <FormAlert title="GitHub did not send back what this page needs.">
          The address is incomplete. Start again from Integrations with Connect GitHub.
        </FormAlert>
      ) : finish.isError ? (
        <FormAlert title={(isApiError(finish.error) && TITLES[finish.error.code]) || 'GitHub could not be connected.'}>
          {finish.error.message}
        </FormAlert>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border p-4" role="status" aria-label="Connecting">
          <p className="text-sm text-text-secondary">Reading the installation and the repositories it may see…</p>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {requested || !installation || !state || !code || finish.isError ? <div>{back}</div> : null}
    </div>
  );
}
