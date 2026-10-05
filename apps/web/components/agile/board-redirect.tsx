'use client';

import { useEffect } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { PageSkeleton } from '@components/skeletons';
import { BoardPage, CURRENT_SPRINT } from '@components/agile/board-page';
import { useBoardBySlug, useBoards } from '@hooks/use-boards';
import { isApiError } from '@lib/api/errors';

/** `/projects/PROJ/board`: the project's first board, on its current sprint. */
export function FirstBoardRedirect({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const boards = useBoards(projectKey);
  const first = boards.data?.[0]?.slug;

  useEffect(() => {
    if (first) router.replace(`/projects/${projectKey}/board/${first}/${CURRENT_SPRINT}` as Route);
  }, [first, projectKey, router]);

  if (boards.isError) return <FormAlert title="This project's boards could not be loaded." />;
  if (boards.data && boards.data.length === 0) {
    return (
      <EmptyState
        title="This project has no board."
        description="A Project Admin can add one in the project settings."
      />
    );
  }
  return <PageSkeleton rows={4} />;
}

/** `/board/<slug>/…`: board slugs are unique in the organisation, so the board names its project. */
export function ShortBoard({ boardSlug, sprint }: { boardSlug: string; sprint: string }) {
  const board = useBoardBySlug(boardSlug);
  if (board.isPending) return <PageSkeleton rows={4} />;
  if (board.isError || !board.data) {
    return (
      <FormAlert
        title={
          isApiError(board.error) && board.error.status === 404
            ? board.error.message
            : 'This board could not be loaded.'
        }
      />
    );
  }
  return <BoardPage projectKey={board.data.project.key} boardSlug={board.data.slug} sprint={sprint} base="/board" />;
}
