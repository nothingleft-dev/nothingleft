import { redirect } from 'next/navigation';
import type { Route } from 'next';

type Params = { board: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { board } = await params;
  redirect(`/board/${board}/current` as Route);
}
