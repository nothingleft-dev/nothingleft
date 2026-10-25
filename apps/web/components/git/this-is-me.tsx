'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { GitAuthor, GitProviderKind } from '@nothingleft/types';
import { useClaimGitIdentity } from '@hooks/use-git';
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { providerLabel } from '@lib/git/words';

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

/**
 * An unmatched author whose login reads like the viewer's own name or username: offered to the
 * viewer once, as a claim of that login. Dismissing it is remembered in this browser.
 */
export function ThisIsMe({ author, provider }: { author: GitAuthor; provider: GitProviderKind }) {
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const organization = useOrganization(user?.current_organization_slug ?? null);
  const claim = useClaimGitIdentity();
  const id = `${provider}:${author.login?.toLowerCase() ?? ''}`;
  const [hidden, setHidden] = useState(() => typeof window === 'undefined' || readDismissed().includes(id));

  const username = organization.data?.membership.username ?? null;
  const login = author.login;
  const plausible =
    login !== null &&
    user !== null &&
    (loose(login) === loose(user.name) || (username !== null && loose(login) === loose(username)));
  if (author.member || !plausible || hidden) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-inset pr-0.5 pl-1.5 text-2xs text-text-secondary">
      <button
        type="button"
        className="font-medium text-text hover:underline"
        disabled={claim.isPending}
        onClick={() =>
          claim.mutate(
            { provider, login: login! },
            {
              onSuccess: () => {
                toast.success(`@${login} on ${providerLabel(provider)} is now yours. Its work shows under your name.`);
                setHidden(true);
              },
              onError: error => toast.error(error.message),
            },
          )
        }
      >
        This is me
      </button>
      <button
        type="button"
        aria-label="Not me"
        className="grid size-4 place-items-center rounded-xs text-text-muted hover:bg-hover hover:text-text"
        onClick={() => {
          dismiss(id);
          setHidden(true);
        }}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
