'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { BOARD_CURRENT_SPRINT } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { PageTitle } from '@components/page-title';
import { LoadError, errorDetail, notFoundOn404 } from '@components/query-state';
import { PageSkeleton } from '@components/skeletons';
import { BoardPage } from '@components/agile/board-page';
import { useBoardBySlug, useBoards } from '@hooks/use-boards';
import { useProjectRoles } from '@hooks/use-project-roles';

function BoardEntry({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 items-center">
        <PageTitle>Board</PageTitle>
      </div>
      {children}
    </div>
  );
}

/** `/projects/PROJ/board`: the project's first board, on its current sprint. */
export function FirstBoardRedirect({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const boards = useBoards(projectKey);
  const first = boards.data?.[0]?.slug;
  const canManage = useProjectRoles().canAdmin(projectKey);

  useEffect(() => {
    if (first) router.replace(`/projects/${projectKey}/board/${first}/${BOARD_CURRENT_SPRINT}` as Route);
  }, [first, projectKey, router]);

  if (boards.isError && !boards.data) {
    notFoundOn404(boards.error);
    return (
      <BoardEntry>
        <LoadError onRetry={() => void boards.refetch()} detail={errorDetail(boards.error)}>
          This project’s boards could not be loaded.
        </LoadError>
      </BoardEntry>
    );
  }
  if (boards.data && boards.data.length === 0) {
    return (
      <BoardEntry>
        <EmptyState
          className="max-w-xl"
          title="This project has no board."
          description={
            canManage
              ? 'Add one to follow a sprint as columns of cards.'
              : 'A Project Admin can add one in the project settings.'
          }
          action={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {canManage ? (
                <Button size="sm" asChild>
                  <Link href={`/projects/${projectKey}/settings?tab=boards` as Route}>Add a board</Link>
                </Button>
              ) : null}
              <Link href={`/projects/${projectKey}/issues` as Route} className="action-link text-sm">
                Open the issues
              </Link>
            </div>
          }
        />
      </BoardEntry>
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
