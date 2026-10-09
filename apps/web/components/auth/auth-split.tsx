import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '@components/shell/brand';
import { ExternalLink } from '@components/auth/auth-card';
import { AuthPanel, type PanelVariant } from '@components/auth/auth-panel';

/**
 * The split: form left, product panel right. Below `lg` the panel drops entirely and the
 * form gets the whole viewport — a decorative half on a phone is just scrolling.
 */
export function AuthSplit({ panel = 'default', children }: { panel?: PanelVariant; children: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100dvh-1.5rem)] gap-3 max-lg:min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col">
        <header className="flex h-topbar flex-none items-center justify-between px-2 max-lg:px-page-x-mobile">
          <Link href="/" className="flex items-center gap-2" title="Nothing Left" aria-label="Nothing Left">
            <BrandMark size={22} />
            <Wordmark />
          </Link>
          <nav className="flex gap-4 text-xs text-text-secondary">
            <ExternalLink quiet href="https://nothingleft.dev/docs">
              Docs
            </ExternalLink>
            <ExternalLink quiet href="https://nothingleft.dev/solutions/self-hosting">
              Self-host
            </ExternalLink>
            <ExternalLink quiet href="https://github.com/nothingleft-dev/nothingleft">
              GitHub
            </ExternalLink>
          </nav>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-10 max-lg:px-page-x-mobile">
          <div className="comfortable-form w-full max-w-[400px]">{children}</div>
        </main>

        <footer className="flex flex-none items-center gap-4 px-2 py-4 text-2xs text-text-muted max-lg:px-page-x-mobile">
          <span>Open source, AGPL. Self-host free for teams of any size.</span>
        </footer>
      </div>

      <AuthPanel variant={panel} />
    </div>
  );
}
