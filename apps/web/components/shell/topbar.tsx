'use client';

import { useRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@components/ui/button';
import { Kbd } from '@components/kbd';
import { Skeleton } from '@components/ui/skeleton';
import { Breadcrumb } from '@components/shell/breadcrumb';
import { GlobalSearch, type GlobalSearchHandle } from '@components/shell/global-search';
import { InboxButton } from '@components/shell/inbox-button';
import { ThemeToggle } from '@components/shell/theme-toggle';
import { useCreateIssueDialog } from '@components/issues/create-issue-provider';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useShortcut } from '@hooks/use-shortcut';

/** `/` focuses the page's query bar when it has one, else the global search box. */
function useFocusSearch(global: React.RefObject<GlobalSearchHandle | null>) {
  return () => {
    const bar = document.querySelector<HTMLInputElement>('[data-query-bar] input');
    if (bar) bar.focus();
    else global.current?.focus();
  };
}

function CreateIssueButton({ onClick, slot }: { onClick?: () => void; slot?: 'loading' | 'empty' }) {
  const button = (
    <Button
      variant="outline"
      onClick={onClick}
      tabIndex={slot ? -1 : undefined}
      className={slot ? 'invisible gap-2' : 'gap-2'}
    >
      Create issue
      <Kbd className="max-lg:hidden">c</Kbd>
    </Button>
  );
  // The button's own width is held while roles load and for someone who may not create, so the search box never moves.
  if (slot === 'loading')
    return (
      <Skeleton aria-hidden className="max-md:hidden">
        {button}
      </Skeleton>
    );
  if (slot === 'empty')
    return (
      <div aria-hidden className="max-md:hidden">
        {button}
      </div>
    );
  return <div className="max-md:hidden">{button}</div>;
}

export function Topbar({ navigation, inOrganization }: { navigation?: ReactNode; inOrganization: boolean }) {
  const { openCreateIssue } = useCreateIssueDialog();
  const globalSearch = useRef<GlobalSearchHandle>(null);
  const focusSearch = useFocusSearch(globalSearch);
  useShortcut('/', focusSearch, inOrganization);
  const pathname = usePathname();
  const roles = useProjectRoles();
  const canCreate = inOrganization && roles.writable.length > 0 && pathname !== '/new-issue';
  return (
    <header className="flex h-topbar flex-none items-center gap-3 border-b px-page-x max-md:gap-1 max-md:px-page-x-mobile">
      {navigation}
      <div className="min-w-0 flex-1 pr-3 max-md:pl-1 max-md:pr-0">
        <Breadcrumb />
      </div>

      {inOrganization ? <GlobalSearch ref={globalSearch} /> : null}

      {canCreate ? (
        <>
          <CreateIssueButton onClick={() => openCreateIssue()} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Create issue"
            onClick={() => openCreateIssue()}
            className="md:hidden"
          >
            <Plus className="size-icon" />
          </Button>
        </>
      ) : inOrganization ? (
        <>
          <CreateIssueButton slot={roles.isPending && pathname !== '/new-issue' ? 'loading' : 'empty'} />
          <div aria-hidden className="w-11 flex-none md:hidden" />
        </>
      ) : null}

      <div className="flex items-center gap-3 max-md:gap-1">
        <InboxButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
