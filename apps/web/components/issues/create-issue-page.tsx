'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@components/ui/button';
import { PageTitle } from '@components/page-title';
import { CreateButton } from '@components/issues/create-issue-dialog';
import {
  DraftError,
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

  if (draft.noWritableProject) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-4">
        <PageTitle>New issue</PageTitle>
        <NoWritableProject />
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      // Below the two-column width the fields come before the actions, so the form reads top to bottom.
      className="grid items-start gap-x-10 gap-y-6 min-[1100px]:grid-cols-[minmax(0,1fr)_var(--rail)] min-[1100px]:grid-rows-[auto_1fr]"
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
      <div className="flex min-w-0 max-w-[900px] flex-col gap-4" aria-busy={draft.pending}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PageTitle>New issue</PageTitle>
          <DraftProjectPicker draft={draft} />
          {draft.parent ? <DraftParentChip draft={draft} /> : null}
        </div>
        <DraftText draft={draft} large withLinks />
      </div>
      <aside
        aria-label="Issue fields"
        className="-mx-2 min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:col-start-2 min-[1100px]:row-span-2 min-[1100px]:row-start-1 min-[1100px]:mx-0"
      >
        {draft.project ? <DraftPanel draft={draft} project={draft.project} /> : null}
      </aside>
      {/* Below the two-column width the fields push the actions out of view, so they pin to the bottom. */}
      <div className="sticky bottom-0 z-10 -mx-page-x flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t bg-background px-page-x py-3 max-md:-mx-page-x-mobile max-md:px-page-x-mobile min-[1100px]:static min-[1100px]:col-start-1 min-[1100px]:row-start-2 min-[1100px]:mx-0 min-[1100px]:max-w-[900px] min-[1100px]:border-0 min-[1100px]:bg-transparent min-[1100px]:p-0">
        <DraftError draft={draft} />
        <div className="flex flex-none items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <CreateButton draft={draft} />
        </div>
      </div>
    </form>
  );
}
