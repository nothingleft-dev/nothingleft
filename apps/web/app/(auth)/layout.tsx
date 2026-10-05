import type { ReactNode } from 'react';

// The right panel is chosen per route by the page itself, so the layout only holds the
// two-column frame — docs/frontend-guide.md § Auth split.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-app p-3 max-lg:p-0">{children}</div>;
}
