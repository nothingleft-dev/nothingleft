import type { Metadata } from 'next';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ReportView } from '@components/reports/report-view';
import { isReportName, reportDef } from '@lib/reports/registry';

type Params = { report: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { report } = await params;
  return { title: isReportName(report) ? reportDef(report).title : 'Reports' };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { report } = await params;
  if (!isReportName(report)) notFound();
  if (report === 'timesheet') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams))
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
    const text = query.toString();
    redirect(`/timesheets${text ? `?${text}` : ''}` as Route);
  }
  return <ReportView name={report} />;
}
