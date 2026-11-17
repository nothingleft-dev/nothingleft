import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-md bg-inset px-3 py-2 text-xs text-text-secondary">
      <Lock aria-hidden className="size-icon-sm flex-none" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
