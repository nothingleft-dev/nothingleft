import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseProjectKey } from '@nothingleft/format';
import { BoardPage } from '@components/agile/board-page';

type Params = { key: string; board: string; sprint: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  return { title: `${parseProjectKey(key) ?? key} board` };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { key, board, sprint } = await params;
  const parsed = parseProjectKey(key);
  if (!parsed) notFound();

  return (
    <BoardPage
      projectKey={parsed}
      boardSlug={decodeURIComponent(board)}
      sprint={decodeURIComponent(sprint)}
      base={`/projects/${parsed}/board`}
    />
  );
}
