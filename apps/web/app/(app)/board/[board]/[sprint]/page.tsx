import type { Metadata } from 'next';
import { ShortBoard } from '@components/agile/board-redirect';

type Params = { board: string; sprint: string };

export const metadata: Metadata = { title: 'Board' };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { board, sprint } = await params;
  return <ShortBoard boardSlug={decodeURIComponent(board)} sprint={decodeURIComponent(sprint)} />;
}
