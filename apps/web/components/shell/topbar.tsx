'use client';

import { useRef, type ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { Kbd } from '@components/kbd';
import { Breadcrumb } from '@components/shell/breadcrumb';
import { GlobalSearch, type GlobalSearchHandle } from '@components/shell/global-search';
import { InboxButton } from '@components/shell/inbox-button';
import { ThemeToggle } from '@components/shell/theme-toggle';
import { useCreateIssueDialog } from '@components/issues/create-issue-provider';
import { useShortcut } from '@hooks/use-shortcut';

/** `/` focuses the page's query bar when it has one, else the global search box. */
function useFocusSearch(global: React.RefObject<GlobalSearchHandle | null>) {
  return () => {
    const bar = document.querySelector<HTMLInputElement>('[data-query-bar] input');
    if (bar) bar.focus();
    else global.current?.focus();
  };
}

export function Topbar({ navigation }: { navigation?: ReactNode }) {
  const { openCreateIssue } = useCreateIssueDialog();
  const globalSearch = useRef<GlobalSearchHandle>(null);
  const focusSearch = useFocusSearch(globalSearch);
  useShortcut('/', focusSearch);
  return (
    <header className="flex h-topbar flex-none items-center gap-3 border-b px-page-x max-md:px-page-x-mobile">
      {navigation}
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>

      <GlobalSearch ref={globalSearch} />

      <Button onClick={() => openCreateIssue()} className="gap-2 max-md:hidden">
        Create issue
        <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">c</Kbd>
      </Button>

      <div className="flex items-center gap-1">
        <InboxButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
