import type { Metadata } from 'next';
import { TimesheetReport } from '@components/reports/timesheet-report';

export const metadata: Metadata = { title: 'Timesheets' };

export default function Page() {
  return <TimesheetReport />;
}
