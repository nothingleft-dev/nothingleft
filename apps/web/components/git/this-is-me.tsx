'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { GitAuthor, GitProviderKind } from '@nothingleft/types';
import { useClaimGitIdentity } from '@hooks/use-git';
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { providerLabel } from '@lib/git/words';
import { toastError } from '@components/toast-error';
import { TextButton } from '@components/text-button';
import { cn } from '@lib/utils';

const DISMISSED_KEY = 'nothingleft:git-this-is-me-dismissed';

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function dismiss(id: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed(), id]));
  } catch {
    // A blocked storage only means the offer comes back next time.
  }
}

const loose = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

const PUBLIC_HOSTS = new Set(['github.com', 'gitlab.com']);

// The claim must name the host the login lives on: a self-managed GitLab is its own identity.
function baseUrlOf(repositoryUrl: string): string | undefined {
  try {
    const url = new URL(repositoryUrl);
    return PUBLIC_HOSTS.has(url.hostname) ? undefined : url.origin;
  } catch {
    return undefined;
  }
}

/**
 * An unmatched author whose login reads like the viewer's own name or username: offered to the
 * viewer once, as a claim of that login. Dismissing it is remembered in this browser.
 */
export function ThisIsMe({
  author,
  provider,
  repositoryUrl,
  className,
}: {
  author: GitAuthor;
  provider: GitProviderKind;
  repositoryUrl: string;
  className?: string;
}) {
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const organization = useOrganization(user?.current_organization_slug ?? null);
  const claim = useClaimGitIdentity();
  const baseUrl = baseUrlOf(repositoryUrl);
  const id = `${provider}:${baseUrl ?? ''}:${author.login?.toLowerCase() ?? ''}`;
  const [hidden, setHidden] = useState(() => typeof window === 'undefined' || readDismissed().includes(id));

  const username = organization.data?.membership.username ?? null;
  const login = author.login;
  const plausible =
    login !== null &&
    user !== null &&
    (loose(login) === loose(user.name) || (username !== null && loose(login) === loose(username)));
  if (author.member || !plausible || hidden) return null;

  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary', className)}>
      <span>
        Is <span className="font-medium text-text">@{login}</span> on {providerLabel(provider)} you?
      </span>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <TextButton
          disabled={claim.isPending}
          onClick={() =>
            claim.mutate(
              { provider, login: login!, ...(baseUrl ? { base_url: baseUrl } : {}) },
              {
                onSuccess: () => {
                  toast.success(
                    `@${login} on ${providerLabel(provider)} is now yours. Its work shows under your name.`,
                  );
                  setHidden(true);
                },
                onError: error => toastError(`Could not claim @${login}`, error),
              },
            )
          }
        >
          This is me
        </TextButton>
        <span aria-hidden className="text-text-muted">
          ·
        </span>
        <TextButton
          onClick={() => {
            dismiss(id);
            setHidden(true);
          }}
        >
          Not me
        </TextButton>
      </span>
    </p>
  );
}
