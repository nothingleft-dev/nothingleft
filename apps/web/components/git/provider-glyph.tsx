import type { GitProviderKind } from '@nothingleft/types';
import { cn } from '@lib/utils';

// Glyphs in currentColor, never the providers' brand colours (design § 8c: provider marks are ink).
export function ProviderGlyph({ provider, className }: { provider: GitProviderKind; className?: string }) {
  if (provider === 'gitlab') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn('size-icon-sm flex-none', className)}>
        <path d="m23.6 9.6-.03-.09-3.3-8.6a.86.86 0 0 0-1.63.06l-2.22 6.8H7.58L5.36.97A.86.86 0 0 0 3.73.91L.43 9.51l-.03.09a6.1 6.1 0 0 0 2.02 7.04l.01.01.03.02 5.05 3.78 2.5 1.89 1.52 1.15a1.02 1.02 0 0 0 1.24 0l1.52-1.15 2.5-1.89 5.08-3.8.01-.01a6.1 6.1 0 0 0 2.02-7.03Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn('size-icon-sm flex-none', className)}>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
