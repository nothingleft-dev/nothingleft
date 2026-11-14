import type { ReactNode } from 'react';
import { Archive } from 'lucide-react';

/** The one line an archived project's pages open with: what is read-only, and what still works. */
export function ArchivedNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-md bg-inset px-3 py-2 text-xs text-text-secondary">
      <Archive aria-hidden className="size-icon-sm flex-none" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
