'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@components/ui/button';
import { FullPageLoader } from '@components/full-page-loader';
import { Sidebar } from '@components/shell/sidebar';
import { MobileNavigation } from '@components/shell/mobile-navigation';
import { Topbar } from '@components/shell/topbar';
import { DeletionBanner } from '@components/shell/deletion-banner';
import { CreateIssueProvider } from '@components/issues/create-issue-provider';
import { ShellShortcuts } from '@components/shortcuts/shell-shortcuts';
import { useAccountTheme } from '@hooks/use-account-theme';
import { useSession } from '@hooks/use-session';
import { useShellData } from '@hooks/use-shell-data';
import { useSidebarCollapsed } from '@hooks/use-sidebar-collapsed';
import { setProfileTimeZone } from '@lib/datetime';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { collapsed, toggle } = useSidebarCollapsed();
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const data = useShellData(user);
  useAccountTheme(user?.preferences.theme);
  // During render, not in an effect: the children below format dates in this same pass.
  setProfileTimeZone(user?.timezone);

  // Nobody should meet an empty shell: an account with no organisation belongs in the
  // welcome flow - except on the landing page, which states the situation and offers the
  // two ways out (onboarding.md § Returning-user landing).
  const pathname = usePathname();
  const homeless = user !== null && !data.isPending && data.organizations.length === 0 && pathname !== '/';
  useEffect(() => {
    if (homeless) router.replace('/welcome');
  }, [homeless, router]);

  if (session.status === 'loading') return <FullPageLoader label="Checking your session" />;

  // The API client already navigated to /sign-in on the 401; this covers the moment in between.
  if (session.status === 'signed-out') return <FullPageLoader label="Taking you to sign-in" />;

  if (homeless) return <FullPageLoader label="Setting things up" />;

  if (session.status === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center bg-app px-page-x-mobile">
        <div className="flex max-w-sm flex-col items-start gap-3">
          <h1 className="text-xl font-semibold tracking-tight">The server could not be reached</h1>
          <p className="text-text-secondary">Nothing was lost. Check the connection, then try again.</p>
          <Button onClick={session.retry}>Try again</Button>
        </div>
      </main>
    );
  }

  return (
    <CreateIssueProvider>
      <ShellShortcuts />
      <div className="flex h-dvh overflow-hidden">
        <div className="max-md:hidden">
          <Sidebar collapsed={collapsed} onToggle={toggle} user={user} data={data} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar navigation={<MobileNavigation user={user} data={data} />} />
          <main data-scroll-root className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-page-x py-5 max-md:px-page-x-mobile">
              {data.org ? <DeletionBanner organization={data.org} /> : null}
              {children}
            </div>
          </main>
        </div>
      </div>
    </CreateIssueProvider>
  );
}
