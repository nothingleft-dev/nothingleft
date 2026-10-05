import type {
  AverageAgeReport,
  BurndownReport,
  DistributionReport,
  GanttReport,
  MatrixReport,
  ReportName,
  TimeReport,
  TimesheetReport,
  TimesheetWorkItem,
} from '@nothingleft/types';
import { api } from '@lib/api/client';
import { downloadCsv } from '@lib/api/csv';

export interface ReportDtos {
  'issues-per-assignee': DistributionReport;
  'issues-per-project': DistributionReport;
  'issues-per-field': DistributionReport;
  matrix: MatrixReport;
  burndown: BurndownReport;
  'average-age': AverageAgeReport;
  time: TimeReport;
  gantt: GanttReport;
  timesheet: TimesheetReport;
}

/** A report's parameters exactly as the API reads them from the query string. */
export type ReportQuery = Readonly<Record<string, string>>;

export const TIMESHEET_PAGE = 50;

export const getReport = <N extends ReportName>(name: N, query: ReportQuery) =>
  api.get<ReportDtos[N]>(`/v1/reports/${name}`, { query });

export const listTimesheetWorkItems = (query: ReportQuery, offset: number) =>
  api.get<TimesheetWorkItem[]>('/v1/reports/timesheet/work-items', {
    query: { ...query, limit: TIMESHEET_PAGE, offset },
  });

export const downloadReportCsv = (name: ReportName, query: ReportQuery) =>
  downloadCsv(`/v1/reports/${name}/export.csv`, query, `${name}.csv`);
