import type { Metadata } from 'next';
import { ReportIndex } from '@components/reports/report-index';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return <ReportIndex />;
}
