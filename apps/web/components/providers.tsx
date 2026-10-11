'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@components/ui/tooltip';
import { Toaster } from '@components/ui/sonner';
import { usePopoverScrollInDialogs } from '@hooks/use-popover-scroll';
import { isAuthRoute } from '@lib/auth-routes';
import { QueryProvider } from '@lib/query/provider';

export function Providers({ children }: { children: ReactNode }) {
  usePopoverScrollInDialogs();
  const pathname = usePathname();
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={isAuthRoute(pathname) ? 'light' : undefined}
    >
      <QueryProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" visibleToasts={3} />
      </QueryProvider>
    </ThemeProvider>
  );
}
