'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@components/ui/button';
import { Kbd } from '@components/kbd';
import { PageTitle } from '@components/page-title';
import {
  DraftPanel,
  DraftParentChip,
  DraftProjectPicker,
  DraftText,
  NoWritableProject,
} from '@components/issues/draft-fields';
import { takeParkedDraft, useIssueDraft } from '@components/issues/use-issue-draft';
import { issuePath } from '@lib/issue-path';

/** The create form with room to write: text on the left, the issue page's field column on the right. */
export function CreateIssuePage({ projectKey }: { projectKey: string | null }) {
  const router = useRouter();
  const [initial] = useState(takeParkedDraft);
  const draft = useIssueDraft({
    routeProject: projectKey,
    initial,
    onCreated: issue => router.push(issuePath(issue)),
  });

  if (draft.noWritableProject) return <NoWritableProject />;

  return (
    <form
      noValidate
      className="grid items-start gap-10 min-[1100px]:grid-cols-[minmax(0,1fr)_var(--rail)]"
      onSubmit={event => {
        event.preventDefault();
        draft.submit();
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          draft.submit();
        }
      }}
    >
      <div className="flex min-w-0 max-w-[900px] flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <PageTitle>New issue</PageTitle>
          <span className="text-text-muted">in</span>
          <DraftProjectPicker draft={draft} />
          {draft.parent ? <DraftParentChip draft={draft} /> : null}
        </div>
        <DraftText draft={draft} large withLinks />
        <div className="flex items-center gap-2">
          <Button type="submit" className="gap-2" disabled={!draft.canSubmit}>
            {draft.pending ? 'Creating…' : draft.uploader.busy ? 'Uploading…' : 'Create issue'}
            <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">⌘↵</Kbd>
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
      <aside aria-label="Issue fields" className="min-[1100px]:sticky min-[1100px]:top-0">
        {draft.project ? <DraftPanel draft={draft} project={draft.project} /> : null}
      </aside>
    </form>
  );
}
