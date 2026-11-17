import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '@components/shell/brand';
import { ExternalLink } from '@components/auth/auth-card';
import { AuthPanel, type PanelVariant } from '@components/auth/auth-panel';
import { cn } from '@lib/utils';

/**
 * The split: form left, product panel right. Below `lg` the panel drops entirely and the
 * form gets the whole viewport — a decorative half on a phone is just scrolling. Utility
 * pages (unsubscribe, git email) pass `panel="none"`: they are not selling anything.
 */
export function AuthSplit({ panel = 'default', children }: { panel?: PanelVariant | 'none'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid min-h-[calc(100dvh-1.5rem)] gap-3 max-lg:min-h-dvh',
        panel === 'none' ? null : 'lg:grid-cols-2',
      )}
    >
      <div className="flex flex-col">
        <header className="flex h-10 flex-none items-center justify-between px-3 max-lg:h-topbar max-lg:px-page-x-mobile">
          <Link
            href="/"
            className="-mx-1.5 flex items-center gap-2 rounded-sm px-1.5 py-1 transition-colors duration-(--dur-fast) hover:bg-hover"
            title="Nothing Left"
            aria-label="Nothing Left"
          >
            <BrandMark size={22} />
            <Wordmark />
          </Link>
          <nav className="flex gap-4 text-xs text-text-secondary">
            <ExternalLink quiet href="https://nothingleft.dev/docs">
              Docs
            </ExternalLink>
            <span className="max-sm:hidden">
              <ExternalLink quiet href="https://nothingleft.dev/solutions/self-hosting">
                Self-host
              </ExternalLink>
            </span>
            <span className="max-sm:hidden">
              <ExternalLink quiet href="https://github.com/nothingleft-dev/nothingleft">
                GitHub
              </ExternalLink>
            </span>
          </nav>
        </header>

        {/* Top-anchored, not centred: an alert appearing above the fields must not move the title. */}
        <main className="flex flex-1 justify-center px-6 pt-[clamp(2rem,8vh,4.5rem)] pb-10 max-lg:px-page-x-mobile max-lg:pt-10">
          <div className="comfortable-form w-full max-w-[400px]">{children}</div>
        </main>

        <footer className="flex flex-none items-center gap-4 px-3 py-4 text-2xs text-text-muted max-lg:px-page-x-mobile">
          <span>Open source, AGPL. Self-host free for teams of any size.</span>
        </footer>
      </div>

      {panel === 'none' ? null : <AuthPanel variant={panel} />}
    </div>
  );
}
