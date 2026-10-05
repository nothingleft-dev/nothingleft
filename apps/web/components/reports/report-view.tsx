'use client';

import type { ReportName } from '@nothingleft/types';
import { DistributionReport } from '@components/reports/distribution-report';
import { MatrixReport } from '@components/reports/matrix-report';
import { BurndownReport } from '@components/reports/burndown-report';
import { AgeReport } from '@components/reports/age-report';
import { TimeReport } from '@components/reports/time-report';
import { GanttReport } from '@components/reports/gantt-report';

export function ReportView({ name }: { name: ReportName }) {
  switch (name) {
    case 'issues-per-assignee':
    case 'issues-per-project':
    case 'issues-per-field':
      return <DistributionReport key={name} name={name} />;
    case 'matrix':
      return <MatrixReport />;
    case 'burndown':
      return <BurndownReport />;
    case 'average-age':
      return <AgeReport />;
    case 'time':
      return <TimeReport />;
    case 'gantt':
      return <GanttReport />;
    default:
      return null;
  }
}
