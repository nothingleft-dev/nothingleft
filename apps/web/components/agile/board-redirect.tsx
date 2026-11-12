'use client';

import { useEffect } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { BOARD_CURRENT_SPRINT } from '@nothingleft/types';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail, notFoundOn404 } from '@components/query-state';
import { PageSkeleton } from '@components/skeletons';
import { BoardPage } from '@components/agile/board-page';
import { useBoardBySlug, useBoards } from '@hooks/use-boards';

/** `/projects/PROJ/board`: the project's first board, on its current sprint. */
export function FirstBoardRedirect({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const boards = useBoards(projectKey);
  const first = boards.data?.[0]?.slug;

  useEffect(() => {
    if (first) router.replace(`/projects/${projectKey}/board/${first}/${BOARD_CURRENT_SPRINT}` as Route);
  }, [first, projectKey, router]);

  if (boards.isError && !boards.data) {
    notFoundOn404(boards.error);
    return (
      <LoadError onRetry={() => void boards.refetch()} detail={errorDetail(boards.error)}>
        This project’s boards could not be loaded.
      </LoadError>
    );
  }
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
  if (!board.data) {
    notFoundOn404(board.error);
    return (
      <LoadError onRetry={() => void board.refetch()} detail={errorDetail(board.error)}>
        This board could not be loaded.
      </LoadError>
    );
  }
  return <BoardPage projectKey={board.data.project.key} boardSlug={board.data.slug} sprint={sprint} base="/board" />;
}
