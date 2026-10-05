'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog';
import { ShortcutsTable } from '@components/shortcuts/shortcuts-table';
import { useSession } from '@hooks/use-session';
import { useShortcut, useSequenceShortcut } from '@hooks/use-shortcut';
import { GO_TO, SEQUENCE_WINDOW_MS } from '@lib/shortcuts';

// `g i` and `g r` stay inside the project on screen, if there is one; `g b` falls back to the last one visited.
function projectKeyOf(pathname: string): string | null {
  return (
    /^\/projects\/([^/]+)/.exec(pathname)?.[1] ?? /^\/issue\/([A-Za-z][A-Za-z0-9]*)-\d+/.exec(pathname)?.[1] ?? null
  );
}

export function ShellShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const lastProject = session.status === 'signed-in' ? session.user.preferences.last_project_key : null;
  const [open, setOpen] = useState(false);

  useShortcut('?', () => setOpen(true), pathname !== '/shortcuts');

  const handlers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(GO_TO).map(([key, go]) => [
          key,
          () => {
            if (key === 'b') {
              const project = projectKeyOf(pathname) ?? lastProject;
              return router.push(project ? `/projects/${project}/board` : go.path);
            }
            const project = key === 'i' || key === 'r' ? projectKeyOf(pathname) : null;
            router.push(project ? `/projects/${project}/${key === 'r' ? 'reports' : 'issues'}` : go.path);
          },
        ]),
      ),
    [pathname, router, lastProject],
  );
  useSequenceShortcut('g', handlers, SEQUENCE_WINDOW_MS);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100dvh-64px)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-xs text-text-secondary">
            Single keys work anywhere outside a text field.{' '}
            <Link href="/shortcuts" onClick={() => setOpen(false)} className="text-brand-text hover:underline">
              Open as a page
            </Link>
          </DialogDescription>
        </DialogHeader>
        <ShortcutsTable />
      </DialogContent>
    </Dialog>
  );
}
