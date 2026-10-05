import { redirect } from 'next/navigation';
import type { Route } from 'next';

type Params = { key: string; board: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { key, board } = await params;
  redirect(`/projects/${key}/board/${board}/current` as Route);
}
