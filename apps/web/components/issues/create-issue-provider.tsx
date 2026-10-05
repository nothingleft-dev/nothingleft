'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { parseIssueKey, parseProjectKey } from '@nothingleft/format';
import { CreateIssueDialog } from '@components/issues/create-issue-dialog';
import { useShortcut } from '@hooks/use-shortcut';

export interface CreateIssuePreset {
  project: string;
  /** Files the new issue as a subtask of this key. */
  parent?: string;
}

interface CreateIssueContextValue {
  openCreateIssue: (preset?: CreateIssuePreset) => void;
}

const CreateIssueContext = createContext<CreateIssueContextValue>({ openCreateIssue: () => {} });

export const useCreateIssueDialog = () => useContext(CreateIssueContext);

/** The project the current page is about, if any: it wins over the remembered one. */
function routeProject(pathname: string): string | null {
  const [first, second] = pathname.split('/').filter(Boolean);
  if (first === 'projects' && second) return parseProjectKey(second);
  if (first === 'issue' && second) return parseIssueKey(second)?.projectKey ?? null;
  if (first === 'issues' && second) return parseProjectKey(second);
  return null;
}

export function CreateIssueProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<CreateIssuePreset | null>(null);
  const pathname = usePathname();
  const openCreateIssue = useCallback((next?: CreateIssuePreset) => {
    setPreset(next ?? null);
    setOpen(true);
  }, []);
  useShortcut('c', () => openCreateIssue(), !open && pathname !== '/new-issue');
  const value = useMemo(() => ({ openCreateIssue }), [openCreateIssue]);

  return (
    <CreateIssueContext.Provider value={value}>
      {children}
      {open ? (
        <CreateIssueDialog
          open
          onOpenChange={setOpen}
          routeProject={preset?.project ?? routeProject(pathname)}
          parent={preset?.parent ?? null}
        />
      ) : null}
    </CreateIssueContext.Provider>
  );
}
