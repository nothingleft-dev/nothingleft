'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@components/ui/tooltip';
import { Toaster } from '@components/ui/sonner';
import { usePopoverScrollInDialogs } from '@hooks/use-popover-scroll';
import { QueryProvider } from '@lib/query/provider';

export function Providers({ children }: { children: ReactNode }) {
  usePopoverScrollInDialogs();
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" visibleToasts={3} />
      </QueryProvider>
    </ThemeProvider>
  );
}
