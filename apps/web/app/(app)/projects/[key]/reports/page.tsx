import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseProjectKey } from '@nothingleft/format';
import { ReportIndex } from '@components/reports/report-index';

type Params = { key: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  return { title: `${parseProjectKey(key) ?? key} reports` };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const parsed = parseProjectKey(key);
  if (!parsed) notFound();

  return <ReportIndex project={parsed} />;
}
