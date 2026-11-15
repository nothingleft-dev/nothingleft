'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle, CircleCheck, Info, Loader2, TriangleAlert } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@components/tooltip';
import { Toaster } from '@components/ui/sonner';
import { usePopoverScrollInDialogs } from '@hooks/use-popover-scroll';
import { isAuthRoute } from '@lib/auth-routes';
import { QueryProvider } from '@lib/query/provider';
import { toastRateLimited } from '@components/toast-error';

// The alert's own icons, so an error reads the same in a toast and in place.
const TOAST_ICONS = {
  success: <CircleCheck className="size-4" />,
  info: <Info className="size-4" />,
  warning: <TriangleAlert className="size-4" />,
  error: <AlertCircle className="size-4" />,
  loading: <Loader2 className="size-4 animate-spin" />,
};

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
      <QueryProvider onRateLimited={toastRateLimited}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" visibleToasts={3} icons={TOAST_ICONS} />
      </QueryProvider>
    </ThemeProvider>
  );
}
