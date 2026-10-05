'use client';

import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { OAuthProvider } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { rememberOAuthNext } from '@components/auth/next-path';
import { startOAuth } from '@lib/api/auth';
import { isApiError } from '@lib/api/errors';

// Glyphs in currentColor, never the providers' brand colours - design system § 8c.
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-icon-sm">
      <path d="M12 11v3.2h5.3a4.6 4.6 0 0 1-2 3l3.2 2.5A9 9 0 0 0 21 12c0-.6-.06-1.2-.16-1.8H12Z" />
      <path d="M6.7 14.3a5.4 5.4 0 0 1 0-3.4L3.4 8.3a9 9 0 0 0 0 8l3.3-2Z" opacity=".55" />
      <path d="M12 6.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 3.4 8.3l3.3 2.6A5.4 5.4 0 0 1 12 6.6Z" opacity=".8" />
      <path
        d="M12 21a9 9 0 0 0 6.5-2.4l-3.2-2.5c-.9.6-2 .9-3.3.9a5.4 5.4 0 0 1-5.3-3.7l-3.3 2A9 9 0 0 0 12 21Z"
        opacity=".7"
      />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-icon-sm">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

const PROVIDERS: { id: OAuthProvider; label: string; glyph: ReactNode }[] = [
  { id: 'google', label: 'Google', glyph: <GoogleGlyph /> },
  { id: 'github', label: 'GitHub', glyph: <GithubGlyph /> },
];

function useStartOAuth(next: string | null) {
  return useMutation({
    mutationFn: (provider: OAuthProvider) => startOAuth(provider).then(r => r.data),
    onSuccess: ({ authorize_url }) => {
      rememberOAuthNext(next);
      window.location.assign(authorize_url);
    },
  });
}

export function ProviderButtons({ verb, next: override }: { verb: string; next?: string }) {
  const fromUrl = useSearchParams().get('next');
  // The invite pages know where the round trip has to come back to; nothing puts it in the URL.
  const next = override ?? fromUrl;
  const start = useStartOAuth(next);
  // Success is a full navigation away, so the buttons stay disabled until the page unloads.
  const leaving = start.isPending || start.isSuccess;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map(provider => (
          <Button
            key={provider.id}
            variant="outline"
            className="w-full"
            type="button"
            disabled={leaving}
            onClick={() => start.mutate(provider.id)}
          >
            {provider.glyph}
            {leaving && start.variables === provider.id ? 'Redirecting…' : provider.label}
          </Button>
        ))}
      </div>

      {start.isError ? (
        <FormAlert title={isApiError(start.error) ? start.error.message : 'Could not reach the server. Try again.'} />
      ) : null}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-2xs text-text-muted">or {verb} with email</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

/** Signs in again with the providers an account already uses, then comes back to `next`. */
export function ReauthButtons({ providers, next }: { providers: readonly OAuthProvider[]; next: string }) {
  const start = useStartOAuth(next);
  const leaving = start.isPending || start.isSuccess;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.filter(p => providers.includes(p.id)).map(provider => (
          <Button
            key={provider.id}
            variant="outline"
            type="button"
            disabled={leaving}
            onClick={() => start.mutate(provider.id)}
          >
            {provider.glyph}
            {leaving && start.variables === provider.id ? 'Redirecting…' : `Sign in with ${provider.label} again`}
          </Button>
        ))}
      </div>
      {start.isError ? (
        <FormAlert title={isApiError(start.error) ? start.error.message : 'Could not reach the server. Try again.'} />
      ) : null}
    </div>
  );
}
