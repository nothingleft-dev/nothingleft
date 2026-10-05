import type { Metadata } from 'next';
import { PageTitle } from '@components/page-title';
import { ShortcutsTable } from '@components/shortcuts/shortcuts-table';

export const metadata: Metadata = { title: 'Shortcuts' };

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle>Keyboard shortcuts</PageTitle>
      <p className="text-sm text-text-secondary">
        Single keys work anywhere outside a text field. Press <span className="font-mono">?</span> on any page to see
        this list over it.
      </p>
      <ShortcutsTable />
    </div>
  );
}
